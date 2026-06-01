-- ============================================================================
-- RAG Knowledge Base - Migration
-- ============================================================================

-- knowledge_documents: user-uploaded documents
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

-- knowledge_chunks: vector-embedded text chunks
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

-- IVFFlat index for vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- agent_knowledge_documents: many-to-many join between agents and documents
CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_akd_agent ON agent_knowledge_documents(agent_id);
CREATE INDEX IF NOT EXISTS idx_akd_document ON agent_knowledge_documents(document_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_knowledge_documents ENABLE ROW LEVEL SECURITY;

-- knowledge_documents
CREATE POLICY "Users can view own documents" ON knowledge_documents
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own documents" ON knowledge_documents
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own documents" ON knowledge_documents
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own documents" ON knowledge_documents
  FOR DELETE USING (user_id = auth.uid());

-- knowledge_chunks
CREATE POLICY "Users can view own chunks" ON knowledge_chunks
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own chunks" ON knowledge_chunks
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own chunks" ON knowledge_chunks
  FOR DELETE USING (user_id = auth.uid());

-- agent_knowledge_documents
CREATE POLICY "Users can view own agent documents" ON agent_knowledge_documents
  FOR SELECT USING (agent_id IN (SELECT id FROM ai_agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own agent documents" ON agent_knowledge_documents
  FOR INSERT WITH CHECK (agent_id IN (SELECT id FROM ai_agents WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete own agent documents" ON agent_knowledge_documents
  FOR DELETE USING (agent_id IN (SELECT id FROM ai_agents WHERE user_id = auth.uid()));

-- ============================================================================
-- updated_at trigger
-- ============================================================================

CREATE TRIGGER update_knowledge_docs_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Vector similarity search function (used by RAG pipeline)
-- Called with service_role from the webhook context, bypasses RLS.
-- ============================================================================

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

-- ============================================================================
-- Storage bucket for knowledge base PDFs
-- ============================================================================

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
