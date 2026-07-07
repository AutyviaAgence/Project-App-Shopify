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
  whatsapp_connected?: boolean
  approved_templates?: number
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
      // Si le grand onboarding est en cours, on y retourne directement
      // (la connexion Shopify en est la 1ʳᵉ étape).
      try {
        const st = await fetch(`${APP_BASE}/api/onboarding/state`).then((r) => (r.ok ? r.json() : null))
        if (st && st.completed === false) {
          const url = `${APP_BASE}/onboarding`
          if (window.top) window.top.location.href = url
          else window.location.href = url
          return
        }
      } catch { /* silencieux : on reste sur la checklist */ }
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
      <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xeyo-logo.png" alt="Xeyo" className="h-8 w-8 object-contain" />
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
        /* ── État connecté : onboarding + dashboard ── */
        (() => {
          const steps = [
            { key: 'account', label: 'Compte Xeyo créé', desc: 'Votre boutique est liée à un compte.', done: true, href: APP_BASE },
            { key: 'agent', label: 'Agent IA créé', desc: status.agent?.name ? `« ${status.agent.name} » · ${status.documents ?? 0} source(s)` : 'Un agent qui répond à vos clients.', done: !!status.agent, href: `${APP_BASE}/agents` },
            { key: 'whatsapp', label: 'WhatsApp connecté', desc: status.whatsapp_connected ? 'Votre numéro reçoit et envoie des messages.' : 'Reliez votre numéro WhatsApp Business.', done: !!status.whatsapp_connected, href: `${APP_BASE}/dashboard` },
            { key: 'templates', label: 'Modèles approuvés', desc: (status.approved_templates ?? 0) > 0 ? `${status.approved_templates} modèle(s) prêt(s) à l'envoi.` : 'Créez vos modèles de notification (commande, livraison…).', done: (status.approved_templates ?? 0) > 0, href: `${APP_BASE}/templates` },
          ]
          const doneCount = steps.filter((s) => s.done).length
          const progress = Math.round((doneCount / steps.length) * 100)
          const allDone = doneCount === steps.length

          return (
            <div className="mx-auto max-w-2xl space-y-5">
              {/* En-tête + progression */}
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <h2 className="font-semibold text-gray-900">{status.shop_name || 'Boutique'} connectée</h2>
                  <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
                    Plan {status.plan || 'free'}
                  </span>
                </div>
                {!allDone ? (
                  <>
                    <p className="mt-2 text-sm text-gray-500">Finalisez la configuration pour automatiser votre SAV WhatsApp.</p>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-500">{doneCount}/{steps.length}</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-emerald-600">🎉 Tout est configuré ! Votre SAV WhatsApp est opérationnel.</p>
                )}
              </div>

              {/* Étapes */}
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                {steps.map((s, i) => (
                  <a
                    key={s.key}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-4 px-6 py-4 transition hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {s.done ? '✓' : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${s.done ? 'text-gray-900' : 'text-gray-700'}`}>{s.label}</p>
                      <p className="truncate text-xs text-gray-400">{s.desc}</p>
                    </div>
                    <span className="text-gray-300">→</span>
                  </a>
                ))}
              </div>

              {/* Accès rapide */}
              <div className="grid grid-cols-2 gap-3">
                <a href={APP_BASE} target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-800">
                  Ouvrir mon tableau de bord
                </a>
                <a href={`${APP_BASE}/subscription`} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                  Gérer mon abonnement
                </a>
              </div>
              {message && <p className="text-center text-sm text-gray-600">{message}</p>}
            </div>
          )
        })()
      )}
    </div>
  )
}
