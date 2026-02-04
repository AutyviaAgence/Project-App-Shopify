import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/account/purge
 * Purge les messages plus anciens que la durée de rétention configurée.
 * Cette API peut être appelée manuellement ou par un cron job.
 */
export async function POST() {
  try {
    const supabase = await createClient()

    // Vérifier l'authentification
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil avec la configuration de rétention
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('data_retention_months')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      return NextResponse.json({ error: 'Erreur profil' }, { status: 500 })
    }

    // Si pas de durée de rétention configurée, ne rien supprimer
    if (!profile.data_retention_months) {
      return NextResponse.json({
        success: true,
        message: 'Aucune durée de rétention configurée',
        deleted_count: 0,
      })
    }

    // Calculer la date limite
    const retentionMonths = profile.data_retention_months
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)
    const cutoffDateStr = cutoffDate.toISOString()

    // Récupérer les IDs des sessions de l'utilisateur
    const { data: sessions, error: sessionsError } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', user.id)

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError)
      return NextResponse.json({ error: 'Erreur sessions' }, { status: 500 })
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune session trouvée',
        deleted_count: 0,
      })
    }

    const sessionIds = sessions.map((s) => s.id)

    // Récupérer les conversations de ces sessions
    const { data: conversations, error: convsError } = await supabase
      .from('conversations')
      .select('id')
      .in('session_id', sessionIds)

    if (convsError) {
      console.error('Error fetching conversations:', convsError)
      return NextResponse.json({ error: 'Erreur conversations' }, { status: 500 })
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune conversation trouvée',
        deleted_count: 0,
      })
    }

    const conversationIds = conversations.map((c) => c.id)

    // Compter les messages à supprimer
    const { count: countToDelete, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)

    if (countError) {
      console.error('Error counting messages:', countError)
      return NextResponse.json({ error: 'Erreur comptage' }, { status: 500 })
    }

    // Supprimer les messages plus anciens que la date limite
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)

    if (deleteError) {
      console.error('Error deleting messages:', deleteError)
      return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `${countToDelete || 0} message(s) supprimé(s)`,
      deleted_count: countToDelete || 0,
      cutoff_date: cutoffDateStr,
      retention_months: retentionMonths,
    })
  } catch (error) {
    console.error('Purge error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * GET /api/account/purge
 * Prévisualise les messages qui seraient supprimés sans les supprimer.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    // Vérifier l'authentification
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Récupérer le profil avec la configuration de rétention
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('data_retention_months')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      return NextResponse.json({ error: 'Erreur profil' }, { status: 500 })
    }

    // Si pas de durée de rétention configurée
    if (!profile.data_retention_months) {
      return NextResponse.json({
        retention_months: null,
        messages_to_delete: 0,
        cutoff_date: null,
      })
    }

    // Calculer la date limite
    const retentionMonths = profile.data_retention_months
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)
    const cutoffDateStr = cutoffDate.toISOString()

    // Récupérer les IDs des sessions de l'utilisateur
    const { data: sessions, error: sessionsError } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', user.id)

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError)
      return NextResponse.json({ error: 'Erreur sessions' }, { status: 500 })
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({
        retention_months: retentionMonths,
        messages_to_delete: 0,
        cutoff_date: cutoffDateStr,
      })
    }

    const sessionIds = sessions.map((s) => s.id)

    // Récupérer les conversations de ces sessions
    const { data: conversations, error: convsError } = await supabase
      .from('conversations')
      .select('id')
      .in('session_id', sessionIds)

    if (convsError) {
      console.error('Error fetching conversations:', convsError)
      return NextResponse.json({ error: 'Erreur conversations' }, { status: 500 })
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({
        retention_months: retentionMonths,
        messages_to_delete: 0,
        cutoff_date: cutoffDateStr,
      })
    }

    const conversationIds = conversations.map((c) => c.id)

    // Compter les messages à supprimer
    const { count, error: countError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)

    if (countError) {
      console.error('Error counting messages:', countError)
      return NextResponse.json({ error: 'Erreur comptage' }, { status: 500 })
    }

    return NextResponse.json({
      retention_months: retentionMonths,
      messages_to_delete: count || 0,
      cutoff_date: cutoffDateStr,
    })
  } catch (error) {
    console.error('Purge preview error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
