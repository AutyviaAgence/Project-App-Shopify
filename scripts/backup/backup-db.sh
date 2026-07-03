#!/usr/bin/env bash
# =====================================================================
#  Backup quotidien de la base Xeyo (Supabase self-hosted sur le VPS)
#
#  À installer SUR LE VPS (voir docs/BACKUPS.md) :
#    - dump compressé (pg_dump --format=custom) via le conteneur Postgres
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

# ── Dump ──────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/xeyo_${STAMP}.dump"

echo "[$(date -Is)] dump → $FILE"
# --format=custom : compressé + restaurable sélectivement avec pg_restore.
# supabase_admin = superuser réel de l'image Supabase (le rôle postgres est bridé).
docker exec "$CONTAINER" pg_dump -U supabase_admin -d postgres --format=custom \
  > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -Is)] dump OK ($SIZE)"

# Garde-fou : un dump anormalement petit (< 100 Ko) signale un problème.
if [ "$(stat -c%s "$FILE")" -lt 100000 ]; then
  echo "[$(date -Is)] ⚠️ ALERTE : dump suspicieusement petit ($SIZE) — à vérifier !"
fi

# ── Rotation locale ──────────────────────────────────────────────────
find "$BACKUP_DIR" -name 'xeyo_*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Is)] rotation OK (rétention ${RETENTION_DAYS}j, $(ls "$BACKUP_DIR"/xeyo_*.dump 2>/dev/null | wc -l) dumps locaux)"

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
