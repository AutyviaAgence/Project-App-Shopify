'use client'

import { useEffect, useState } from 'react'
import { ShoppingBag, Package, ExternalLink, Loader2, RotateCcw, ChevronRight, ChevronLeft, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

type Order = {
  id: string
  name: string
  createdAt: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  total: string
  totalRefunded?: string
  currency: string
  tracking: { number: string | null; url: string | null } | null
}

/** Statut de remboursement calculé depuis Shopify (montant remboursé vs total). */
function refundInfo(o: Order): { label: string; badge: string } | null {
  const total = Number(o.total) || 0
  const refunded = Number(o.totalRefunded) || 0
  if (refunded <= 0) return null
  const full = refunded >= total - 0.001
  return {
    label: full
      ? `Remboursée (${refunded.toFixed(2)} ${o.currency})`
      : `Remboursé ${refunded.toFixed(2)} / ${total.toFixed(2)} ${o.currency}`,
    badge: full
      ? 'text-rose-500 bg-rose-500/15 ring-rose-500/30'
      : 'text-amber-500 bg-amber-500/15 ring-amber-500/30',
  }
}

type Data = { connected: boolean; orders: Order[]; error?: string; shopDomain?: string }

/** Lien direct vers la commande dans l'admin Shopify (id gid → numérique). */
function orderAdminUrl(shopDomain: string | undefined, orderId: string): string | null {
  if (!shopDomain) return null
  const numeric = orderId.split('/').pop() // gid://shopify/Order/12345 → 12345
  if (!numeric) return null
  return `https://${shopDomain}/admin/orders/${numeric}`
}

/** Traduit le statut de livraison Shopify en libellé FR + style du badge. */
function fulfillmentLabel(s: string | null): { label: string; badge: string } {
  switch (s) {
    case 'FULFILLED': return { label: 'Expédiée', badge: 'text-emerald-500 bg-emerald-500/15 ring-emerald-500/30' }
    case 'PARTIALLY_FULFILLED': return { label: 'Partielle', badge: 'text-amber-500 bg-amber-500/15 ring-amber-500/30' }
    case 'UNFULFILLED': return { label: 'En préparation', badge: 'text-blue-500 bg-blue-500/15 ring-blue-500/30' }
    default: return { label: s || '—', badge: 'text-muted-foreground bg-muted ring-border' }
  }
}

/** Statut de paiement Shopify → libellé FR. */
function financialLabel(s: string | null): string {
  switch (s) {
    case 'PAID': return 'Payée'
    case 'PENDING': return 'En attente'
    case 'REFUNDED': return 'Remboursée'
    case 'PARTIALLY_REFUNDED': return 'Part. remboursée'
    case 'VOIDED': return 'Annulée'
    default: return s || '—'
  }
}

/**
 * Panneau de contexte Shopify : commandes récentes du client + historique des
 * actions de la conversation (annulations, remboursements, codes promo).
 */
// `conversationId` reste accepté (le parent le passe) mais n'est plus utilisé
// depuis le retrait de l'onglet Historique — on ne le destructure donc pas.
export function ShopifyContextPanel({ contactId, contactName, refreshKey }: { contactId: string | null; conversationId?: string; contactName?: string | null; refreshKey?: number }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // ⚠️ EN DESSOUS DE 1280 px (xl), LE PANNEAU OUVERT VOLE TROP DE LARGEUR AU CHAT.
  //
  // Avant, le panneau ET sa bande repliée étaient `hidden xl:flex` : sous 1280 px
  // le marchand ne voyait PLUS DU TOUT les commandes, sans même un bouton pour les
  // rouvrir (constaté : « je ne vois plus les commandes »). On abaisse l'accès à
  // 1024 px (lg) via la bande repliée ; mais à cette largeur, ouvrir le panneau en
  // ligne écraserait le chat (~350 px). On l'ouvre donc EN SUPERPOSITION (overlay)
  // tant qu'on est sous 1280 px — la conversation garde sa largeur.
  const [belowXl, setBelowXl] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)')
    const apply = () => setBelowXl(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  // Sous xl, on démarre replié (bande) pour ne pas masquer le chat d'entrée.
  useEffect(() => { if (belowXl) setCollapsed(true) }, [belowXl])

  // Le contact affiché DANS `data`, pour ne jamais montrer les commandes d'un
  // autre. Voir le garde ci-dessous.
  const [dataForContact, setDataForContact] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!contactId) { setData(null); setDataForContact(null); return }

    // ⚠️ VIDER LES DONNÉES DU CONTACT PRÉCÉDENT À CHAQUE CHANGEMENT DE CONTACT.
    //
    // Sans ça, en passant du contact A au contact B, le panneau gardait AFFICHÉES
    // les commandes de A tant que le fetch de B n'avait pas répondu. Résultat vu
    // par le marchand : « les commandes sont unifiées sur une conversation » (on
    // voit celles de quelqu'un d'autre) et « je ne les vois pas toujours » (elles
    // clignotent, puis se remplacent). C'est une confusion dangereuse : un
    // conseiller pourrait traiter la commande du mauvais client.
    //
    // On ne vide QUE quand le CONTACT change (pas sur un simple refreshKey, qui
    // rafraîchit le même contact — inutile d'y faire clignoter le panneau).
    if (dataForContact !== contactId) {
      setData(null)
    }

    ;(async () => {
      setLoading(true)
      try {
        const j = await (await fetch(`/api/shopify/orders?contact_id=${contactId}`)).json()
        // Double garde : le composant est toujours monté ET on est toujours sur
        // CE contact (le state a pu changer pendant le await).
        if (active) { setData(j.data || null); setDataForContact(contactId) }
      } catch {
        if (active) { setData(null); setDataForContact(contactId) }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [contactId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps


  if (!contactId) return null
  // Boutique non connectée → on n'affiche pas le panneau
  if (data && !data.connected) return null

  // ⚠️ NE JAMAIS AFFICHER LES COMMANDES D'UN AUTRE CONTACT.
  //
  // Si `data` appartient encore au contact précédent (fetch du nouveau pas encore
  // arrivé), on considère qu'il n'y a rien à montrer plutôt que d'afficher les
  // mauvaises commandes. C'est le filet final contre la confusion « commandes
  // unifiées ».
  const dataIsForCurrent = dataForContact === contactId
  const shownData = dataIsForCurrent ? data : null
  const orderCount = shownData?.orders.length ?? 0

  // Replié : fine bande verticale avec une flèche pour rouvrir (comme la sidebar).
  // Visible dès `lg` (1024 px) — c'est ce qui redonne l'accès aux commandes sur
  // les écrans plus étroits où le panneau complet ne tient pas en ligne.
  if (collapsed) {
    return (
      <div className="hidden w-12 shrink-0 flex-col items-center gap-3 border-l bg-background py-3 lg:flex">
        <button
          onClick={() => setCollapsed(false)}
          title="Afficher les commandes"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="relative">
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          {orderCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{orderCount}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Sous xl : voile cliquable derrière l'overlay pour le refermer. */}
      {belowXl && (
        <div
          className="absolute inset-0 z-20 bg-black/20 lg:block xl:hidden"
          onClick={() => setCollapsed(true)}
          aria-hidden="true"
        />
      )}
      <div className={cn(
        'h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-l bg-background',
        // ≥ xl : panneau en ligne, comme avant.
        'hidden xl:flex',
        // lg–xl : superposé à droite (n'écrase pas le chat).
        belowXl && 'absolute inset-y-0 right-0 z-30 !flex shadow-xl',
      )}>
      {/* En-tête : conversation liée + bouton replier */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {contactName || 'Conversation'}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Réduire"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {/* En-tête « Commandes ». L'onglet « Historique » (actions Shopify de la
          conversation) a été retiré : vide dans l'usage actuel, il n'apportait
          rien. Le panneau ne montre plus que les commandes du client. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-3 text-sm font-medium text-primary">
        <ShoppingBag className="h-4 w-4" /> Commandes
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [scrollbar-width:thin]">
        {/* Spinner UNIQUEMENT quand on n'a encore rien à montrer pour ce contact.
            Un refreshKey (toutes les 12 s) rafraîchit le MÊME contact : on garde
            les commandes affichées et on recharge en silence, sinon le panneau
            clignotait sans raison — le « spinner d'une demi-seconde » constaté. */}
        {loading && !shownData ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !shownData || shownData.orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">Aucune commande trouvée pour ce client.</p>
          </div>
        ) : (
          shownData.orders.map((o) => {
            const fl = fulfillmentLabel(o.fulfillmentStatus)
            const refund = refundInfo(o)
            const adminUrl = orderAdminUrl(shownData.shopDomain, o.id)
            return (
              <div
                key={o.id}
                className="group rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-border"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-semibold tracking-tight">{o.name}</span>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', fl.badge)}>{fl.label}</span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <span className="text-base font-bold tracking-tight">
                    {o.total} <span className="text-[11px] font-medium text-muted-foreground">{o.currency}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span>{financialLabel(o.financialStatus)}</span>
                  {o.tracking?.url && (
                    <a
                      href={o.tracking.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Package className="h-3 w-3" /> Suivi <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                {/* Statut de remboursement (source Shopify : marche aussi pour un
                    remboursement fait directement dans l'admin Shopify). */}
                {refund && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <RotateCcw className="h-3 w-3 shrink-0 text-amber-500" />
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', refund.badge)}>
                      {refund.label}
                    </span>
                  </div>
                )}
                {/* Bouton : ouvrir la commande dans l'admin Shopify. */}
                {adminUrl && (
                  <a
                    href={adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  >
                    <ShoppingBag className="h-3 w-3" /> Voir dans Shopify <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
    </>
  )
}
