CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS profile_embeddings (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  source_version integer NOT NULL,
  source_hash text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL CHECK(dimensions = 768),
  template_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS embedding_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_version integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','failed','obsolete')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,source_version)
);
CREATE INDEX IF NOT EXISTS embedding_jobs_ready ON embedding_jobs(next_attempt_at) WHERE status IN ('pending','running');
CREATE TABLE IF NOT EXISTS query_embeddings (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  model text NOT NULL,
  template_version text NOT NULL,
  dimensions integer NOT NULL CHECK(dimensions = 768),
  embedding vector(768) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,input_hash,model,template_version,dimensions)
);
-- Aggregate counters contain no Places content, raw addresses, or member identifiers.
CREATE TABLE IF NOT EXISTS provider_budgets (
  bucket text PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
