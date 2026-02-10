import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteMediaFiles } from '@/lib/storage/media'

type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact'
const VALID_MESSAGE_TYPES: MessageType[] = ['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact']

/**
 * Récupère les conversation_ids qui ont TOUS les tags spécifiés (logique ET).
 */
async function getConversationIdsByTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tagIds: string[]
): Promise<string[]> {
  const { data: assignments } = await supabase
    .from('conversation_tag_assignments')
    .select('conversation_id, tag_id')
    .in('tag_id', tagIds)

  if (!assignments || assignments.length === 0) return []

  // Compter combien de tags chaque conversation a parmi les tags demandés
  const convTagCounts: Record<string, number> = {}
  assignments.forEach((a: { conversation_id: string; tag_id: string }) => {
    convTagCounts[a.conversation_id] = (convTagCounts[a.conversation_id] || 0) + 1
  })

  // Garder celles qui ont TOUS les tags
  return Object.entries(convTagCounts)
    .filter(([, count]) => count === tagIds.length)
    .map(([id]) => id)
}

/**
 * Parse les filtres depuis les query params (GET) ou le body (POST).
 */
function parseFilters(searchParams: URLSearchParams) {
  const tagIdsParam = searchParams.get('tag_ids')
  const messageTypesParam = searchParams.get('message_types')

  const tagIds = tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : []
  const messageTypes = messageTypesParam
    ? messageTypesParam.split(',').filter((t): t is MessageType => VALID_MESSAGE_TYPES.includes(t as MessageType))
    : []

  return { tagIds, messageTypes }
}

/**
 * Logique commune pour récupérer les conversations filtrées de l'utilisateur.
 */
async function getFilteredConversationIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tagIds: string[]
): Promise<{ conversationIds: string[]; sessionIds: string[] } | null> {
  // Récupérer les sessions de l'utilisateur
  const { data: sessions, error: sessionsError } = await supabase
    .from('whatsapp_sessions')
    .select('id')
    .eq('user_id', userId)

  if (sessionsError || !sessions || sessions.length === 0) return null

  const sessionIds = sessions.map((s: { id: string }) => s.id)

  // Récupérer les conversations de ces sessions
  const { data: conversations, error: convsError } = await supabase
    .from('conversations')
    .select('id')
    .in('session_id', sessionIds)

  if (convsError || !conversations || conversations.length === 0) return null

  let conversationIds = conversations.map((c: { id: string }) => c.id)

  // Filtrer par tags si demandé (logique ET)
  if (tagIds.length > 0) {
    const taggedConvIds = await getConversationIdsByTags(supabase, tagIds)
    // Intersection : conversations de l'utilisateur ET ayant les tags
    conversationIds = conversationIds.filter((id: string) => taggedConvIds.includes(id))
  }

  return { conversationIds, sessionIds }
}

