-- Migration: Campagnes de relance WhatsApp
-- À exécuter dans Supabase SQL Editor

-- =============================================
-- 1. Ajouter agent_type aux agents existants
-- =============================================

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'conversation'
  CHECK (agent_type IN ('conversation', 'relance'));

COMMENT ON COLUMN ai_agents.agent_type IS 'Type d''agent: conversation (répond aux messages) ou relance (génère premier message)';

-- =============================================
-- 2. Table campaigns
-- =============================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),

  -- Agent IA pour personnalisation (optionnel, doit être type 'relance')
  relance_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,

  -- Message template (utilisé si pas d'agent)
  message_template TEXT,

  -- Filtres de ciblage
  filter_session_ids UUID[],
  filter_tracking_sources TEXT[],
  filter_tag_ids UUID[],
  filter_inactivity_days INTEGER,
  filter_exclude_replied BOOLEAN DEFAULT false,

  -- Limites anti-ban
  max_recipients INTEGER DEFAULT 50,
  delay_between_min INTEGER DEFAULT 30,
  delay_between_max INTEGER DEFAULT 120,
  messages_per_hour INTEGER DEFAULT 20,
  send_hour_start INTEGER DEFAULT 9,
  send_hour_end INTEGER DEFAULT 21,
  min_response_rate FLOAT DEFAULT 0.10,
  min_days_since_last_campaign INTEGER DEFAULT 7,

  -- Planification
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,

  -- Stats agrégées
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_team ON campaigns(team_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE status = 'scheduled';

COMMENT ON TABLE campaigns IS 'Campagnes de relance WhatsApp avec protection anti-ban';

-- =============================================
-- 3. Table campaign_recipients
-- =============================================

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sending', 'sent', 'delivered', 'replied', 'failed', 'skipped')),

  -- Message envoyé (personnalisé par IA ou template)
  message_sent TEXT,

  -- Timestamps du cycle de vie
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,

  -- Erreur si échec
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact ON campaign_recipients(contact_id);

COMMENT ON TABLE campaign_recipients IS 'Destinataires d''une campagne avec statut d''envoi';

-- =============================================
-- 4. Table campaign_blacklist
-- =============================================

CREATE TABLE IF NOT EXISTS campaign_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  reason TEXT CHECK (reason IN ('opt_out', 'manual', 'low_engagement', 'complained')),
  keyword_matched TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_blacklist_user ON campaign_blacklist(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_blacklist_contact ON campaign_blacklist(contact_id);

COMMENT ON TABLE campaign_blacklist IS 'Contacts exclus des campagnes (opt-out, manuel, etc.)';

-- =============================================
-- 5. RLS Policies
-- =============================================

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_blacklist ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view team campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view campaign recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Service can manage recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can manage own blacklist" ON campaign_blacklist;

-- Campaigns: lecture (proprio + équipe)
CREATE POLICY "Users can view own campaigns" ON campaigns FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view team campaigns" ON campaigns FOR SELECT
  USING (team_id IN (
    SELECT team_id FROM team_members
    WHERE user_id = auth.uid() AND status = 'accepted'
  ));

-- Campaigns: gestion (proprio uniquement)
CREATE POLICY "Users can manage own campaigns" ON campaigns FOR ALL
  USING (user_id = auth.uid());

-- Recipients: lecture seule via campagne
CREATE POLICY "Users can view campaign recipients" ON campaign_recipients FOR SELECT
  USING (campaign_id IN (
    SELECT id FROM campaigns
    WHERE user_id = auth.uid()
    OR team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND status = 'accepted'
    )
  ));

-- Recipients: gestion via service role (Edge Function)
CREATE POLICY "Service can manage recipients" ON campaign_recipients FOR ALL
  USING (true)
  WITH CHECK (true);

-- Blacklist: gestion proprio
CREATE POLICY "Users can manage own blacklist" ON campaign_blacklist FOR ALL
  USING (user_id = auth.uid());

-- =============================================
-- 6. Trigger updated_at
-- =============================================

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 7. Fonction helper: contacts éligibles pour campagne
-- =============================================

CREATE OR REPLACE FUNCTION get_campaign_eligible_contacts(
  p_user_id UUID,
  p_session_ids UUID[] DEFAULT NULL,
  p_tracking_sources TEXT[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_inactivity_days INTEGER DEFAULT NULL,
  p_exclude_replied BOOLEAN DEFAULT false,
  p_min_days_since_last_campaign INTEGER DEFAULT 7,
  p_max_recipients INTEGER DEFAULT 50
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
    conv.tracking_source
  FROM contacts c
  JOIN conversations conv ON conv.contact_id = c.id
  JOIN whatsapp_sessions s ON s.id = c.session_id
  WHERE
    -- Accès utilisateur
    (s.user_id = p_user_id OR s.team_id IN (
      SELECT team_id FROM team_members WHERE user_id = p_user_id AND status = 'accepted'
    ))
    -- Filtre sessions
    AND (p_session_ids IS NULL OR c.session_id = ANY(p_session_ids))
    -- Filtre tracking source
    AND (p_tracking_sources IS NULL OR conv.tracking_source = ANY(p_tracking_sources))
    -- Filtre tags
    AND (p_tag_ids IS NULL OR EXISTS (
      SELECT 1 FROM conversation_tags ct
      WHERE ct.conversation_id = conv.id AND ct.id = ANY(p_tag_ids)
    ))
    -- Filtre inactivité
    AND (p_inactivity_days IS NULL OR conv.last_message_at < NOW() - (p_inactivity_days || ' days')::INTERVAL)
    -- Exclure ceux qui ont répondu (si demandé)
    AND (NOT p_exclude_replied OR NOT EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = conv.id
      AND m.direction = 'incoming'
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

COMMENT ON FUNCTION get_campaign_eligible_contacts IS 'Retourne les contacts éligibles pour une campagne selon les filtres';

-- =============================================
-- 8. Fonction helper: mettre à jour stats campagne
-- =============================================

CREATE OR REPLACE FUNCTION update_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE campaigns
  SET
    total_recipients = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent', 'delivered', 'replied')),
    delivered_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered', 'replied')),
    replied_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'replied'),
    failed_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_campaign_stats IS 'Met à jour les compteurs de stats d''une campagne';

-- =============================================
-- 9. Trigger: marquer replied quand message entrant
-- =============================================

CREATE OR REPLACE FUNCTION check_campaign_reply()
RETURNS TRIGGER AS $$
BEGIN
  -- Si message entrant, vérifier s'il répond à une campagne
  IF NEW.direction = 'incoming' THEN
    UPDATE campaign_recipients
    SET
      status = 'replied',
      replied_at = NOW()
    WHERE
      conversation_id = NEW.conversation_id
      AND status IN ('sent', 'delivered')
      AND sent_at > NOW() - INTERVAL '7 days';

    -- Mettre à jour stats de la campagne
    PERFORM update_campaign_stats(campaign_id)
    FROM campaign_recipients
    WHERE conversation_id = NEW.conversation_id
    AND replied_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_check_campaign_reply ON messages;
CREATE TRIGGER on_message_check_campaign_reply
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION check_campaign_reply();

-- =============================================
-- 10. Keywords opt-out
-- =============================================

CREATE TABLE IF NOT EXISTS campaign_opt_out_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer keywords par défaut
INSERT INTO campaign_opt_out_keywords (keyword) VALUES
  ('stop'),
  ('arrêter'),
  ('arreter'),
  ('désabonner'),
  ('desabonner'),
  ('unsubscribe'),
  ('ne plus recevoir'),
  ('spam'),
  ('harcèlement'),
  ('harcelement')
ON CONFLICT (keyword) DO NOTHING;

COMMENT ON TABLE campaign_opt_out_keywords IS 'Mots-clés déclenchant l''opt-out automatique des campagnes';
