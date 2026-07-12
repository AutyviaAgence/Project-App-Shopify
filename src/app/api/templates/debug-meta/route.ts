import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { wabaClient } from '@/lib/whatsapp-cloud/client'
import { decryptMessage } from '@/lib/crypto/encryption'

/**
 * DIAGNOSTIC TEMPORAIRE — GET /api/templates/debug-meta?name=marketing
 * Renvoie les components BRUTS que Meta expose pour un template, pour voir si
 * header.example.header_handle contient bien une URL d'image exploitable.
 * À SUPPRIMER après diagnostic.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') || 'marketing'

  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('waba_business_account_id, waba_access_token')
    .eq('user_id', user.id).eq('status', 'connected')
    .not('waba_business_account_id', 'is', null)
    .limit(1).maybeSingle()
  if (!session?.waba_business_account_id || !session.waba_access_token) {
    return NextResponse.json({ error: 'pas de session WABA' }, { status: 400 })
  }
  const token = decryptMessage(session.waba_access_token)
  const res = await wabaClient.listTemplates(session.waba_business_account_id, token)
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 })

  // Filtre par nom + résume la structure des headers (là où se cache le handle).
  const matches = (res.data.data as { name: string; language: string; components?: unknown[] }[])
    .filter((t) => t.name === name)
    .map((t) => ({
      name: t.name, language: t.language,
      components: (t.components || []).map((c) => {
        const comp = c as { type?: string; format?: string; example?: unknown; cards?: unknown[] }
        return {
          type: comp.type,
          format: comp.format,
          example: comp.example,          // ← header_handle est ici
          cards: (comp.cards as { components?: unknown[] }[] | undefined)?.map((card) => ({
            components: (card.components || []).map((cc) => {
              const x = cc as { type?: string; format?: string; example?: unknown }
              return { type: x.type, format: x.format, example: x.example }
            }),
          })),
        }
      }),
    }))

  return NextResponse.json({ count: matches.length, templates: matches })
}
