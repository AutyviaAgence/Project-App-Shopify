-- ============================================================================
-- Migration: Expand credentials to support non-OAuth types
-- Adds credential_type column, makes client_id/client_secret nullable,
-- so we can store API keys, Basic auth, Bearer tokens as shared credentials.
-- ============================================================================

-- 1. Add credential_type column (default 'oauth2' for backward compat)
ALTER TABLE public.oauth_credentials
  ADD COLUMN IF NOT EXISTS credential_type TEXT NOT NULL DEFAULT 'oauth2';

-- 2. Make client_id and client_secret nullable (non-OAuth types don't need them)
ALTER TABLE public.oauth_credentials
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.oauth_credentials
  ALTER COLUMN client_secret DROP NOT NULL;

-- 3. Add check constraint: oauth2 type requires client_id and client_secret
-- (use DO block to avoid duplicate constraint error on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_oauth2_requires_client'
  ) THEN
    ALTER TABLE public.oauth_credentials
      ADD CONSTRAINT chk_oauth2_requires_client
      CHECK (
        credential_type != 'oauth2'
        OR (client_id IS NOT NULL AND client_secret IS NOT NULL)
      );
  END IF;
END $$;

-- 4. Index on credential_type for filtering
CREATE INDEX IF NOT EXISTS idx_oauth_credentials_type
  ON public.oauth_credentials(user_id, credential_type);
