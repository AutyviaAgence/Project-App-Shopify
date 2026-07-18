import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { blockIfImpersonating } from '@/lib/admin/impersonation'

/** POST /api/account/delete — Supprimer le compte utilisateur */
export async function POST(req: NextRequest) {
  // Rate limiting strict — empêcher le brute-force de suppression
  const rateLimitResponse = checkRateLimit(req, 'AUTH')
  if (rateLimitResponse) return rateLimitResponse

  // ⚠️ Jamais de suppression de compte en mode impersonation.
  const blocked = await blockIfImpersonating()
  if (blocked) return blocked

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await req.json()
  const { password, confirmation } = body as {
    password: string
    confirmation: string
  }

  if (confirmation !== 'SUPPRIMER' && confirmation !== 'DELETE') {
    return NextResponse.json(
      { error: 'Veuillez taper SUPPRIMER (ou DELETE) pour confirmer' },
      { status: 400 }
    )
  }

  // L'utilisateur est déjà authentifié via getUser() — la confirmation textuelle suffit.
  // signInWithPassword est bloqué par le captcha Turnstile côté serveur.

  // Créer un client admin pour supprimer l'utilisateur
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey
    })
    return NextResponse.json(
      { error: 'Configuration serveur manquante (SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 500 }
    )
  }

  const adminSupabase = createAdminSupabase(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    // Récupérer les sessions WhatsApp pour nettoyage du Storage
    const { data: userSessions } = await adminSupabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', user.id)

    if (userSessions && userSessions.length > 0) {
      for (const session of userSessions) {
        // Lister et supprimer tous les fichiers du dossier de la session
        const { data: files } = await adminSupabase.storage
          .from('media')
          .list(session.id, { limit: 1000 })

        if (files && files.length > 0) {
          const paths = files.map(f => `${session.id}/${f.name}`)
          await adminSupabase.storage.from('media').remove(paths)
          console.log(`[Account Delete] Deleted ${paths.length} media files for session ${session.id}`)
        }
      }
    }

    // Supprimer les données utilisateur (les FK CASCADE supprimeront les données liées)
    // L'ordre est important pour respecter les contraintes FK

    // 3. Supprimer les sessions WhatsApp (cascade sur contacts, conversations, messages)
    const { error: e3 } = await adminSupabase
      .from('whatsapp_sessions')
      .delete()
      .eq('user_id', user.id)
    if (e3) console.error('Error deleting whatsapp_sessions:', e3)

    // 4. Supprimer les agents IA
    const { error: e4 } = await adminSupabase
      .from('ai_agents')
      .delete()
      .eq('user_id', user.id)
    if (e4) console.error('Error deleting ai_agents:', e4)

    // 5. Supprimer les documents de connaissance
    const { error: e5 } = await adminSupabase
      .from('knowledge_documents')
      .delete()
      .eq('user_id', user.id)
    if (e5) console.error('Error deleting knowledge_documents:', e5)

    // 6. Supprimer les liens WA
    const { error: e6 } = await adminSupabase
      .from('wa_links')
      .delete()
      .eq('user_id', user.id)
    if (e6) console.error('Error deleting wa_links:', e6)

    // 7. Supprimer les campagnes
    const { error: e7 } = await adminSupabase
      .from('campaigns')
      .delete()
      .eq('user_id', user.id)
    if (e7) console.error('Error deleting campaigns:', e7)

    // 8. Supprimer les alertes (table optionnelle)
    const { error: e8 } = await adminSupabase
      .from('alerts')
      .delete()
      .eq('user_id', user.id)
    if (e8 && !e8.message?.includes('does not exist')) {
      console.error('Error deleting alerts:', e8)
    }

    // 9. Supprimer les préférences utilisateur (table optionnelle)
    const { error: e8b } = await adminSupabase
      .from('user_preferences')
      .delete()
      .eq('user_id', user.id)
    if (e8b && !e8b.message?.includes('does not exist')) {
      console.error('Error deleting user_preferences:', e8b)
    }

    // 10. Supprimer les données de parrainage et affiliation
    console.log('[Account Delete] Step 10: referral/affiliate cleanup')
    const { error: er1 } = await adminSupabase.from('referral_rewards' as any)
      .delete()
      .or(`referrer_id.eq.${user.id},referee_id.eq.${user.id},rewarded_user_id.eq.${user.id}`)
    if (er1) console.error('[Account Delete] referral_rewards error:', er1.message)

    const { error: er2 } = await adminSupabase.from('affiliate_conversions' as any)
      .delete()
      .or(`affiliate_user_id.eq.${user.id},converted_user_id.eq.${user.id}`)
    if (er2) console.error('[Account Delete] affiliate_conversions error:', er2.message)

    const { error: er3 } = await adminSupabase.from('affiliate_codes' as any)
      .delete()
      .eq('user_id', user.id)
    if (er3) console.error('[Account Delete] affiliate_codes error:', er3.message)

    // 11. Supprimer le profil
    console.log('[Account Delete] Step 11: delete profile')
    const { error: e9 } = await adminSupabase
      .from('profiles')
      .delete()
      .eq('id', user.id)
    if (e9) console.error('Error deleting profiles:', e9.message)

    // 12. Supprimer l'utilisateur auth
    console.log('[Account Delete] Step 12: deleteUser auth')
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError.message)
      return NextResponse.json(
        { error: `Erreur lors de la suppression du compte: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { deleted: true } })
  } catch (error) {
    console.error('Unexpected error during account deletion:', error)
    return NextResponse.json(
      { error: `Erreur inattendue: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
