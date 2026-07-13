import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logDataAccess } from '@/lib/audit/log'

/**
 * GET /api/contacts/table
 *
 * Vue « tableau Excel » des contacts : une ligne par contact avec les données
 * agrégées (messages, vues, commandes, CA, état du lead…). Réutilise les
 * patterns de rollup prouvés dans /api/stats.
 *
 * ?format=csv → renvoie un fichier CSV (Content-Disposition attachment) au lieu
 * du JSON, pour ouverture directe dans Excel / Google Sheets.
 */

// Une ligne du tableau (agrégée par contact).
export type ContactTableRow = {
  contact_id: string
  phone_number: string
  name: string
  email: string
  language: string | null
  opt_in_status: 'none' | 'subscribed' | 'opted_out'
  // Étapes lifecycle (badges), issues des conversations du contact.
  stages: { id: string; name: string; color: string }[]
  // Messages
  messages_total: number
  messages_in: number       // reçus (inbound)
  messages_out: number      // envoyés (outbound)
  messages_ai: number       // envoyés par l'IA
  messages_read: number     // « vues » : nos messages lus par le contact
  // Commandes
  orders_count: number
  revenue_total: number     // CA total (somme total_price)
  currency: string | null
  last_order_at: string | null
  // Activité
  last_activity_at: string | null
  created_at: string
}

type CountBucket = { total: number; in: number; out: number; ai: number; read: number }

