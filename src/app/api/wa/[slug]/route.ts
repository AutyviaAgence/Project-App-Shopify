import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * GET /api/wa/[slug]
 * Endpoint public (pas d'auth) — redirige vers wa.me avec le bon numéro et message.
 * Incrémente le compteur de clics et log le clic dans link_clicks.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
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

  // Collecter les métadonnées du clic
  const userAgent = req.headers.get('user-agent') || null
  const referer = req.headers.get('referer') || null
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16) : null

  // Incrémenter le compteur + logger le clic (fire-and-forget)
  supabase
    .from('wa_links')
    .update({ click_count: (link.click_count || 0) + 1 })
    .eq('id', link.id)
    .then()

  supabase
    .from('link_clicks')
    .insert({
      link_id: link.id,
      user_agent: userAgent,
      ip_hash: ipHash,
      referer: referer,
    })
    .then(({ error: clickErr }) => {
      if (clickErr) console.error('[wa/slug] link_clicks insert error:', clickErr.message)
    })

  // Construire l'URL wa.me
  let waUrl = `https://wa.me/${phone}`
  if (link.pre_filled_message) {
    waUrl += `?text=${encodeURIComponent(link.pre_filled_message)}`
  }

  return NextResponse.redirect(waUrl)
}
