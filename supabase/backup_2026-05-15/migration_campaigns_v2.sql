-- Migration v2: Agent de conversation pour suivi + filtre par liens
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Ajouter conversation_agent_id aux campagnes
-- =============================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS conversation_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL;

COMMENT ON COLUMN campaigns.conversation_agent_id IS 'Agent IA qui prendra le relais pour les réponses après le message de relance';

-- =============================================
-- 2. Ajouter filter_link_ids pour filtrer par liens WhatsApp
-- =============================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS filter_link_ids UUID[];

COMMENT ON COLUMN campaigns.filter_link_ids IS 'Filtrer les contacts venus via ces liens WhatsApp spécifiques';

-- =============================================
-- 3. Mettre à jour la fonction get_campaign_eligible_contacts
-- =============================================

-- Supprimer l'ancienne version de la fonction (avec 8 arguments)
DROP FUNCTION IF EXISTS get_campaign_eligible_contacts(UUID, UUID[], TEXT[], UUID[], INTEGER, BOOLEAN, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_campaign_eligible_contacts(
  p_user_id UUID,
  p_session_ids UUID[] DEFAULT NULL,
  p_tracking_sources TEXT[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_inactivity_days INTEGER DEFAULT NULL,
  p_exclude_replied BOOLEAN DEFAULT false,
  p_min_days_since_last_campaign INTEGER DEFAULT 7,
  p_max_recipients INTEGER DEFAULT 50,
  p_link_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  contact_id UUID,
  conversation_id UUID,
  session_id UUID,
  phone_number TEXT,
  contact_name TEXT,
  last_message_at TIMESTAMPTZ,
  days_inactive INTEGER,
  tracking_source TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id AS contact_id,
    conv.id AS conversation_id,
    c.session_id,
    c.phone_number,
    c.name AS contact_name,
    conv.last_message_at,
    EXTRACT(DAY FROM NOW() - conv.last_message_at)::INTEGER AS days_inactive,
    wl.tracking_source
  FROM contacts c
  JOIN conversations conv ON conv.contact_id = c.id
  JOIN whatsapp_sessions s ON s.id = c.session_id
  LEFT JOIN wa_links wl ON wl.id = conv.wa_link_id
  WHERE
    -- Accès utilisateur
    (s.user_id = p_user_id OR s.team_id IN (
      SELECT team_id FROM team_members WHERE user_id = p_user_id AND status = 'accepted'
    ))
    -- Filtre sessions
    AND (p_session_ids IS NULL OR c.session_id = ANY(p_session_ids))
    -- Filtre tracking source (via wa_links)
    AND (p_tracking_sources IS NULL OR wl.tracking_source = ANY(p_tracking_sources))
    -- Filtre par liens WhatsApp
    AND (p_link_ids IS NULL OR conv.wa_link_id = ANY(p_link_ids))
    -- Filtre tags
    AND (p_tag_ids IS NULL OR EXISTS (
      SELECT 1 FROM conversation_tag_assignments cta
      WHERE cta.conversation_id = conv.id AND cta.tag_id = ANY(p_tag_ids)
    ))
    -- Filtre inactivité
    AND (p_inactivity_days IS NULL OR conv.last_message_at < NOW() - (p_inactivity_days || ' days')::INTERVAL)
    -- Exclure ceux qui ont répondu (si demandé)
    AND (NOT p_exclude_replied OR NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = conv.id
      AND m.direction = 'inbound'
      AND m.created_at > conv.last_message_at - INTERVAL '1 day'
    ))
    -- Exclure blacklist
    AND NOT EXISTS (
      SELECT 1 FROM campaign_blacklist bl
      WHERE bl.contact_id = c.id AND bl.user_id = p_user_id
    )
    -- Exclure ceux contactés récemment par campagne
    AND NOT EXISTS (
      SELECT 1 FROM campaign_recipients cr
      JOIN campaigns camp ON camp.id = cr.campaign_id
      WHERE cr.contact_id = c.id
      AND cr.sent_at > NOW() - (p_min_days_since_last_campaign || ' days')::INTERVAL
      AND camp.user_id = p_user_id
    )
  ORDER BY c.id, conv.last_message_at DESC
  LIMIT p_max_recipients;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_campaign_eligible_contacts IS 'Retourne les contacts éligibles pour une campagne selon les filtres (v2 avec link_ids)';
