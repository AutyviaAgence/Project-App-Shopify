'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { authenticatedFetch } from '@/lib/shopify/authenticated-fetch'

/**
 * Page EMBEDDED (admin Shopify) — refonte App Bridge.
 *
 * Requirements couverts :
 *  · 1.1.1  session tokens (authenticatedFetch, plus aucun cookie ni échappement
 *           d'iframe).
 *  · 2.2.2  l'app est UTILISABLE dans l'admin : le marchand y voit ses contacts et
 *           ses conversations, et peut y changer/annuler son abonnement.
 *  · 5.1.5  les données clients collectées via le storefront (opt-ins, contacts,
 *           conversations) sont RESTITUÉES au marchand dans l'admin Shopify.
 */

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://app.xeyo.io'

type Status = {
  installed: boolean
  shop_name?: string | null
  plan?: string | null
  agent?: { name?: string | null } | null
  documents?: number | null
  whatsapp_connected?: boolean
  approved_templates?: number | null
}

type Conversation = {
  id: string
  name: string
  phone: string | null
  optedIn: boolean
  lastMessageAt: string | null
  preview: string
  unread: number
}

type Overview = {
  /** Email du compte Xeyo propriétaire de la boutique (identité = boutique, pas personne). */
  linkedAccountEmail?: string | null
  plan: string
  subscriptionStatus: string | null
  shopDomain: string | null
  contactsCount: number
  optedInCount: number
  conversations: Conversation[]
}

/**
 * ⚠️ Doit correspondre EXACTEMENT à ce que la Billing API prélève
 * (`createAppSubscription` → `currencyCode`, actuellement 'EUR').
 *
 * Un écart entre le prix AFFICHÉ et le prix PRÉLEVÉ est un motif de rejet à la
 * review : le marchand doit savoir ce qu'il paie. Si la devise change côté
 * facturation, elle doit changer ici aussi.
 */
const PLAN_CURRENCY = '€'

const PLANS = [
  { id: 'starter', name: 'Starter', price: 49, desc: '550 conversations IA / mois' },
  { id: 'pro', name: 'Growth', price: 149, desc: '1 800 conversations IA / mois' },
  { id: 'scale', name: 'Scale', price: 349, desc: '4 500 conversations IA / mois' },
]

