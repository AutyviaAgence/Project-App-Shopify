#!/usr/bin/env bash
# =====================================================================
#  Backup quotidien de la base Xeyo (Supabase self-hosted sur le VPS)
#
#  À installer SUR LE VPS (voir docs/BACKUPS.md) :
#    - dump compressé (pg_dump --format=custom) via le conteneur Postgres
#    - CHIFFRÉ en AES-256 : les dumps contiennent numéros de téléphone,
#      conversations, jetons Shopify/WABA. Ils ne doivent jamais reposer en
#      clair — ni sur le VPS, ni chez l'hébergeur du remote.
#    - rotation : garde les 14 derniers jours en local
#    - copie hors-VPS optionnelle via rclone (fortement recommandé :
#      un backup sur le même disque ne protège pas d'un crash disque)
#
#  Cron conseillé (4h du matin, heure serveur UTC) :
#    0 4 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
# =====================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
CONTAINER="app-shopify-supabase-tf6tps-supabase-db"
BACKUP_DIR="/home/ubuntu/backups"
RETENTION_DAYS=14
# Copie hors-VPS (optionnel) : configurer un remote rclone (ex. Backblaze B2,
# S3, Scaleway...) puis renseigner son nom ici. Vide = pas de copie distante.
RCLONE_REMOTE=""            # ex: "b2:xeyo-backups"

# Passphrase de chiffrement — à poser sur le VPS, JAMAIS dans git :
#   openssl rand -base64 48 > /home/ubuntu/.backup-passphrase
#   chmod 600 /home/ubuntu/.backup-passphrase
#
# ⚠️ RECOPIE-LA DANS TON GESTIONNAIRE DE MOTS DE PASSE.
#    Elle n'existe nulle part ailleurs : la perdre rend TOUS les backups
#    définitivement irrécupérables. Un backup qu'on ne peut pas restaurer ne
#    vaut rien — et un VPS détruit emporte la passphrase avec lui.
PASSPHRASE_FILE="/home/ubuntu/.backup-passphrase"

# ── Pré-vol ───────────────────────────────────────────────────────────
if [ ! -r "$PASSPHRASE_FILE" ]; then
  echo "[$(date -Is)] ❌ passphrase introuvable ($PASSPHRASE_FILE)"
  echo "   Créer :  openssl rand -base64 48 > $PASSPHRASE_FILE && chmod 600 $PASSPHRASE_FILE"
  echo "   On ARRÊTE : mieux vaut pas de backup qu'un backup en clair."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/xeyo_${STAMP}.dump.enc"

# ── Dump + chiffrement (en flux) ──────────────────────────────────────
# Le dump en clair ne touche JAMAIS le disque : pg_dump écrit dans un pipe que
# openssl chiffre à la volée. Rien à effacer derrière, rien à récupérer sur le
# disque après coup.
#
# -pbkdf2 -iter 100000 : dérivation de clé robuste. Sans ces options, openssl
# retombe sur un KDF obsolète (MD5, 1 itération) et la passphrase devient
# cassable par force brute.
echo "[$(date -Is)] dump + chiffrement → $FILE"
docker exec "$CONTAINER" pg_dump -U supabase_admin -d postgres --format=custom \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
      -pass file:"$PASSPHRASE_FILE" \
      -out "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -Is)] dump chiffré OK ($SIZE)"

# Garde-fou : un dump anormalement petit (< 100 Ko) signale un problème.
if [ "$(stat -c%s "$FILE")" -lt 100000 ]; then
  echo "[$(date -Is)] ⚠️ ALERTE : dump suspicieusement petit ($SIZE) — à vérifier !"
fi

# Vérifie que le fichier est réellement DÉCHIFFRABLE et que c'est bien un dump
# Postgres (en-tête « PGDMP »). Un backup chiffré qu'on ne sait pas restaurer est
# un faux filet de sécurité : autant s'en apercevoir maintenant.
#
# ⚠️ Ne PAS écrire `openssl ... | head -c 5` : head ferme le pipe dès le 5e octet,
# openssl prend un SIGPIPE et meurt — avec `set -o pipefail`, tout le pipeline est
# déclaré en échec alors que le déchiffrement était parfait (faux négatif).
# On déchiffre donc vers un fichier temporaire, et on lit l'en-tête dessus.
TMP_CHECK="$(mktemp)"
trap 'rm -f "$TMP_CHECK"' EXIT

if openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
     -pass file:"$PASSPHRASE_FILE" -in "$FILE" -out "$TMP_CHECK" 2>/dev/null \
   && [ "$(head -c 5 "$TMP_CHECK")" = "PGDMP" ]; then
  echo "[$(date -Is)] vérification OK (déchiffrable, en-tête pg_dump valide)"
else
  echo "[$(date -Is)] ❌ ALERTE : le backup ne se déchiffre pas — NE PAS s'y fier !"
  exit 1
fi
rm -f "$TMP_CHECK"

# ── Rotation locale ──────────────────────────────────────────────────
find "$BACKUP_DIR" -name 'xeyo_*.dump.enc' -mtime +"$RETENTION_DAYS" -delete
# Supprime aussi les dumps EN CLAIR laissés par la version précédente du script :
# les laisser traîner annulerait tout le bénéfice du chiffrement.
find "$BACKUP_DIR" -name 'xeyo_*.dump' -type f -delete 2>/dev/null || true
echo "[$(date -Is)] rotation OK (rétention ${RETENTION_DAYS}j, $(ls "$BACKUP_DIR"/xeyo_*.dump.enc 2>/dev/null | wc -l) dumps locaux)"

# ── Copie hors-VPS (si configurée) ───────────────────────────────────
if [ -n "$RCLONE_REMOTE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$FILE" "$RCLONE_REMOTE/" --no-traverse
    echo "[$(date -Is)] copie distante OK → $RCLONE_REMOTE"
  else
    echo "[$(date -Is)] ⚠️ rclone non installé — copie distante sautée"
  fi
else
  echo "[$(date -Is)] (pas de remote rclone configuré — backup LOCAL uniquement)"
fi

echo "[$(date -Is)] terminé."
