import 'server-only'
import { SupabaseClient } from '@supabase/supabase-js'
import { evolution } from './client'

type SyncResult = {
  success: boolean
  synced: number
  skipped: number
  error?: string
}

/**
 * Synchronise les contacts WhatsApp depuis Evolution API vers la base de données
 * Crée les contacts et conversations vides pour les chats existants
 */
export async function syncContactsFromWhatsApp(
  supabase: SupabaseClient,
  sessionId: string,
  instanceName: string
): Promise<SyncResult> {
  console.log(`[SyncContacts] Starting sync for session ${sessionId} (${instanceName})`)

  // 1. Récupérer les chats depuis Evolution API
  const chatsResult = await evolution.fetchChats(instanceName)

  if (!chatsResult.ok) {
    console.error('[SyncContacts] Failed to fetch chats:', chatsResult.error)
    return { success: false, synced: 0, skipped: 0, error: chatsResult.error }
  }

  const chats = chatsResult.data
  console.log(`[SyncContacts] Fetched ${chats.length} chats from WhatsApp`)

  let synced = 0
  let skipped = 0

  for (const chat of chats) {
    try {
      // Ignorer les groupes (se terminent par @g.us)
      if (chat.id.endsWith('@g.us')) {
        skipped++
        continue
      }

      // Ignorer les chats système (status@broadcast, etc.)
      if (chat.id.includes('broadcast') || chat.id.includes('status')) {
        skipped++
        continue
      }

      // Extraire le numéro de téléphone
      const phoneNumber = chat.id.split('@')[0]
      if (!phoneNumber || phoneNumber.length < 5) {
        skipped++
        continue
      }

      // Upsert le contact
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .upsert(
          {
            session_id: sessionId,
            phone_number: phoneNumber,
            name: chat.name || null,
          },
          { onConflict: 'session_id,phone_number' }
        )
        .select('id')
        .single()

      if (contactError || !contact) {
        console.warn(`[SyncContacts] Failed to upsert contact ${phoneNumber}:`, contactError)
        skipped++
        continue
      }

      // Upsert la conversation (sans écraser les données existantes)
      const { error: convError } = await supabase
        .from('conversations')
        .upsert(
          {
            session_id: sessionId,
            contact_id: contact.id,
            // Ne pas écraser last_message_at si déjà existant
          },
          {
            onConflict: 'session_id,contact_id',
            ignoreDuplicates: true, // Ne pas mettre à jour si existe déjà
          }
        )

      if (convError) {
        console.warn(`[SyncContacts] Failed to upsert conversation for ${phoneNumber}:`, convError)
        skipped++
        continue
      }

      synced++
    } catch (err) {
      console.error(`[SyncContacts] Error processing chat ${chat.id}:`, err)
      skipped++
    }
  }

  console.log(`[SyncContacts] Sync complete: ${synced} synced, ${skipped} skipped`)

  return { success: true, synced, skipped }
}