export default function ShopifyEmbeddedClient() {
  const searchParams = useSearchParams()
  const shop = searchParams.get('shop') || ''
  const [status, setStatus] = useState<Status | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  const [unlinked, setUnlinked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Le session token (App Bridge) identifie la boutique ET le compte Xeyo :
      // le serveur ne fait plus confiance au `?shop=` de l'URL.
      const [s, o] = await Promise.all([
        authenticatedFetch(`/api/shopify/status?shop=${encodeURIComponent(shop)}`).then((r) => r.json()).catch(() => null),
        authenticatedFetch('/api/shopify/embedded/overview').then((r) => r.json()).catch(() => null),
      ])
      setStatus(s?.data ?? null)
      setOverview(o?.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [shop])

  useEffect(() => { load() }, [load])

  /** Abonnement via la Billing API — le marchand approuve DANS Shopify. */
  const subscribe = async (plan: string) => {
    setBusyPlan(plan)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop, plan }),
      })
      const json = await res.json()
      const url = json?.data?.confirmationUrl
      if (!res.ok || !url) throw new Error(json.error || 'Erreur de facturation')
      // Page de confirmation Shopify : navigation top-level (elle n'est pas embeddable).
      if (window.top) window.top.location.href = url
      else window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setBusyPlan(null)
    }
  }

  /** Annulation (retour au plan gratuit) — requirement 1.2.3. */
  const cancel = async () => {
    setBusyPlan('cancel')
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/billing/cancel', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusyPlan(null)
    }
  }

  /**
   * Délie la boutique de son compte Xeyo actuel.
   *
   * En embedded, l'identité vient du session token → de la BOUTIQUE, jamais de la
   * personne : tout le staff Shopify voit les données du compte Xeyo propriétaire.
   * Sans cette action, un marchand ouvrant l'app avec un autre compte resterait
   * bloqué sur les données du premier compte lié, sans aucun moyen d'en changer.
   */
  const unlink = async () => {
    if (!window.confirm(
      'Délier cette boutique de son compte Xeyo ?\n\n' +
      'Vos contacts et conversations restent attachés au compte actuel. ' +
      'Vous pourrez ensuite relier la boutique au compte de votre choix.'
    )) return
    setUnlinking(true)
    setError(null)
    try {
      const res = await authenticatedFetch('/api/shopify/embedded/unlink', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur')
      setUnlinked(true)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setUnlinking(false)
    }
  }

  /** Pages Xeyo non embeddables (builder, conversations complètes…) : nouvel onglet. */
  const openInTop = (path: string) => {
    const url = `${APP_BASE}${path}`
    if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
      window.open(url, '_blank', 'noopener')
    } else {
      window.location.href = url
    }
  }

  const currentPlan = overview?.plan || status?.plan || 'free'
  const isPaid = currentPlan !== 'free'

  const setupSteps = [
    { key: 'whatsapp', label: 'WhatsApp connecté', done: !!status?.whatsapp_connected, path: '/dashboard' },
    { key: 'agent', label: 'Agent IA configuré', done: !!status?.agent, path: '/agents' },
    { key: 'templates', label: 'Modèles approuvés', done: (status?.approved_templates ?? 0) > 0, path: '/templates' },
  ]

  return (
    <div className="min-h-screen bg-[#f1f1f1] px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/xeyo-logo.png" alt="Xeyo" className="h-8 w-8 object-contain" />
          <h1 className="text-lg font-semibold text-gray-800">Xeyo, WhatsApp Support &amp; Chat</h1>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm ring-1 ring-gray-200">
            Chargement…
          </div>
        ) : !status?.installed ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Installation requise</h2>
            <p className="mt-2 text-sm text-gray-500">
              Cette boutique n’est pas encore reliée à Xeyo. Réinstallez l’application depuis l’App Store.
            </p>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {/* ── DONNÉES CLIENTS collectées (requirement 5.1.5) ── */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Vos contacts WhatsApp</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Collectés depuis votre boutique (popup, checkout, page de remerciement).
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-2xl font-bold tabular-nums text-gray-900">{overview?.contactsCount ?? 0}</p>
                  <p className="text-xs text-gray-500">Contacts</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">{overview?.optedInCount ?? 0}</p>
                  <p className="text-xs text-gray-500">Abonnés WhatsApp (opt-in)</p>
                </div>
              </div>
            </div>

            {/* ── CONVERSATIONS RÉCENTES (requirement 5.1.5) ── */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-sm font-semibold text-gray-900">Conversations récentes</h2>
                <button
                  type="button"
                  onClick={() => openInTop('/conversations')}
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
                >
                  Tout voir →
                </button>
              </div>
              {(overview?.conversations?.length ?? 0) === 0 ? (
                <p className="border-t border-gray-100 px-6 py-8 text-center text-sm text-gray-400">
                  Aucune conversation pour l’instant.
                </p>
              ) : (
                overview!.conversations.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 border-t border-gray-100 px-6 py-3">
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                        {c.optedIn && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            opt-in
                          </span>
                        )}
                        {c.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-500">{c.preview || '—'}</p>
                    </div>
                    {c.lastMessageAt && (
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {new Date(c.lastMessageAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── ABONNEMENT (requirements 1.2.1 / 1.2.3 — géré DANS l'admin) ── */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Abonnement</h2>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Facturé avec votre facture Shopify. Changez ou annulez à tout moment.
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-600">
                  Plan {currentPlan}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {PLANS.map((p) => {
                  const active = currentPlan === p.id
                  // `disabled` UNIQUEMENT sur le plan courant ou celui en cours de
                  // souscription. Le désactiver dès qu'un autre bouton travaille
                  // grisait TOUTES les cartes (opacity-60), rendant les prix illisibles.
                  const busy = busyPlan === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={active || busy}
                      onClick={() => subscribe(p.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white hover:border-gray-900 hover:shadow-sm'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-900'}`}>{p.name}</p>
                      <p className={`text-xs ${active ? 'text-white/70' : 'text-gray-600'}`}>{p.desc}</p>
                      <p className={`mt-1 text-sm font-bold ${active ? 'text-white' : 'text-gray-900'}`}>
                        {busy ? '…' : active ? 'Actuel' : `${p.price} ${PLAN_CURRENCY}/mois`}
                      </p>
                    </button>
                  )
                })}
              </div>

              {isPaid && (
                <button
                  type="button"
                  onClick={cancel}
                  disabled={busyPlan !== null}
                  className="mt-3 text-xs font-medium text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
                >
                  {busyPlan === 'cancel' ? 'Annulation…' : 'Annuler mon abonnement (retour au plan gratuit)'}
                </button>
              )}
            </div>

            {/* ── CONFIGURATION restante ── */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <h2 className="px-6 py-4 text-sm font-semibold text-gray-900">Configuration</h2>
              {setupSteps.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => openInTop(s.path)}
                  className="flex w-full items-center gap-3 border-t border-gray-100 px-6 py-3 text-left transition hover:bg-gray-50"
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {s.done ? '✓' : '!'}
                  </span>
                  <span className={`flex-1 text-sm ${s.done ? 'text-gray-900' : 'text-gray-600'}`}>{s.label}</span>
                  <span className="text-gray-300">→</span>
                </button>
              ))}
            </div>

            {/* ── COMPTE XEYO RELIÉ (action rare, volontairement discrète) ── */}
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Compte Xeyo relié</h2>
              {unlinked ? (
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  Cette boutique n’est plus reliée à aucun compte Xeyo. Connectez-vous sur{' '}
                  <span className="font-medium text-gray-900">app.xeyo.io</span> avec le compte souhaité,
                  puis cliquez sur « Relier à mon compte » depuis le tableau de bord.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">
                    Boutique reliée au compte Xeyo{' '}
                    <span className="font-medium text-gray-900">
                      {overview?.linkedAccountEmail || '—'}
                    </span>
                    .
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Tous les membres de votre équipe Shopify voient les mêmes données.
                  </p>
                  <button
                    type="button"
                    onClick={unlink}
                    disabled={unlinking}
                    className="mt-3 text-xs font-medium text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
                  >
                    {unlinking ? 'Déliaison…' : 'Délier ma boutique'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
