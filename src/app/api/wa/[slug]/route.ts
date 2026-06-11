import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import crypto from 'crypto'
import geoip from 'geoip-lite'
import { UAParser } from 'ua-parser-js'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * GET /api/wa/[slug]
 * Endpoint public (pas d'auth) — redirige vers wa.me avec le bon numéro et message.
 * Incrémente le compteur de clics et log le clic enrichi dans link_clicks.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Rate limit public endpoint
  const rateLimitResponse = checkRateLimit(req, 'STANDARD')
  if (rateLimitResponse) return rateLimitResponse

  const { slug } = await params

  const supabase = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Récupérer le lien avec la session associée
  const { data: link, error } = await supabase
    .from('wa_links')
    .select('*, whatsapp_sessions(phone_number)')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (error || !link) {
    return NextResponse.json({ error: 'Lien introuvable ou inactif' }, { status: 404 })
  }

  const session = link.whatsapp_sessions as { phone_number: string | null } | null
  const phone = session?.phone_number

  if (!phone) {
    return NextResponse.json({ error: 'Session non configurée' }, { status: 404 })
  }

  // Valider le format du numéro de téléphone
  if (!/^[0-9]{1,15}$/.test(phone)) {
    return NextResponse.json({ error: 'Numéro WhatsApp invalide' }, { status: 500 })
  }

  // --- Collecter les métadonnées du clic ---
  const userAgent = req.headers.get('user-agent') || null
  const referer = req.headers.get('referer') || null
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null

  // Géolocalisation (avant le hash)
  let country: string | null = null
  let city: string | null = null
  if (rawIp) {
    const geo = geoip.lookup(rawIp)
    country = geo?.country ?? null
    city = geo?.city ?? null
  }

  // Hash IP
  const ipHash = rawIp
    ? crypto.createHash('sha256').update(rawIp).digest('hex').slice(0, 16)
    : null

  // User-Agent parsing
  let deviceType: string | null = null
  let os: string | null = null
  let browser: string | null = null
  if (userAgent) {
    const parser = new UAParser(userAgent)
    const result = parser.getResult()
    deviceType = result.device?.type || 'desktop'
    os = result.os?.name ?? null
    browser = result.browser?.name ?? null
  }

  // UTM parameters (depuis l'URL du lien traqué)
  const { searchParams } = req.nextUrl
  const utmSource = searchParams.get('utm_source') || null
  const utmMedium = searchParams.get('utm_medium') || null
  const utmCampaign = searchParams.get('utm_campaign') || null

  // Visiteur unique ? (vérifier si ip_hash déjà vu pour ce lien)
  let isUnique = true
  if (ipHash) {
    const { count } = await supabase
      .from('link_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('link_id', link.id)
      .eq('ip_hash', ipHash)
    isUnique = (count ?? 0) === 0
  }

  // --- Incrémenter le compteur atomiquement (fire-and-forget) ---
  supabase.rpc('increment_click_count', { p_link_id: link.id })
    .then(({ error: rpcErr }: { error: unknown }) => {
      if (rpcErr) {
        // Fallback si RPC pas encore déployée
        supabase
          .from('wa_links')
          .update({ click_count: (link.click_count || 0) + 1 })
          .eq('id', link.id)
          .then()
      }
    })

  // --- Logger le clic enrichi (fire-and-forget) ---
  supabase
    .from('link_clicks')
    .insert({
      link_id: link.id,
      user_agent: userAgent,
      ip_hash: ipHash,
      referer,
      country,
      city,
      device_type: deviceType,
      os,
      browser,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      is_unique: isUnique,
    })
    .then(({ error: clickErr }) => {
      if (clickErr) console.error('[wa/slug] link_clicks insert error:', clickErr.message)
    })

  // Construire l'URL WhatsApp via api.whatsapp.com/send (plus fiable que wa.me,
  // qui échouait sur certains navigateurs/réseaux).
  const text = link.pre_filled_message || ''
  const waUrl = `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`

  return NextResponse.redirect(waUrl)
}
