# Zombie Cleaner — Installation VPS

Service HTTP minimaliste qui supprime les instances zombie d'Evolution API directement depuis Prisma.

## Installation sur le VPS

```sh
# 1. Créer le dossier
mkdir -p /opt/zombie-cleaner
cd /opt/zombie-cleaner

# 2. Copier index.js (ou git clone)
# Copier le contenu de vps-zombie-cleaner/index.js ici

# 3. Initialiser npm
npm init -y

# 4. Copier le service systemd
cp zombie-cleaner.service /etc/systemd/system/

# 5. Éditer le secret dans le service
nano /etc/systemd/system/zombie-cleaner.service
# Remplacer CHANGE_ME_STRONG_SECRET par un vrai secret

# 6. Activer et démarrer
systemctl daemon-reload
systemctl enable zombie-cleaner
systemctl start zombie-cleaner

# 7. Vérifier
systemctl status zombie-cleaner
curl -s -X DELETE http://127.0.0.1:3001/instance/test \
  -H "x-zombie-secret: VOTRE_SECRET"
```

## Variables Dokploy à ajouter

```
ZOMBIE_CLEANER_URL=http://127.0.0.1:3001
ZOMBIE_CLEANER_SECRET=VOTRE_SECRET
```

## Test

```sh
curl -s -X DELETE "http://127.0.0.1:3001/instance/wa-xxxxx" \
  -H "x-zombie-secret: VOTRE_SECRET"
# → {"success":true,"message":"Instance deleted from Prisma"}
```