/**
 * POST /api/account/purge
 * Purge les messages plus anciens que la durée de rétention configurée.
 * Supporte les filtres par tags et types de messages.
 * Supprime aussi les fichiers média du storage.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Parse les filtres depuis le body
    let tagIds: string[] = []
    let messageTypes: MessageType[] = []
    try {
      const body = await req.json()
      tagIds = Array.isArray(body.tag_ids) ? body.tag_ids : []
      messageTypes = Array.isArray(body.message_types)
        ? body.message_types.filter((t: string): t is MessageType => VALID_MESSAGE_TYPES.includes(t as MessageType))
        : []
    } catch {
      // Pas de body JSON = pas de filtres
    }

    // Récupérer le profil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('data_retention_months')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Erreur profil' }, { status: 500 })
    }

    if (!profile.data_retention_months) {
      return NextResponse.json({
        success: true,
        message: 'Aucune durée de rétention configurée',
        deleted_count: 0,
        media_deleted: 0,
      })
    }

    const retentionMonths = profile.data_retention_months
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)
    const cutoffDateStr = cutoffDate.toISOString()

    // Récupérer les conversations filtrées
    const result = await getFilteredConversationIds(supabase, user.id, tagIds)
    if (!result || result.conversationIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune conversation trouvée',
        deleted_count: 0,
        media_deleted: 0,
      })
    }

    const { conversationIds } = result

    // 1. Récupérer les media_url des messages à supprimer (pour nettoyage storage)
    let mediaQuery = supabase
      .from('messages')
      .select('media_url')
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)
      .not('media_url', 'is', null)

    if (messageTypes.length > 0) {
      mediaQuery = mediaQuery.in('message_type', messageTypes)
    }

    const { data: mediaMessages } = await mediaQuery
    const mediaPaths = (mediaMessages || [])
      .map((m: { media_url: string | null }) => m.media_url)
      .filter((p): p is string => !!p)

    // 2. Compter les messages à supprimer
    let countQuery = supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)

    if (messageTypes.length > 0) {
      countQuery = countQuery.in('message_type', messageTypes)
    }

    const { count: countToDelete, error: countError } = await countQuery

    if (countError) {
      return NextResponse.json({ error: 'Erreur comptage' }, { status: 500 })
    }

    // 3. Supprimer les fichiers média du storage
    let mediaDeleted = 0
    if (mediaPaths.length > 0) {
      const storageResult = await deleteMediaFiles(mediaPaths)
      mediaDeleted = storageResult.deleted
    }

    // 4. Supprimer les messages de la DB
    let deleteQuery = supabase
      .from('messages')
      .delete()
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)

    if (messageTypes.length > 0) {
      deleteQuery = deleteQuery.in('message_type', messageTypes)
    }

    const { error: deleteError } = await deleteQuery

    if (deleteError) {
      console.error('Error deleting messages:', deleteError)
      return NextResponse.json({ error: 'Erreur suppression' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `${countToDelete || 0} message(s) supprimé(s), ${mediaDeleted} fichier(s) média supprimé(s)`,
      deleted_count: countToDelete || 0,
      media_deleted: mediaDeleted,
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
 * Supporte les filtres par tags et types de messages via query params.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Parse les filtres depuis les query params
    const { searchParams } = new URL(req.url)
    const { tagIds, messageTypes } = parseFilters(searchParams)

    // Récupérer le profil
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('data_retention_months')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return NextResponse.json({ error: 'Erreur profil' }, { status: 500 })
    }

    if (!profile.data_retention_months) {
      return NextResponse.json({
        retention_months: null,
        messages_to_delete: 0,
        media_to_delete: 0,
        cutoff_date: null,
      })
    }

    const retentionMonths = profile.data_retention_months
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)
    const cutoffDateStr = cutoffDate.toISOString()

    // Récupérer les conversations filtrées
    const result = await getFilteredConversationIds(supabase, user.id, tagIds)
    if (!result || result.conversationIds.length === 0) {
      return NextResponse.json({
        retention_months: retentionMonths,
        messages_to_delete: 0,
        media_to_delete: 0,
        cutoff_date: cutoffDateStr,
      })
    }

    const { conversationIds } = result

    // Compter les messages à supprimer
    let countQuery = supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)

    if (messageTypes.length > 0) {
      countQuery = countQuery.in('message_type', messageTypes)
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      return NextResponse.json({ error: 'Erreur comptage' }, { status: 500 })
    }

    // Compter les fichiers média à supprimer
    let mediaCountQuery = supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .lt('created_at', cutoffDateStr)
      .not('media_url', 'is', null)

    if (messageTypes.length > 0) {
      mediaCountQuery = mediaCountQuery.in('message_type', messageTypes)
    }

    const { count: mediaCount } = await mediaCountQuery

    return NextResponse.json({
      retention_months: retentionMonths,
      messages_to_delete: count || 0,
      media_to_delete: mediaCount || 0,
      cutoff_date: cutoffDateStr,
    })
  } catch (error) {
    console.error('Purge preview error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
