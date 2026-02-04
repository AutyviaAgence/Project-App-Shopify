#!/bin/bash
# Script cron pour lancer les campagnes programmées
# À ajouter dans crontab : * * * * * /chemin/vers/cron-campaigns.sh >> /var/log/cron-campaigns.log 2>&1

# Configuration
APP_URL="${APP_URL:-https://app.autyvia.fr}"
CRON_SECRET="${CRON_SECRET:-your_cron_secret}"

# Appel de l'endpoint
curl -s -X GET \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/campaigns"

echo ""
echo "--- $(date) ---"
