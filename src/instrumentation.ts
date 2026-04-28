export async function register() {
  // Uniquement côté serveur Node.js (pas dans le Edge runtime)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Appeler le watch Gmail au démarrage pour éviter de perdre les notifications après un redéploiement
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const cronSecret = process.env.CRON_SECRET

  if (!appUrl || !cronSecret) return

  // Délai court pour laisser le serveur finir de démarrer
  setTimeout(() => {
    fetch(`${appUrl}/api/email-sessions/watch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
      .then((r) => r.json())
      .then((data) => console.log('[Boot] Gmail watch renewed:', data))
      .catch((err) => console.warn('[Boot] Gmail watch renewal failed:', err))
  }, 5_000)
}
