'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { authenticatedFetch, isEmbedded } from '@/lib/shopify/authenticated-fetch'

/**
 * Page EMBEDDED (admin Shopify).
 *
 * Refonte App Bridge :
 *  - PLUS d'échappement d'iframe (`window.top.location`) : l'app vit dans l'admin.
 *  - PLUS de « Connecter ma boutique » ni « Créer un compte Xeyo » : installer
 *    l'app VAUT inscription — le compte est provisionné automatiquement à partir
 *    de l'email de la boutique (resolve-user.ts), et le session token App Bridge
 *    l'identifie ensuite.
 *  - Les liens qui sortent de l'admin s'ouvrent explicitement en `_top` (Shopify
 *    interdit d'imbriquer une page non embeddable dans l'iframe).
 */

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

type Status = {
  installed: boolean
  linked?: boolean
  shop_name?: string | null
  plan?: string | null
  agent?: { name?: string | null } | null
  documents?: number | null
  whatsapp_connected?: boolean
  approved_templates?: number | null
}

export default function ShopifyEmbeddedClient() {
  const searchParams = useSearchParams()
  const shop = searchParams.get('shop') || ''
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      // Le session token (App Bridge) identifie la boutique ET le compte Xeyo :
      // le serveur ne fait plus confiance au `?shop=` de l'URL.
      const res = await authenticatedFetch(`/api/shopify/status?shop=${encodeURIComponent(shop)}`)
      const json = await res.json()
      setStatus(json?.data ?? null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [shop])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  /** Ouvre une page Xeyo HORS de l'iframe (l'admin interdit de l'y imbriquer). */
  const openInTop = (path: string) => {
    const url = `${APP_BASE}${path}`
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      window.open(url, '_blank', 'noopener')
    } else {
      window.location.href = url
    }
  }

  const steps = [
    {
      key: 'account',
      label: 'Compte Xeyo créé',
      desc: 'Créé automatiquement depuis votre boutique Shopify.',
      done: true,
      path: '/dashboard',
    },
    {
      key: 'agent',
      label: 'Agent IA créé',
      desc: status?.agent?.name
        ? `« ${status.agent.name} » · ${status.documents ?? 0} source(s)`
        : 'Un agent qui répond à vos clients.',
      done: !!status?.agent,
      path: '/agents',
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp connecté',
      desc: status?.whatsapp_connected
        ? 'Votre numéro reçoit et envoie des messages.'
        : 'Reliez votre numéro WhatsApp Business.',
      done: !!status?.whatsapp_connected,
      path: '/dashboard',
    },
    {
      key: 'templates',
      label: 'Modèles approuvés',
      desc: (status?.approved_templates ?? 0) > 0
        ? `${status?.approved_templates} modèle(s) prêt(s) à l’envoi.`
        : 'Créez vos modèles de notification (commande, livraison…).',
      done: (status?.approved_templates ?? 0) > 0,
      path: '/templates',
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const progress = Math.round((doneCount / steps.length) * 100)
  const allDone = doneCount === steps.length

  return (
    <div className="min-h-screen bg-[#f1f1f1] px-4 py-10">
      <div className="mx-auto mb-6 flex max-w-3xl items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xeyo-logo.png" alt="Xeyo" className="h-8 w-8 object-contain" />
        <h1 className="text-lg font-semibold text-gray-800">Xeyo, WhatsApp Support &amp; Chat</h1>
      </div>

      {loading ? (
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
          Chargement…
        </div>
      ) : !status?.installed ? (
        // Boutique inconnue : l'app n'est pas (ou plus) installée sur cette boutique.
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Installation requise</h2>
          <p className="mt-2 text-sm text-gray-500">
            Cette boutique n’est pas encore reliée à Xeyo. Réinstallez l’application depuis
            l’App Store Shopify pour continuer.
          </p>
        </div>
      ) : (
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
              <button
                key={s.key}
                type="button"
                onClick={() => openInTop(s.path)}
                className={`flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-100' : ''}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                  {s.done ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${s.done ? 'text-gray-900' : 'text-gray-700'}`}>{s.label}</p>
                  <p className="truncate text-xs text-gray-400">{s.desc}</p>
                </div>
                <span className="text-gray-300">→</span>
              </button>
            ))}
          </div>

          {/* Accès rapide */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => openInTop('/dashboard')}
              className="rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Ouvrir mon tableau de bord
            </button>
            <button
              type="button"
              onClick={() => openInTop('/subscription')}
              className="rounded-2xl border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Gérer mon abonnement
            </button>
          </div>

          {!isEmbedded() && (
            <p className="text-center text-xs text-gray-400">
              Ouvrez cette page depuis l’admin Shopify pour l’expérience intégrée.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
