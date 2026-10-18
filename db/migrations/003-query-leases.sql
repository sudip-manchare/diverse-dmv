-- Coordinates overlapping uncached queries; never stores query text.
CREATE TABLE query_embedding_leases (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  model text NOT NULL,
  template_version text NOT NULL,
  dimensions integer NOT NULL CHECK(dimensions = 768),
  lease_token uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  PRIMARY KEY(account_id,input_hash,model,template_version,dimensions)
);
CREATE INDEX query_embedding_leases_expiry ON query_embedding_leases(lease_until);
