'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = {
  installed: boolean
  linked?: boolean
  shop_name?: string | null
  agent?: { id: string; name: string } | null
  documents?: number
}

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://shopify.autyvia.fr'

export default function ShopifyEmbeddedClient() {
  const searchParams = useSearchParams()
  const shop = searchParams.get('shop') || ''

  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!shop) { setLoading(false); return }
    try {
      const res = await fetch(`/api/shopify/status?shop=${encodeURIComponent(shop)}`)
      const json = await res.json()
      if (res.ok) setStatus(json.data)
    } finally {
      setLoading(false)
    }
  }, [shop])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleConnect() {
    setConnecting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      })
      const json = await res.json()
      if (res.status === 401) {
        // Pas connecté à Xeyo : rediriger vers le login de l'app (nouvel onglet)
        setMessage('Connectez-vous d\'abord à votre compte Xeyo, puis revenez ici.')
        window.open(`${APP_BASE}/login`, '_blank')
        return
      }
      if (!res.ok && !json.data?.linked) {
        throw new Error(json.error || 'Erreur de connexion')
      }
      await fetchStatus()
      setMessage(
        json.data?.documents != null
          ? `Boutique connectée ! Agent créé avec ${json.data.documents} source(s) de connaissance.`
          : 'Boutique connectée.'
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setConnecting(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Chargement…</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Xeyo — WhatsApp Support &amp; Chat</h1>
        <p className="text-sm text-gray-500">
          {status?.shop_name ? `Boutique : ${status.shop_name}` : shop || 'Boutique Shopify'}
        </p>
      </header>

      {/* État de la connexion */}
      <section className="rounded-xl border p-5 space-y-4">
        {!status?.linked ? (
          <>
            <div>
              <h2 className="font-medium">Connectez votre boutique</h2>
              <p className="text-sm text-gray-500 mt-1">
                Xeyo va lire votre catalogue, vos pages et vos politiques pour créer
                automatiquement un agent IA qui répond à vos clients sur WhatsApp
                (produits, commandes, SAV, retours).
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {connecting ? 'Configuration en cours…' : 'Connecter ma boutique'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              <h2 className="font-medium">Boutique connectée</h2>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Agent IA</dt>
                <dd className="font-medium">{status.agent?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Base de connaissances</dt>
                <dd className="font-medium">{status.documents ?? 0} source(s)</dd>
              </div>
            </dl>
            <a
              href={APP_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Ouvrir le tableau de bord Xeyo
            </a>
          </>
        )}

        {message && <p className="text-sm text-gray-600">{message}</p>}
      </section>

      <p className="text-xs text-gray-400">
        Besoin d&apos;aide ? Rendez-vous sur votre tableau de bord Xeyo pour connecter
        WhatsApp et personnaliser votre agent.
      </p>
    </div>
  )
}
