# Backups DB — installation & restauration

> **Le risque n°1 du self-host** : sans backup hors du VPS, un crash disque =
> toutes les données clients perdues (contacts, conversations, messages,
> commandes). Ce guide installe un backup quotidien automatique en ~5 minutes.

## 1. Installer le script sur le VPS

Depuis ton PC, copie le script sur le VPS :
```bash
scp scripts/backup/backup-db.sh ubuntu@92.222.178.93:/home/ubuntu/backup-db.sh
```

Puis en SSH (`ssh ubuntu@92.222.178.93`) :
```bash
chmod +x /home/ubuntu/backup-db.sh
mkdir -p /home/ubuntu/backups

# Test immédiat (doit produire un .dump de plusieurs Mo) :
/home/ubuntu/backup-db.sh
ls -lh /home/ubuntu/backups/
```

## 2. Automatiser (cron quotidien à 4h)

```bash
crontab -e
# ajouter cette ligne :
0 4 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

Vérifier plus tard que ça tourne : `tail /home/ubuntu/backups/backup.log`

## 3. ⚠️ Copie HORS-VPS (fortement recommandé)

Un backup sur le même disque ne protège PAS d'un crash disque/VPS supprimé.
Installer rclone + un stockage externe pas cher (Backblaze B2 ≈ 0,005$/Go/mois,
ou S3/Scaleway) :

```bash
sudo apt install rclone   # ou: curl https://rclone.org/install.sh | sudo bash
rclone config              # créer un remote, ex. nom "b2", type Backblaze B2
```

Puis éditer `/home/ubuntu/backup-db.sh` :
```bash
RCLONE_REMOTE="b2:xeyo-backups"
```
Le prochain run enverra chaque dump vers le bucket automatiquement.

## 4. Restaurer (le jour J)

```bash
# 1. Copier le dump sur le VPS (si restauré depuis le remote) :
rclone copy b2:xeyo-backups/xeyo_YYYYMMDD_HHMMSS.dump /home/ubuntu/backups/

# 2. Restaurer dans le conteneur (⚠️ écrase les données actuelles) :
docker exec -i app-shopify-supabase-tf6tps-supabase-db \
  pg_restore -U supabase_admin -d postgres --clean --if-exists \
  < /home/ubuntu/backups/xeyo_YYYYMMDD_HHMMSS.dump
```

`--clean --if-exists` supprime puis recrée les objets → restauration idempotente.
Tester la procédure UNE FOIS avant d'en avoir vraiment besoin (sur une base de
test ou en environnement jetable) — un backup jamais testé n'est pas un backup.

## Ce qui est couvert / pas couvert

| Donnée | Couverte ? |
|---|---|
| Tables (contacts, conversations, messages, commandes, config...) | ✅ |
| Auth (users, sessions) & Storage metadata | ✅ (schéma auth/storage inclus dans le dump) |
| **Fichiers Storage** (médias uploadés) | ❌ — volume Docker séparé. Optionnel : ajouter `tar` du volume storage au script si les médias deviennent critiques. |

## Rappels

- Rétention locale : 14 jours (modifiable via `RETENTION_DAYS`).
- Le script alerte dans le log si un dump est anormalement petit (< 100 Ko).
- Superuser du conteneur = `supabase_admin` (le rôle `postgres` est bridé).
