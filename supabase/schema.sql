-- ============================================================================
-- WhatsApp Multi-Session SaaS avec Agents IA - Schema SQL
-- ============================================================================
-- Exécuter ce fichier ENTIER dans le SQL Editor de Supabase.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Profils utilisateurs (lié à Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions WhatsApp (connexions Evolution API)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL UNIQUE,
  instance_id TEXT,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'qr_pending', 'error')),
  qr_code TEXT,
  phone_number TEXT,
  daily_ai_message_limit INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON whatsapp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON whatsapp_sessions(status);

-- Agents IA
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  objective TEXT,
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature FLOAT DEFAULT 0.7,
  response_delay_min INTEGER DEFAULT 0,
  response_delay_max INTEGER DEFAULT 0,
  max_messages_per_conversation INTEGER,
  inactivity_timeout_minutes INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_user ON ai_agents(user_id);

-- Liens WhatsApp (wa.me avec pré-message et tracking)
CREATE TABLE IF NOT EXISTS wa_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  pre_filled_message TEXT,
  tracking_source TEXT,
  click_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_links_user ON wa_links(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_links_session ON wa_links(session_id);
CREATE INDEX IF NOT EXISTS idx_wa_links_slug ON wa_links(slug);

-- Contacts WhatsApp
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  notes TEXT,
  ai_summary TEXT,
  ai_summary_updated_at TIMESTAMPTZ,
  profile_picture TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_contacts_session ON contacts(session_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  wa_link_id UUID REFERENCES wa_links(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count INT DEFAULT 0,
  is_ai_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact')),
  media_url TEXT,
  wa_message_id TEXT,
  sent_by TEXT NOT NULL CHECK (sent_by IN ('user', 'ai_agent', 'contact')),
  ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  ai_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id
  ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_ai_pending
  ON messages(conversation_id, ai_processed, created_at)
  WHERE direction = 'inbound' AND ai_processed = false;

-- Statistiques agrégées quotidiennes
CREATE TABLE IF NOT EXISTS stats_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  ai_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  wa_link_id UUID REFERENCES wa_links(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  messages_sent INT DEFAULT 0,
  messages_received INT DEFAULT 0,
  conversations_started INT DEFAULT 0,
  response_rate FLOAT,
  avg_response_time_seconds INT,
  UNIQUE(user_id, session_id, ai_agent_id, wa_link_id, date)
);

CREATE INDEX IF NOT EXISTS idx_stats_user ON stats_daily(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_date ON stats_daily(date DESC);

-- ============================================================================
-- FONCTIONS
-- ============================================================================

-- Auto-création profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON ai_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_wa_links_updated_at BEFORE UPDATE ON wa_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_daily ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- WhatsApp sessions
CREATE POLICY "Users can view own sessions" ON whatsapp_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own sessions" ON whatsapp_sessions
  FOR ALL USING (user_id = auth.uid());

-- AI agents
CREATE POLICY "Users can view own agents" ON ai_agents
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own agents" ON ai_agents
  FOR ALL USING (user_id = auth.uid());

-- WA links
CREATE POLICY "Users can view own links" ON wa_links
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own links" ON wa_links
  FOR ALL USING (user_id = auth.uid());

-- Contacts (via session ownership)
CREATE POLICY "Users can view contacts of own sessions" ON contacts
  FOR SELECT USING (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage contacts of own sessions" ON contacts
  FOR ALL USING (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()));

-- Conversations (via session ownership)
CREATE POLICY "Users can view conversations of own sessions" ON conversations
  FOR SELECT USING (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage conversations of own sessions" ON conversations
  FOR ALL USING (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()));

-- Messages (via session ownership)
CREATE POLICY "Users can view messages of own sessions" ON messages
  FOR SELECT USING (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert messages for own sessions" ON messages
  FOR INSERT WITH CHECK (session_id IN (SELECT id FROM whatsapp_sessions WHERE user_id = auth.uid()));

-- Stats
CREATE POLICY "Users can view own stats" ON stats_daily
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================================
-- REALTIME
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversations') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE conversations;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_sessions') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE whatsapp_sessions;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_sessions;

-- ============================================================================
-- STORAGE
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RAG - BASE DE CONNAISSANCES
-- ============================================================================

-- Documents de la base de connaissances
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  doc_type TEXT NOT NULL DEFAULT 'text' CHECK (doc_type IN ('pdf', 'text')),
  text_content TEXT,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  chunk_count INT DEFAULT 0,
  char_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_user ON knowledge_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_status ON knowledge_documents(status);

-- Chunks vectorisés
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_count INT,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user ON knowledge_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Association agents <-> documents (many-to-many)
CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_akd_agent ON agent_knowledge_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_akd_document ON agent_knowledge_documents(document_id);

-- RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON knowledge_documents
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own documents" ON knowledge_documents
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own documents" ON knowledge_documents
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own documents" ON knowledge_documents
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view own chunks" ON knowledge_chunks
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own chunks" ON knowledge_chunks
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own chunks" ON knowledge_chunks
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users can view own agent documents" ON agent_knowledge_documents
  FOR SELECT USING (agent_id IN (SELECT id FROM ai_agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own agent documents" ON agent_knowledge_documents
  FOR INSERT WITH CHECK (agent_id IN (SELECT id FROM ai_agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own agent documents" ON agent_knowledge_documents
  FOR DELETE USING (agent_id IN (SELECT id FROM ai_agents WHERE user_id = auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_knowledge_docs_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Fonction de recherche vectorielle (appelée via RPC avec service_role)
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_document_ids UUID[],
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  chunk_index INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM knowledge_chunks kc
  WHERE kc.document_id = ANY(match_document_ids)
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Storage bucket pour les PDFs de la base de connaissances
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own knowledge files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own knowledge files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own knowledge files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- FIN DU SCHEMA
-- ============================================================================
