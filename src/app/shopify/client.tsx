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

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

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

  // Retour de login (?autolink=1) : si la boutique n'est pas encore liée, lancer la liaison.
  const autolink = searchParams.get('autolink') === '1'
  useEffect(() => {
    if (!loading && autolink && status && !status.linked && !connecting) {
      handleConnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, autolink, status?.linked])

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
        // Pas connecté à Xeyo → login, puis retour auto sur /shopify (lien boutique↔compte)
        const back = encodeURIComponent(`/shopify?shop=${encodeURIComponent(shop)}&autolink=1`)
        const loginUrl = `${APP_BASE}/login?redirect=${back}`
        if (window.top) window.top.location.href = loginUrl
        else window.location.href = loginUrl
        return
      }
      if (!res.ok && !json.data?.linked) throw new Error(json.error || 'Erreur de connexion')
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


  return (
    <div className="min-h-screen bg-[#f1f1f1] px-4 py-10">
      {/* Barre titre façon admin Shopify */}
      <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-sm font-bold text-white">X</div>
        <h1 className="text-lg font-semibold text-gray-800">Xeyo — WhatsApp Support &amp; Chat</h1>
      </div>

      {loading ? (
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
          Chargement…
        </div>
      ) : !status?.linked ? (
        /* ── Carte de connexion (style Gorgias) ── */
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Connectez votre boutique à Xeyo</h2>
          <p className="mt-2 text-sm text-gray-500">
            Xeyo lit votre catalogue, vos pages et vos politiques pour créer
            automatiquement un agent IA qui répond à vos clients sur WhatsApp.
          </p>

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {status?.shop_name || shop || 'Votre boutique Shopify'}
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="mt-4 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            {connecting ? 'Configuration en cours…' : 'Connecter ma boutique'}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">ou</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <a
            href={`${APP_BASE}/register?redirect=${encodeURIComponent(`/shopify?shop=${encodeURIComponent(shop)}&autolink=1`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm font-medium text-gray-900 hover:underline"
          >
            Créer un compte Xeyo
          </a>

          {message && <p className="mt-4 text-center text-sm text-gray-600">{message}</p>}
        </div>
      ) : (
        /* ── État connecté + plans ── */
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <h2 className="font-semibold text-gray-900">Boutique connectée</h2>
              <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
                Plan {status.plan || 'free'}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-400">Agent IA</dt>
                <dd className="font-medium text-gray-900">{status.agent?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Base de connaissances</dt>
                <dd className="font-medium text-gray-900">{status.documents ?? 0} source(s)</dd>
              </div>
            </dl>
            <a
              href={APP_BASE}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Ouvrir le tableau de bord Xeyo
            </a>
            {message && <p className="mt-3 text-sm text-gray-600">{message}</p>}
          </div>

          {/* Abonnement : géré depuis le tableau de bord Xeyo (Stripe) */}
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h3 className="font-semibold text-gray-900">Votre abonnement</h3>
            <p className="mt-1 text-sm text-gray-500">
              Gérez votre forfait et vos conversations IA depuis votre tableau de bord Xeyo.
            </p>
            <a
              href={`${APP_BASE}/subscription`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Gérer mon abonnement
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
