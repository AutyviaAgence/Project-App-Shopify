import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

/** POST /api/account/delete — Supprimer le compte utilisateur */
export async function POST(req: NextRequest) {
  // Rate limiting strict — empêcher le brute-force de suppression
  const rateLimitResponse = checkRateLimit(req, 'AUTH')
  if (rateLimitResponse) return rateLimitResponse

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

  if (!password) {
    return NextResponse.json(
      { error: 'Mot de passe requis pour confirmer la suppression' },
      { status: 400 }
    )
  }

  if (confirmation !== 'SUPPRIMER') {
    return NextResponse.json(
      { error: 'Veuillez taper SUPPRIMER pour confirmer' },
      { status: 400 }
    )
  }

  // Vérifier le mot de passe
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  })

  if (signInError) {
    return NextResponse.json(
      { error: 'Mot de passe incorrect' },
      { status: 400 }
    )
  }

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
    // Supprimer les données utilisateur (les FK CASCADE supprimeront les données liées)
    // L'ordre est important pour respecter les contraintes FK

    // 0. Nettoyer les invitations d'équipe
    await adminSupabase
      .from('team_invitations')
      .update({ used_by: null })
      .eq('used_by', user.id)
    const { error: e0 } = await adminSupabase
      .from('team_invitations')
      .delete()
      .eq('created_by', user.id)
    if (e0 && !e0.message?.includes('does not exist')) {
      console.error('Error deleting team_invitations:', e0)
    }

    // 1. Supprimer les team_members où l'utilisateur est membre
    const { error: e1 } = await adminSupabase
      .from('team_members')
      .delete()
      .eq('user_id', user.id)
    if (e1) console.error('Error deleting team_members:', e1)

    // 2. Supprimer les équipes où l'utilisateur est owner
    const { error: e2 } = await adminSupabase
      .from('teams')
      .delete()
      .eq('owner_id', user.id)
    if (e2) console.error('Error deleting teams:', e2)

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

    // 11. Supprimer le profil
    const { error: e9 } = await adminSupabase
      .from('profiles')
      .delete()
      .eq('id', user.id)
    if (e9) console.error('Error deleting profiles:', e9)

    // 12. Supprimer l'utilisateur auth
    const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
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
