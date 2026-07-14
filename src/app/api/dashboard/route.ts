import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/**
 * GET /api/dashboard — les chiffres de l'accueil.
 *
 * ⚠️ TOUT EST MESURÉ. RIEN N'EST INVENTÉ.
 *
 * Afficher des statistiques fabriquées est un motif de rejet App Store
 * (§1.1.4 — « apps that falsify data to deceive merchants »). Chaque nombre
 * renvoyé ici vient de la base.
 *
 * Ce qui a été ÉCARTÉ, faute de source :
 *  · « Satisfaction client 4.8/5 » — rien ne collecte de note client. Aucune
 *    table, aucun flux ne la demande. On ne peut pas l'estimer non plus.
 *  · « Temps économisé » — aucune mesure. On aurait pu l'estimer (réponses IA ×
 *    2 min), mais une estimation présentée comme un fait reste un mensonge.
 */

function admin() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = admin()

  // ⚠️ `conversations`, `messages` et `contacts` n'ont PAS de `user_id` : ils sont
  // rattachés à une session WhatsApp. Sans ce filtre, on mélangerait les données de
  // tous les marchands.
  const { data: sessions } = await db
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (sessions || []).map((s) => s.id)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Pas encore de WhatsApp connecté : tout est vide, mais la page doit s'afficher.
  if (sessionIds.length === 0) {
    return NextResponse.json({
      data: {
        health: { avgResponseMs: null, resolutionRate: null, whatsappRevenueCents: 0, currency: 'EUR' },
        activity: [],
      },
    })
  }

  // ── Le CA que WhatsApp rapporte réellement au marchand ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = await (db as any)
    .from('shopify_orders')
    .select('total_price, currency, is_whatsapp')
    .eq('user_id', user.id)
    .gte('ordered_at', monthStart.toISOString())

  const orderRows = (orders || []) as { total_price: number; currency: string; is_whatsapp: boolean }[]

  const whatsappRevenueCents = Math.round(
    orderRows.filter((o) => o.is_whatsapp).reduce((sum, o) => sum + Number(o.total_price || 0), 0) * 100
  )
  const currency = orderRows[0]?.currency || 'EUR'

  // ── Santé de l'agent ──────────────────────────────────────────────────────

  // Temps de réponse : la latence réelle des appels IA de réponse SAV.
  const { data: latencies } = await db
    .from('ai_usage_log')
    .select('latency_ms')
    .eq('user_id', user.id)
    .eq('feature', 'sav_reply')
    .not('latency_ms', 'is', null)
    .gte('created_at', monthStart.toISOString())
    .limit(500)

  const latencyRows = (latencies || []) as { latency_ms: number }[]
  const avgResponseMs = latencyRows.length
    ? Math.round(latencyRows.reduce((s, r) => s + r.latency_ms, 0) / latencyRows.length)
    : null

  // Taux de résolution = conversations que l'IA a menées SANS passer la main.
  //
  // ⚠️ C'est un taux de NON-ESCALADE, pas une résolution confirmée : rien en base
  // ne dit qu'un client est reparti satisfait. On ne prétend pas le contraire.
  const [{ count: convForRate }, { count: escalated }] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds).gte('created_at', monthStart.toISOString()),
    db.from('conversations').select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds)
      .gte('created_at', monthStart.toISOString())
      .not('escalated_at', 'is', null),
  ])

  const resolutionRate =
    (convForRate ?? 0) > 0
      ? Math.round((1 - (escalated ?? 0) / (convForRate ?? 1)) * 100)
      : null

  // ── Activité récente ──────────────────────────────────────────────────────
  //
  // Il n'existe aucune table d'événements unifiée : on fusionne plusieurs sources
  // et on trie par date. On en prend un peu de chaque, puis on garde les plus
  // récentes — sinon une source bavarde (les messages) noierait tout le reste.
  const activity = await recentActivity(db, user.id, sessionIds)

  return NextResponse.json({
    data: {
      health: { avgResponseMs, resolutionRate, whatsappRevenueCents, currency },
      activity,
    },
  })
}

type ActivityItem = {
  kind: string
  label: string
  at: string
}

/**
 * Le flux d'activité. Un UNION à la main, faute de table d'événements.
 *
 * On limite CHAQUE source avant de fusionner : sans ça, les messages (des milliers)
 * écraseraient les événements rares mais importants (une boutique connectée, une
 * campagne lancée).
 */
async function recentActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  sessionIds: string[]
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = []

  const [stores, orders, optins, campaigns, alerts] = await Promise.all([
    db.from('shopify_stores')
      .select('shop_name, shop_domain, installed_at, last_synced_at, last_sync_summary')
      .eq('user_id', userId).eq('is_active', true).limit(1),

    db.from('shopify_orders')
      .select('order_number, total_price, currency, is_whatsapp, ordered_at')
      .eq('user_id', userId).order('ordered_at', { ascending: false }).limit(3),

    db.from('contacts')
      .select('name, phone_number, opt_in_at')
      .in('session_id', sessionIds)
      .eq('opt_in_status', 'subscribed')
      .not('opt_in_at', 'is', null)
      .order('opt_in_at', { ascending: false }).limit(3),

    db.from('campaigns')
      .select('name, sent_count, completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).limit(2),

    // Les alertes portent déjà un titre rédigé : la source la plus directe.
    db.from('user_alerts')
      .select('title, alert_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(3),
  ])

  const store = stores.data?.[0]
  if (store?.installed_at) {
    items.push({
      kind: 'store',
      label: `Boutique ${store.shop_name || store.shop_domain} connectée`,
      at: store.installed_at,
    })
  }
  if (store?.last_synced_at) {
    const n = store.last_sync_summary?.products
    items.push({
      kind: 'sync',
      label: n ? `${n} produits synchronisés` : 'Boutique synchronisée',
      at: store.last_synced_at,
    })
  }

  for (const o of orders.data || []) {
    items.push({
      kind: 'order',
      label: o.is_whatsapp
        ? `Commande #${o.order_number} via WhatsApp — ${Number(o.total_price).toFixed(2)} ${o.currency}`
        : `Commande #${o.order_number} — ${Number(o.total_price).toFixed(2)} ${o.currency}`,
      at: o.ordered_at,
    })
  }

  for (const c of optins.data || []) {
    // ⚠️ Jamais le numéro de téléphone complet : c'est une donnée personnelle, et
    // ce flux est visible en permanence sur l'écran d'accueil.
    items.push({
      kind: 'optin',
      label: `${c.name || 'Un client'} s’est abonné à WhatsApp`,
      at: c.opt_in_at,
    })
  }

  for (const c of campaigns.data || []) {
    items.push({
      kind: 'campaign',
      label: `Campagne « ${c.name} » envoyée à ${c.sent_count || 0} contacts`,
      at: c.completed_at,
    })
  }

  for (const a of alerts.data || []) {
    items.push({ kind: a.alert_type || 'info', label: a.title, at: a.created_at })
  }

  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6)
}