// Pagine une query Supabase qui peut dépasser 1000 lignes.
// Le builder est typé `any` : plusieurs tables (shopify_orders) et colonnes
// (contacts.last_order_at) ne sont pas dans les types générés, comme ailleurs
// dans le code (cf. api/shopify/sales). On caste au retour vers T.
async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (offset: number, limit: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000
  let all: T[] = []
  let offset = 0
  while (true) {
    const { data, error } = await buildQuery(offset, PAGE)
    if (error || !data) break
    all = all.concat(data as T[])
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const format = searchParams.get('format')
  const sessionFilter = searchParams.get('session_id') || 'all'

  // 1. Sessions de l'utilisateur
  const { data: sessions } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', user.id)

  const allSessionIds = (sessions || []).map((s) => s.id)
  const sessionIds = sessionFilter === 'all'
    ? allSessionIds
    : allSessionIds.filter((id) => id === sessionFilter)

  if (sessionIds.length === 0) {
    return format === 'csv'
      ? csvResponse([])
      : NextResponse.json({ data: [] })
  }

  // 2. Contacts de ces sessions
  const contacts = await fetchAllRows<{
    id: string; phone_number: string; name: string | null; first_name: string | null
    last_name: string | null; email: string | null; preferred_language: string | null
    opt_in_status: 'none' | 'subscribed' | 'opted_out'; last_order_at: string | null; created_at: string
  }>((offset, limit) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('contacts')
      .select('id, phone_number, name, first_name, last_name, email, preferred_language, opt_in_status, last_order_at, created_at')
      .in('session_id', sessionIds)
      .range(offset, offset + limit - 1)
  )

  if (contacts.length === 0) {
    return format === 'csv' ? csvResponse([]) : NextResponse.json({ data: [] })
  }

  const contactIds = contacts.map((c) => c.id)

  // 3. Conversations de ces contacts (map conversation → contact + activité)
  const conversations = await fetchAllRows<{ id: string; contact_id: string; last_message_at: string | null }>(
    (offset, limit) =>
      supabase
        .from('conversations')
        .select('id, contact_id, last_message_at')
        .in('contact_id', contactIds)
        .range(offset, offset + limit - 1)
  )

  const convToContact = new Map<string, string>()
  const contactLastActivity = new Map<string, string | null>()
  const convIds: string[] = []
  for (const c of conversations) {
    convToContact.set(c.id, c.contact_id)
    convIds.push(c.id)
    const prev = contactLastActivity.get(c.contact_id)
    if (!prev || (c.last_message_at && c.last_message_at > prev)) {
      contactLastActivity.set(c.contact_id, c.last_message_at || prev || null)
    }
  }

  // 4. Messages → compteurs par contact (total / in / out / ai / read)
  //    Les messages n'ont pas de contact_id : on compte par conversation puis
  //    on remonte au contact via convToContact.
  const perContactCounts = new Map<string, CountBucket>()
  const bump = (contactId: string, key: keyof CountBucket, n = 1) => {
    let b = perContactCounts.get(contactId)
    if (!b) { b = { total: 0, in: 0, out: 0, ai: 0, read: 0 }; perContactCounts.set(contactId, b) }
    b[key] += n
  }

  if (convIds.length > 0) {
    const messages = await fetchAllRows<{
      conversation_id: string; direction: 'inbound' | 'outbound'; sent_by: string; status: string
    }>((offset, limit) =>
      supabase
        .from('messages')
        .select('conversation_id, direction, sent_by, status')
        .in('conversation_id', convIds)
        .range(offset, offset + limit - 1)
    )

    for (const m of messages) {
      const contactId = convToContact.get(m.conversation_id)
      if (!contactId) continue
      bump(contactId, 'total')
      if (m.direction === 'inbound') bump(contactId, 'in')
      else {
        bump(contactId, 'out')
        if (m.sent_by === 'ai_agent') bump(contactId, 'ai')
        if (m.status === 'read') bump(contactId, 'read') // « vues »
      }
    }
  }

  // 5. Étapes lifecycle par contact (via conversations → conversation_lifecycle_stages)
  const contactStages = new Map<string, Map<string, { id: string; name: string; color: string }>>()
  if (convIds.length > 0) {
    const assignments = await fetchAllRows<{ conversation_id: string; stage_id: string }>((offset, limit) =>
      supabase
        .from('conversation_lifecycle_stages')
        .select('conversation_id, stage_id')
        .in('conversation_id', convIds)
        .range(offset, offset + limit - 1)
    )

    const stageIds = [...new Set(assignments.map((a) => a.stage_id))]
    const stagesMap = new Map<string, { id: string; name: string; color: string }>()
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('lifecycle_stages')
        .select('id, name, color, position')
        .in('id', stageIds)
      for (const s of stages || []) stagesMap.set(s.id, { id: s.id, name: s.name, color: s.color })
    }

    for (const a of assignments) {
      const contactId = convToContact.get(a.conversation_id)
      const stage = stagesMap.get(a.stage_id)
      if (!contactId || !stage) continue
      let set = contactStages.get(contactId)
      if (!set) { set = new Map(); contactStages.set(contactId, set) }
      set.set(stage.id, stage) // dédup si plusieurs conversations partagent l'étape
    }
  }

  // 6. Commandes Shopify par contact (nb + CA)
  const contactOrders = new Map<string, { count: number; total: number; currency: string | null }>()
  {
    const orders = await fetchAllRows<{ contact_id: string | null; total_price: number | string; currency: string | null }>(
      (offset, limit) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('shopify_orders')
          .select('contact_id, total_price, currency')
          .eq('user_id', user.id)
          .in('contact_id', contactIds)
          .range(offset, offset + limit - 1)
    )
    for (const o of orders) {
      if (!o.contact_id) continue
      let agg = contactOrders.get(o.contact_id)
      if (!agg) { agg = { count: 0, total: 0, currency: o.currency }; contactOrders.set(o.contact_id, agg) }
      agg.count += 1
      agg.total += Number(o.total_price) || 0
      if (!agg.currency && o.currency) agg.currency = o.currency
    }
  }

  // 7. Assemblage des lignes
  const rows: ContactTableRow[] = contacts.map((c) => {
    const counts = perContactCounts.get(c.id) || { total: 0, in: 0, out: 0, ai: 0, read: 0 }
    const stagesMap = contactStages.get(c.id)
    const orders = contactOrders.get(c.id)
    const displayName = c.name
      || [c.first_name, c.last_name].filter(Boolean).join(' ')
      || ''
    return {
      contact_id: c.id,
      phone_number: c.phone_number,
      name: displayName,
      email: c.email || '',
      language: c.preferred_language,
      opt_in_status: c.opt_in_status,
      stages: stagesMap ? [...stagesMap.values()] : [],
      messages_total: counts.total,
      messages_in: counts.in,
      messages_out: counts.out,
      messages_ai: counts.ai,
      messages_read: counts.read,
      orders_count: orders?.count || 0,
      revenue_total: orders ? Math.round(orders.total * 100) / 100 : 0,
      currency: orders?.currency || null,
      last_order_at: c.last_order_at,
      last_activity_at: contactLastActivity.get(c.id) || null,
      created_at: c.created_at,
    }
  })

  // Tri par défaut : activité récente d'abord.
  rows.sort((a, b) => (b.last_activity_at || '').localeCompare(a.last_activity_at || ''))

  if (format === 'csv') {
    // Journal d'audit RGPD. Un export CSV sort les téléphones et emails des clients
    // du marchand HORS de la plateforme : c'est l'accès à volume par excellence, le
    // premier qu'on veut pouvoir retracer après un incident.
    // Seul l'export est journalisé, pas la lecture à l'écran : tracer chaque
    // affichage produirait des millions de lignes sans valeur d'audit.
    // Non-awaité : on n'ajoute pas de latence au téléchargement.
    void logDataAccess({
      action: 'export',
      resource: 'contacts',
      recordCount: rows.length,
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorRole: 'user',
      metadata: { format: 'csv' },
      req,
    })
    return csvResponse(rows)
  }
  return NextResponse.json({ data: rows })
}

// --- Export CSV ------------------------------------------------------------

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function csvResponse(rows: ContactTableRow[]): NextResponse {
  const header = [
    'Numéro', 'Nom', 'Email', 'Langue', 'Opt-in', 'État du lead',
    'Messages (total)', 'Reçus', 'Envoyés', 'Envoyés par IA', 'Vues (lus)',
    'Commandes', 'CA total', 'Devise', 'Dernière commande', 'Dernière activité',
  ].join(',')

  const optinFr: Record<string, string> = { subscribed: 'Abonné', opted_out: 'Désabonné', none: '—' }

  const lines = rows.map((r) =>
    [
      r.phone_number,
      r.name,
      r.email,
      r.language || '',
      optinFr[r.opt_in_status] || r.opt_in_status,
      r.stages.map((s) => s.name).join(' / '),
      r.messages_total,
      r.messages_in,
      r.messages_out,
      r.messages_ai,
      r.messages_read,
      r.orders_count,
      r.revenue_total,
      r.currency || '',
      r.last_order_at ? r.last_order_at.slice(0, 10) : '',
      r.last_activity_at ? r.last_activity_at.slice(0, 10) : '',
    ].map(csvCell).join(',')
  )

  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  const csv = '﻿' + [header, ...lines].join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contacts-xeyo.csv"',
    },
  })
}
