CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_uid text UNIQUE NOT NULL,
 name text NOT NULL, email text NOT NULL, phone text,
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','disabled','deleted')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES accounts(id),
 token_hash text UNIQUE NOT NULL, firebase_cookie text NOT NULL, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE TABLE profiles (
 account_id uuid PRIMARY KEY REFERENCES accounts(id), data jsonb NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1, cosmetic_version integer NOT NULL DEFAULT 1,
 published boolean NOT NULL DEFAULT false,
 indexing_status text NOT NULL DEFAULT 'draft' CHECK(indexing_status IN ('draft','pending','ready','failed')),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE pairs (
 low_id uuid NOT NULL REFERENCES accounts(id), high_id uuid NOT NULL REFERENCES accounts(id),
 cooldown_until timestamptz, PRIMARY KEY(low_id,high_id), CHECK(low_id < high_id)
);
CREATE TABLE requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), low_id uuid NOT NULL, high_id uuid NOT NULL,
 sender_id uuid NOT NULL REFERENCES accounts(id), recipient_id uuid NOT NULL REFERENCES accounts(id),
 introduction text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled','blocked')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(low_id,high_id) REFERENCES pairs(low_id,high_id),
 CHECK(sender_id <> recipient_id), CHECK((sender_id=low_id AND recipient_id=high_id) OR (sender_id=high_id AND recipient_id=low_id)),
 CHECK(char_length(introduction)<=500)
);
CREATE UNIQUE INDEX requests_one_pending_pair ON requests(low_id,high_id) WHERE status='pending';
CREATE INDEX requests_sender_time ON requests(sender_id,created_at);
CREATE INDEX requests_recipient ON requests(recipient_id,status);
CREATE TABLE connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), low_id uuid NOT NULL, high_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true, accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(), removed_at timestamptz,
 UNIQUE(low_id,high_id), FOREIGN KEY(low_id,high_id) REFERENCES pairs(low_id,high_id)
);
CREATE TABLE blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blocker_id uuid NOT NULL REFERENCES accounts(id), blocked_id uuid NOT NULL REFERENCES accounts(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE INDEX blocks_reverse ON blocks(blocked_id,blocker_id);
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), low_id uuid NOT NULL, high_id uuid NOT NULL,
 latest_message_id bigint, latest_message_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(low_id,high_id), FOREIGN KEY(low_id,high_id) REFERENCES pairs(low_id,high_id)
);
CREATE TABLE messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id),
 sender_id uuid NOT NULL REFERENCES accounts(id), body text NOT NULL,
 server_time timestamptz NOT NULL, client_operation_id uuid NOT NULL, payload_hash text NOT NULL,
 UNIQUE(sender_id,client_operation_id), CHECK(char_length(body) BETWEEN 1 AND 2000), CHECK(body !~ '^\s*$')
);
CREATE INDEX messages_history ON messages(conversation_id,server_time,id);
ALTER TABLE conversations ADD CONSTRAINT conversations_latest_message FOREIGN KEY(latest_message_id) REFERENCES messages(id);
CREATE TABLE operations (
 actor_id uuid NOT NULL REFERENCES accounts(id), operation_id uuid NOT NULL, action text NOT NULL,
 payload_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,operation_id)
);
CREATE TABLE deletion_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid UNIQUE NOT NULL REFERENCES accounts(id),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','processing','processed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz
);
CREATE TABLE rate_limits (
 bucket text NOT NULL, window_start timestamptz NOT NULL, hits integer NOT NULL DEFAULT 1,
 PRIMARY KEY(bucket,window_start)
);
