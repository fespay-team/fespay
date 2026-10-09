-- FesPay initial PostgreSQL schema draft.
-- Status: REVIEW DRAFT, NOT A COMPLETE OR APPROVED MIGRATION.
-- Source: detailed-design.md §7. This is a new-schema proposal only.
-- Validate PostgreSQL version, auth ownership, all composite FKs and deferred
-- ledger constraint trigger before applying in any environment.

BEGIN;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETION_PENDING')),
  display_name varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identities (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_subject)
);
CREATE INDEX identities_account_idx ON identities(account_id);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account_expiry_idx ON sessions(account_id, expires_at);

CREATE TABLE events (
  id uuid PRIMARY KEY,
  owner_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name varchar(100) NOT NULL,
  status text NOT NULL,
  listing_status text NOT NULL,
  participation_mode text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(starts_at < ends_at)
);
CREATE INDEX events_status_start_idx ON events(status, starts_at, id);
CREATE TABLE event_policies (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version integer NOT NULL CHECK(version > 0),
  terms jsonb NOT NULL,
  effective_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, version), UNIQUE(event_id, id)
);
CREATE INDEX event_policies_effective_idx ON event_policies(event_id, effective_at);
CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE',
  accepted_policy_version integer NOT NULL,
  joined_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, account_id),
  FOREIGN KEY(event_id, accepted_policy_version) REFERENCES event_policies(event_id, version) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX memberships_account_status_idx ON memberships(account_id, status);
CREATE TABLE shops (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  name varchar(100) NOT NULL,
  description varchar(1000) NOT NULL DEFAULT '',
  status text NOT NULL,
  suspension jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, id)
);
CREATE INDEX shops_event_status_idx ON shops(event_id, status);
CREATE TABLE wallets (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  account_id uuid NOT NULL,
  available_amount numeric(30,0) NOT NULL DEFAULT 0 CHECK(available_amount >= 0),
  held_amount numeric(30,0) NOT NULL DEFAULT 0 CHECK(held_amount >= 0),
  refund_only_amount numeric(30,0) NOT NULL DEFAULT 0 CHECK(refund_only_amount >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, account_id), UNIQUE(event_id, id),
  FOREIGN KEY(event_id, account_id) REFERENCES memberships(event_id, account_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX wallets_event_account_idx ON wallets(event_id, account_id);
CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operation text NOT NULL,
  key varchar(128) NOT NULL,
  request_hash bytea NOT NULL,
  result_resource_id uuid,
  response_snapshot jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_account_id, event_id, operation, key)
);
CREATE INDEX idempotency_status_created_idx ON idempotency_keys(status, created_at);
CREATE TABLE transactions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'SUCCEEDED' CHECK(status = 'SUCCEEDED'),
  amount numeric(30,0) NOT NULL CHECK(amount > 0),
  actor_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  source_ref uuid,
  occurred_at timestamptz NOT NULL,
  idempotency_id uuid NOT NULL REFERENCES idempotency_keys(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, id)
);
CREATE INDEX transactions_event_time_idx ON transactions(event_id, occurred_at DESC, id);
CREATE INDEX transactions_source_ref_idx ON transactions(source_ref);
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  transaction_id uuid NOT NULL,
  account_code text NOT NULL,
  wallet_id uuid,
  amount numeric(31,0) NOT NULL CHECK(amount <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(event_id, transaction_id) REFERENCES transactions(event_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY(event_id, wallet_id) REFERENCES wallets(event_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX ledger_transaction_idx ON ledger_entries(event_id, transaction_id);
CREATE INDEX ledger_wallet_time_idx ON ledger_entries(wallet_id, created_at);

-- Remaining detailed-design tables are intentionally not emitted as empty
-- shells. Add them only after the OpenAPI contract and the unresolved §23
-- decisions settle their FK targets and state vocabularies.
COMMIT;
