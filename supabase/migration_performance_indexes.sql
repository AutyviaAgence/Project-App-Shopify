-- ============================================================================
-- Migration: Performance indexes
-- ============================================================================

-- Index sur contacts(name) pour la recherche
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

-- Index composite sur contacts(first_name, last_name) pour la recherche
CREATE INDEX IF NOT EXISTS idx_contacts_first_last_name ON contacts(first_name, last_name);

-- Index composite sur campaign_blacklist(session_id, contact_id) pour les lookups de campagne
CREATE INDEX IF NOT EXISTS idx_campaign_blacklist_session_contact ON campaign_blacklist(session_id, contact_id);

-- Index sur messages(conversation_id, created_at) pour le chargement paginé des messages
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC);
