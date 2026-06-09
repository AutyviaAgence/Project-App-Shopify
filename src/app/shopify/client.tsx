'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

type Status = {
  installed: boolean
  linked?: boolean
  shop_name?: string | null
  plan?: string
  subscription_status?: string
  agent?: { id: string; name: string } | null
  documents?: number
}

const PLANS = [
  { id: 'starter', name: 'Starter', price: 29, desc: '200 conversations IA / mois' },
  { id: 'growth', name: 'Growth', price: 79, desc: '1 000 conversations + actions Shopify' },
  { id: 'scale', name: 'Scale', price: 149, desc: '3 000 conversations + support prioritaire' },
]

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

  const [subscribing, setSubscribing] = useState<string | null>(null)

  async function handleSubscribe(plan: string) {
    setSubscribing(plan)
    setMessage(null)
    try {
      const res = await fetch('/api/shopify/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, plan }),
      })
      const json = await res.json()
      if (!res.ok || !json.data?.confirmationUrl) {
        throw new Error(json.error || 'Erreur')
      }
      // Rediriger vers la confirmation de paiement Shopify (top frame)
      if (window.top) window.top.location.href = json.data.confirmationUrl
      else window.location.href = json.data.confirmationUrl
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur')
      setSubscribing(null)
    }
  }

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
            <div className="text-sm">
              <span className="text-gray-500">Plan actuel : </span>
              <span className="font-medium capitalize">{status.plan || 'free'}</span>
            </div>
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

      {/* Plans (visible si la boutique est liée) */}
      {status?.linked && (
        <section className="space-y-3">
          <h2 className="font-medium">Plans</h2>
          <p className="text-xs text-gray-500">
            Le plan gratuit inclut 10 conversations IA / mois. Passez à un plan supérieur pour plus de volume.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PLANS.map((p) => {
              const current = status.plan === p.id
              return (
                <div key={p.id} className={`rounded-xl border p-4 ${current ? 'border-black' : ''}`}>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-2xl font-bold">{p.price}€<span className="text-sm font-normal text-gray-500">/mois</span></div>
                  <p className="mt-1 text-xs text-gray-500">{p.desc}</p>
                  <button
                    onClick={() => handleSubscribe(p.id)}
                    disabled={current || subscribing !== null}
                    className="mt-3 w-full rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {current ? 'Plan actuel' : subscribing === p.id ? 'Redirection…' : 'Choisir'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400">
        Besoin d&apos;aide ? Rendez-vous sur votre tableau de bord Xeyo pour connecter
        WhatsApp et personnaliser votre agent.
      </p>
    </div>
  )
}
