import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'

/** POST /api/account/delete — Supprimer le compte utilisateur */
export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      { error: 'Configuration serveur manquante' },
      { status: 500 }
    )
  }

  const adminSupabase = createAdminSupabase(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Supprimer les données utilisateur (les FK CASCADE supprimeront les données liées)
  // L'ordre est important pour respecter les contraintes FK

  // 1. Supprimer les team_members où l'utilisateur est membre
  await adminSupabase
    .from('team_members')
    .delete()
    .eq('user_id', user.id)

  // 2. Supprimer les équipes où l'utilisateur est owner
  await adminSupabase
    .from('teams')
    .delete()
    .eq('owner_id', user.id)

  // 3. Supprimer les sessions WhatsApp (cascade sur contacts, conversations, messages)
  await adminSupabase
    .from('whatsapp_sessions')
    .delete()
    .eq('user_id', user.id)

  // 4. Supprimer les agents IA
  await adminSupabase
    .from('ai_agents')
    .delete()
    .eq('user_id', user.id)

  // 5. Supprimer les documents de connaissance
  await adminSupabase
    .from('knowledge_documents')
    .delete()
    .eq('user_id', user.id)

  // 6. Supprimer les liens WA
  await adminSupabase
    .from('wa_links')
    .delete()
    .eq('user_id', user.id)

  // 7. Supprimer les campagnes
  await adminSupabase
    .from('campaigns')
    .delete()
    .eq('user_id', user.id)

  // 8. Supprimer les alertes
  await adminSupabase
    .from('alerts')
    .delete()
    .eq('user_id', user.id)

  // 9. Supprimer le profil
  await adminSupabase
    .from('profiles')
    .delete()
    .eq('id', user.id)

  // 10. Supprimer l'utilisateur auth
  const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id)

  if (deleteError) {
    return NextResponse.json(
      { error: 'Erreur lors de la suppression du compte' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: { deleted: true } })
}
