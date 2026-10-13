-- FesPay PostgreSQL 16+ physical-model / constraint validation draft.
-- Design proposal, not a deployment migration. No production application.
-- API reference: PR #8, 52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32 (v0.4).
BEGIN;
CREATE EXTENSION IF NOT EXISTS citext;
-- Unconstrained numeric prevents scale coercion before CHECK. The finite
-- upper bound rejects NaN too; NaN sorts above every finite numeric value.
CREATE DOMAIN yen AS numeric CHECK (VALUE BETWEEN -999999999999999999999999999999 AND 999999999999999999999999999999 AND VALUE = trunc(VALUE));
CREATE DOMAIN positive_yen AS yen CHECK (VALUE > 0);
CREATE DOMAIN nonnegative_yen AS yen CHECK (VALUE >= 0);
CREATE DOMAIN signed_ledger_yen AS yen CHECK (VALUE <> 0);
CREATE DOMAIN stock_count AS bigint CHECK (VALUE BETWEEN 0 AND 2147483647);
CREATE DOMAIN positive_version AS bigint CHECK (VALUE > 0);

CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  auth_user_ref text UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','DELETION_PENDING','DELETED')),
  delete_after timestamptz,
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account_profiles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE,
  email citext NOT NULL UNIQUE,
  email_verified_at timestamptz,
  display_name varchar(100) NOT NULL,
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_contexts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  auth_session_ref text NOT NULL UNIQUE,
  business_mfa_verified_at timestamptz,
  last_business_activity_at timestamptz,
  privileged_mfa_verified_at timestamptz,
  revoked_at timestamptz,
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_control (
  id uuid PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
  status text NOT NULL CHECK(status IN ('ENABLED','EMERGENCY_STOP','DRAINING','CLOSED')),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publication_gates (
  id uuid PRIMARY KEY,
  gate text NOT NULL UNIQUE CHECK(gate IN ('G1','G2','G3','G4','G5')),
  status text NOT NULL CHECK(status IN ('PENDING','CONFIRMED','REVOKED')),
  responsible_account_id uuid,
  evidence_references jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(evidence_references)='array'),
  confirmed_at timestamptz,
  CHECK(status <> 'CONFIRMED' OR (responsible_account_id IS NOT NULL AND confirmed_at IS NOT NULL AND jsonb_array_length(evidence_references)>0)),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY,
  owner_account_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  lifecycle text NOT NULL DEFAULT 'DRAFT' CHECK(lifecycle IN ('DRAFT','PUBLISHED','RUNNING','SALES_ENDED','SETTLING','COMPLETED')),
  listed boolean NOT NULL DEFAULT false,
  guide_public boolean NOT NULL DEFAULT false,
  guide jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(guide)='object'),
  participation_mode text NOT NULL DEFAULT 'PUBLIC' CHECK(participation_mode IN ('PUBLIC','PASSWORD')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  first_charge_at timestamptz,
  CHECK(starts_at < ends_at),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_policies (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  policy_version positive_version NOT NULL,
  terms jsonb NOT NULL CHECK(jsonb_typeof(terms)='object'),
  effective_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  UNIQUE(event_id,policy_version),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_settings (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  policy_version positive_version NOT NULL,
  settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
  participation_password_ref text,
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  account_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LEFT','SUSPENDED')),
  accepted_policy_version positive_version NOT NULL,
  joined_at timestamptz NOT NULL,
  UNIQUE(event_id,account_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shops (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  description varchar(1000) NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('OPEN','CLOSED','ARCHIVED')),
  visible boolean NOT NULL DEFAULT true,
  accepting_new_payments boolean NOT NULL DEFAULT true,
  features jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(features)='object'),
  public_identifier varchar(128) UNIQUE,
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registers (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(event_id,shop_id,id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grants (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  account_id uuid NOT NULL,
  shop_id uuid,
  role text NOT NULL CHECK(role IN ('EVENT_OPERATOR','SHOP_MANAGER','CASHIER')),
  active boolean NOT NULL DEFAULT true,
  granted_by uuid NOT NULL,
  CHECK((role='EVENT_OPERATOR' AND shop_id IS NULL) OR (role IN ('SHOP_MANAGER','CASHIER') AND shop_id IS NOT NULL)),
  UNIQUE(event_id,id,account_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grant_permissions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  shop_id uuid,
  permission text NOT NULL CHECK(permission IN ('CREATE_PAYMENT_REQUEST','FULFILL_ORDER','CHARGE','CASH_REFUND','MANAGE_CASH_REFUNDS','CORRECT_CASH','INVESTIGATE_CASH','RECONCILE_CASH','PURCHASE_REFUND','MANAGE_PRODUCTS','MANAGE_INVENTORY','READ_REPORT','EXPORT','READ_AUDIT')),
  UNIQUE(grant_id,permission),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX grants_event_scope ON grant_permissions (event_id,account_id,permission) WHERE shop_id IS NULL;
CREATE UNIQUE INDEX grants_shop_scope ON grant_permissions (event_id,account_id,shop_id,permission) WHERE shop_id IS NOT NULL;
CREATE TABLE grant_registers (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  register_id uuid NOT NULL,
  UNIQUE(grant_id,register_id),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid,
  token_hash bytea UNIQUE,
  target_email citext,
  scope jsonb NOT NULL CHECK(jsonb_typeof(scope)='object'),
  status text NOT NULL CHECK(status IN ('ISSUED','ACCEPTED','DECLINED','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  accepted_by uuid,
  accepted_grant_id uuid,
  CHECK(status <> 'ISSUED' OR (token_hash IS NOT NULL AND target_email IS NOT NULL)),
  CHECK(status <> 'ACCEPTED' OR (accepted_by IS NOT NULL AND accepted_grant_id IS NOT NULL)),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ownership_transfers (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  old_owner_account_id uuid NOT NULL,
  new_owner_account_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  reason text NOT NULL,
  CHECK(old_owner_account_id<>new_owner_account_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ownership_one_pending ON ownership_transfers (event_id) WHERE status='PENDING';
CREATE TABLE suspensions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid,
  active boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX suspension_event_active ON suspensions (event_id) WHERE active AND shop_id IS NULL;
CREATE UNIQUE INDEX suspension_shop_active ON suspensions (event_id,shop_id) WHERE active AND shop_id IS NOT NULL;
CREATE TABLE wallets (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  account_id uuid NOT NULL,
  available_amount nonnegative_yen NOT NULL DEFAULT 0,
  held_amount nonnegative_yen NOT NULL DEFAULT 0,
  refund_only_amount nonnegative_yen NOT NULL DEFAULT 0,
  UNIQUE(event_id,account_id),
  UNIQUE(event_id,id,account_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dispute_preservations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  amount positive_yen NOT NULL,
  active boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  review_at timestamptz NOT NULL,
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY,
  scope text NOT NULL CHECK(scope IN ('EVENT','GLOBAL')),
  event_id uuid,
  actor_account_id uuid NOT NULL,
  operation text NOT NULL,
  key varchar(128) NOT NULL CHECK(key ~ '^[!-~]{1,128}$'),
  request_hash bytea NOT NULL CHECK(octet_length(request_hash)=32),
  status text NOT NULL CHECK(status IN ('PENDING','SUCCEEDED','REJECTED')),
  result_kind text,
  result_resource_id uuid,
  rejection_code text,
  CHECK((scope='GLOBAL' AND event_id IS NULL) OR (scope='EVENT' AND event_id IS NOT NULL)),
  CHECK(status <> 'SUCCEEDED' OR (result_kind IS NOT NULL AND result_resource_id IS NOT NULL)),
  CHECK(status <> 'REJECTED' OR rejection_code IS NOT NULL),
  UNIQUE(event_id,id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idempotency_event_scope ON idempotency_keys (actor_account_id,event_id,operation,key) WHERE scope='EVENT';
CREATE UNIQUE INDEX idempotency_global_scope ON idempotency_keys (actor_account_id,operation,key) WHERE scope='GLOBAL';
CREATE TABLE tokens (
  id uuid PRIMARY KEY,
  event_id uuid,
  purpose text NOT NULL CHECK(purpose IN ('RECEPTION','PAYMENT_A','PAYMENT_B','RECIPIENT','ORDER_RECEIPT','CONTACT_EMAIL')),
  subject_account_id uuid NOT NULL,
  resource_id uuid,
  token_hash bytea UNIQUE,
  binding_hash bytea,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK(purpose='CONTACT_EMAIL' OR event_id IS NOT NULL),
  CHECK(token_hash IS NOT NULL OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL),
  UNIQUE(event_id,id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pending address and verified ownership are separate from login identities.
CREATE TABLE contact_email_verifications (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  token_id uuid NOT NULL UNIQUE,
  email citext NOT NULL CHECK(char_length(email) BETWEEN 1 AND 254),
  verified_at timestamptz,
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contact_email_verified_owner ON contact_email_verifications (account_id,email,verified_at DESC) WHERE verified_at IS NOT NULL;
CREATE TABLE products (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  description varchar(1000) NOT NULL DEFAULT '',
  price positive_yen NOT NULL,
  status text NOT NULL CHECK(status IN ('ON_SALE','STOPPED','ARCHIVED')),
  display_order stock_count NOT NULL DEFAULT 0,
  inventory_managed boolean NOT NULL DEFAULT true,
  image_key text,
  UNIQUE(event_id,shop_id,id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL UNIQUE,
  on_hand stock_count NOT NULL DEFAULT 0,
  reserved stock_count NOT NULL DEFAULT 0,
  CHECK(reserved<=on_hand),
  UNIQUE(event_id,shop_id,product_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE carts (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  account_id uuid NOT NULL,
  route text NOT NULL CHECK(route IN ('MOBILE','FIXED_QR')),
  status text NOT NULL CHECK(status IN ('OPEN','CHECKOUT_PENDING','CHECKED_OUT','CANCELLED')),
  reference_total nonnegative_yen NOT NULL DEFAULT 0,
  payment_request_id uuid,
  CHECK(status NOT IN ('CHECKOUT_PENDING','CHECKED_OUT') OR payment_request_id IS NOT NULL),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cart_one_pending ON carts (event_id,shop_id,account_id) WHERE status='CHECKOUT_PENDING';
CREATE TABLE cart_lines (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  UNIQUE(cart_id,product_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_requests (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  register_id uuid,
  payer_account_id uuid,
  mode text NOT NULL CHECK(mode IN ('A','B','C','MOBILE')),
  basis text NOT NULL CHECK(basis IN ('AMOUNT','ITEMS')),
  status text NOT NULL CHECK(status IN ('CREATED','AWAITING_APPROVAL','SUCCEEDED','DECLINED','CANCELLED','EXPIRED')),
  amount positive_yen NOT NULL,
  content_snapshot jsonb NOT NULL CHECK(jsonb_typeof(content_snapshot)='object'),
  content_hash bytea NOT NULL CHECK(octet_length(content_hash)=32),
  content_version positive_version NOT NULL DEFAULT 1,
  approval_expires_at timestamptz,
  reservation_expires_at timestamptz,
  transaction_id uuid,
  CHECK(status <> 'AWAITING_APPROVAL' OR (payer_account_id IS NOT NULL AND approval_expires_at IS NOT NULL)),
  CHECK(status <> 'SUCCEEDED' OR (payer_account_id IS NOT NULL AND transaction_id IS NOT NULL)),
  CHECK(basis<>'AMOUNT' OR reservation_expires_at IS NULL),
  UNIQUE(event_id,id,transaction_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_requests_one_pending_b ON payment_requests (event_id,payer_account_id) WHERE mode='B' AND status='AWAITING_APPROVAL';
CREATE TABLE transactions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  type text NOT NULL CHECK(type IN ('CHARGE','PAYMENT','TRANSFER','CASH_REFUND_HOLD','CASH_REFUND_RELEASE','CASH_REFUND_PAID','PURCHASE_REFUND','CHARGE_REVERSAL','CASH_REFUND_CORRECTION','EXPIRATION')),
  status text NOT NULL DEFAULT 'SUCCEEDED' CHECK(status='SUCCEEDED'),
  amount positive_yen NOT NULL,
  actor_account_id uuid NOT NULL,
  idempotency_id uuid NOT NULL,
  source_transaction_id uuid,
  payment_request_id uuid,
  origin_kind text NOT NULL,
  origin_id uuid NOT NULL,
  posting_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
  occurred_at timestamptz NOT NULL,
  CHECK((type='PAYMENT')=(payment_request_id IS NOT NULL)),
  UNIQUE(event_id,id,payment_request_id),
  UNIQUE(event_id,payment_request_id),
  UNIQUE(event_id,origin_kind,origin_id),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  account_code text NOT NULL CHECK(account_code IN ('WALLET_AVAILABLE','WALLET_HELD','WALLET_REFUND_ONLY','EVENT_CASH','SHOP_SALES','EXPIRED_VALUE')),
  wallet_id uuid,
  shop_id uuid,
  amount signed_ledger_yen NOT NULL,
  CHECK((account_code IN ('WALLET_AVAILABLE','WALLET_HELD','WALLET_REFUND_ONLY'))=(wallet_id IS NOT NULL)),
  CHECK((account_code='SHOP_SALES')=(shop_id IS NOT NULL)),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_operations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid,
  account_id uuid NOT NULL,
  operator_account_id uuid NOT NULL,
  type text NOT NULL CHECK(type IN ('CHARGE','CASH_REFUND')),
  balance_source text CHECK(balance_source IN ('AVAILABLE','REFUND_ONLY')),
  status text NOT NULL,
  amount positive_yen NOT NULL,
  transaction_id uuid,
  cash_received_confirmed boolean NOT NULL DEFAULT false,
  cash_returned_confirmed boolean NOT NULL DEFAULT false,
  cash_not_delivered_confirmed boolean NOT NULL DEFAULT false,
  reason text,
  CHECK((type='CHARGE' AND balance_source IS NULL AND status IN ('PREPARED','SUCCEEDED','CANCELLED','INVESTIGATING')) OR (type='CASH_REFUND' AND balance_source IS NOT NULL AND status IN ('PREPARED','HELD','CASH_HANDING','PAID','CANCELLED','INVESTIGATING'))),
  CHECK(status NOT IN ('SUCCEEDED','PAID') OR transaction_id IS NOT NULL),
  UNIQUE(event_id,id,balance_source),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cash_operations_one_open_refund ON cash_operations (event_id,account_id) WHERE type='CASH_REFUND' AND status IN ('PREPARED','HELD','CASH_HANDING','INVESTIGATING');
CREATE TABLE holds (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  cash_operation_id uuid NOT NULL UNIQUE,
  source_bucket text NOT NULL CHECK(source_bucket IN ('AVAILABLE','REFUND_ONLY')),
  hold_transaction_id uuid NOT NULL UNIQUE,
  release_transaction_id uuid UNIQUE,
  amount positive_yen NOT NULL,
  status text NOT NULL CHECK(status IN ('HELD','RELEASED')),
  warning_at timestamptz NOT NULL,
  investigate_after timestamptz NOT NULL,
  CHECK((status='RELEASED')=(release_transaction_id IS NOT NULL)),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transfer_requests (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  sender_account_id uuid NOT NULL,
  recipient_account_id uuid NOT NULL,
  recipient_token_id uuid NOT NULL,
  amount positive_yen NOT NULL,
  previewed_sender_amount nonnegative_yen NOT NULL,
  previewed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('PREPARED','SUCCEEDED','CANCELLED','EXPIRED')),
  transaction_id uuid UNIQUE,
  CHECK(sender_account_id<>recipient_account_id),
  CHECK((status='SUCCEEDED')=(transaction_id IS NOT NULL)),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX transfer_one_token ON transfer_requests (recipient_token_id) WHERE status='SUCCEEDED';
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  account_id uuid NOT NULL,
  payment_request_id uuid NOT NULL UNIQUE,
  transaction_id uuid NOT NULL UNIQUE,
  display_number varchar(40) NOT NULL,
  route text NOT NULL CHECK(route IN ('REGISTER_A','REGISTER_B','FIXED_QR','MOBILE')),
  payment_status text NOT NULL DEFAULT 'PAID' CHECK(payment_status='PAID'),
  fulfillment_status text NOT NULL CHECK(fulfillment_status IN ('ACCEPTED','PREPARING','READY','PICKED_UP','CANCELLED')),
  refund_status text NOT NULL DEFAULT 'NONE' CHECK(refund_status IN ('NONE','PARTIAL','FULL','INVESTIGATING')),
  total_amount positive_yen NOT NULL,
  UNIQUE(event_id,shop_id,id),
  UNIQUE(event_id,shop_id,display_number),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_lines (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name_snapshot varchar(100) NOT NULL,
  unit_price positive_yen NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  line_total positive_yen NOT NULL,
  product_version positive_version NOT NULL,
  CHECK(line_total=unit_price*quantity),
  UNIQUE(event_id,shop_id,id,product_id),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_reservations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL,
  payment_request_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  status text NOT NULL CHECK(status IN ('RESERVED','CONSUMED','RELEASED','EXPIRED')),
  expires_at timestamptz NOT NULL,
  UNIQUE(payment_request_id,product_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  original_transaction_id uuid NOT NULL,
  order_id uuid,
  requested_by uuid NOT NULL,
  basis text NOT NULL CHECK(basis IN ('AMOUNT','ITEMS')),
  amount positive_yen NOT NULL,
  destination_bucket text CHECK(destination_bucket IN ('AVAILABLE','REFUND_ONLY')),
  refund_transaction_id uuid UNIQUE,
  status text NOT NULL CHECK(status IN ('REQUESTED','INVESTIGATING','SUCCEEDED','REJECTED')),
  reason text NOT NULL,
  idempotency_id uuid NOT NULL,
  investigation_code text,
  rejection_code text,
  CHECK((status='SUCCEEDED')=(destination_bucket IS NOT NULL AND refund_transaction_id IS NOT NULL)),
  CHECK(status='SUCCEEDED' OR (destination_bucket IS NULL AND refund_transaction_id IS NULL)),
  CHECK(status<>'INVESTIGATING' OR investigation_code IS NOT NULL),
  CHECK(status<>'REJECTED' OR rejection_code IS NOT NULL),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refund_lines (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  refund_id uuid NOT NULL,
  order_line_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  amount positive_yen NOT NULL,
  restored_quantity integer NOT NULL DEFAULT 0 CHECK(restored_quantity BETWEEN 0 AND quantity),
  UNIQUE(refund_id,order_line_id),
  UNIQUE(event_id,shop_id,id,product_id),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE stock_moves (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('ADD','WASTE','CORRECTION','RETURN_TO_STOCK')),
  refund_line_id uuid,
  idempotency_id uuid NOT NULL,
  delta bigint NOT NULL CHECK(delta BETWEEN -2147483647 AND 2147483647 AND (delta<>0 OR kind='CORRECTION')),
  reason text NOT NULL,
  actor_account_id uuid NOT NULL,
  CHECK((kind='RETURN_TO_STOCK' AND refund_line_id IS NOT NULL AND delta>0) OR (kind<>'RETURN_TO_STOCK' AND refund_line_id IS NULL)),
  UNIQUE(idempotency_id),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_cancellations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  order_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('REQUESTED','APPROVED','REJECTED','INVESTIGATING')),
  purchase_refund_id uuid,
  reason text NOT NULL,
  CHECK(status NOT IN ('APPROVED','INVESTIGATING') OR purchase_refund_id IS NOT NULL),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cancellation_one_open ON order_cancellations (order_id) WHERE status IN ('REQUESTED','INVESTIGATING');
CREATE TABLE receipt_verifications (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  order_id uuid NOT NULL UNIQUE,
  failure_count stock_count NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL,
  held_at timestamptz,
  recovery_token_id uuid,
  consumed_at timestamptz,
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_corrections (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  cash_operation_id uuid NOT NULL,
  original_transaction_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('CHARGE_REVERSAL','CASH_REFUND_CORRECTION')),
  amount positive_yen NOT NULL,
  balance_source text NOT NULL CHECK(balance_source IN ('AVAILABLE','REFUND_ONLY')),
  transaction_id uuid NOT NULL UNIQUE,
  cash_return_status text NOT NULL CHECK(cash_return_status IN ('PENDING_RETURN','RETURNED','NOT_REQUIRED','INVESTIGATING')),
  reason text NOT NULL,
  resolution_case_id uuid,
  CHECK(kind='CHARGE_REVERSAL' OR cash_return_status='NOT_REQUIRED'),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cash_refund_correction_once ON cash_corrections (original_transaction_id) WHERE kind='CASH_REFUND_CORRECTION';
CREATE TABLE cash_movements (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  operator_account_id uuid,
  scope text NOT NULL CHECK(scope IN ('EVENT','OPERATOR')),
  reception_place text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('OPENING_FLOAT','DEPOSIT','WITHDRAWAL')),
  amount positive_yen NOT NULL,
  idempotency_id uuid NOT NULL UNIQUE,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL,
  CHECK((scope='OPERATOR')=(operator_account_id IS NOT NULL)),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_snapshots (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  dataset text NOT NULL CHECK(dataset IN ('TRANSACTIONS','SALES','ORDERS','CASH','RECONCILIATION','SALES_BREAKDOWN')),
  filters jsonb NOT NULL CHECK(jsonb_typeof(filters)='object'),
  status text NOT NULL CHECK(status IN ('RESERVED','MATERIALIZED','EXPIRED')),
  snapshot_at timestamptz,
  row_count numeric NOT NULL DEFAULT 0 CHECK(row_count>=0 AND row_count=trunc(row_count) AND row_count<>'NaN'::numeric),
  CHECK(status='RESERVED' OR snapshot_at IS NOT NULL),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_snapshot_rows (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  ordinal bigint NOT NULL CHECK(ordinal>0),
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
  UNIQUE(snapshot_id,ordinal),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_reconciliations (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('EVENT','OPERATOR')),
  operator_account_id uuid,
  reception_place text NOT NULL,
  snapshot_id uuid NOT NULL,
  counted_at timestamptz NOT NULL,
  cutoff_record text NOT NULL,
  totals jsonb NOT NULL CHECK(jsonb_typeof(totals)='object'),
  actual_amount nonnegative_yen NOT NULL,
  difference numeric NOT NULL CHECK(difference=trunc(difference) AND difference<>'NaN'::numeric AND abs(difference)<>'Infinity'::numeric),
  idempotency_id uuid NOT NULL UNIQUE,
  CHECK((scope='OPERATOR')=(operator_account_id IS NOT NULL)),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_cases (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  source_type text NOT NULL CHECK(source_type IN ('CHARGE','CASH_REFUND','CORRECTION','CASH_RECONCILIATION')),
  cash_operation_id uuid,
  correction_id uuid,
  reconciliation_id uuid,
  status text NOT NULL CHECK(status IN ('OPEN','INVESTIGATING','RESOLVED')),
  cash_fact text NOT NULL CHECK(cash_fact IN ('UNKNOWN','RECEIVED','NOT_RECEIVED','HANDED','NOT_HANDED','RETURNED','NOT_RETURNED','COUNT_CONFIRMED')),
  db_outcome text NOT NULL CHECK(db_outcome IN ('UNKNOWN','COMMITTED','NOT_COMMITTED','NOT_APPLICABLE')),
  reason text NOT NULL,
  resolution_reason text,
  evidence_references jsonb,
  resolved_at timestamptz,
  CHECK((source_type IN ('CHARGE','CASH_REFUND') AND cash_operation_id IS NOT NULL AND correction_id IS NULL AND reconciliation_id IS NULL) OR (source_type='CORRECTION' AND cash_operation_id IS NULL AND correction_id IS NOT NULL AND reconciliation_id IS NULL) OR (source_type='CASH_RECONCILIATION' AND cash_operation_id IS NULL AND correction_id IS NULL AND reconciliation_id IS NOT NULL)),
  CHECK(status<>'RESOLVED' OR (resolved_at IS NOT NULL AND resolution_reason IS NOT NULL AND evidence_references IS NOT NULL AND jsonb_typeof(evidence_references)='array' AND jsonb_array_length(evidence_references)>0 AND db_outcome<>'UNKNOWN' AND cash_fact<>'UNKNOWN')),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expiration_runs (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  policy_version positive_version NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','COMPLETED','INVESTIGATING')),
  processed_wallet_count bigint NOT NULL DEFAULT 0 CHECK(processed_wallet_count>=0),
  remaining_wallet_count bigint NOT NULL DEFAULT 0 CHECK(remaining_wallet_count>=0),
  expired_amount numeric NOT NULL DEFAULT 0 CHECK(expired_amount>=0 AND expired_amount=trunc(expired_amount) AND expired_amount<>'NaN'::numeric AND expired_amount<>'Infinity'::numeric),
  UNIQUE(event_id,policy_version,expires_at),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expiration_items (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  run_id uuid NOT NULL,
  wallet_id uuid NOT NULL,
  policy_version positive_version NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('PENDING','SUCCEEDED','PRESERVED','INVESTIGATING')),
  amount nonnegative_yen NOT NULL DEFAULT 0,
  transaction_id uuid UNIQUE,
  UNIQUE(wallet_id,policy_version,expires_at),
  CHECK((amount>0 AND status='SUCCEEDED')=(transaction_id IS NOT NULL)),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exports (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  snapshot_id uuid NOT NULL UNIQUE,
  dataset text NOT NULL CHECK(dataset IN ('TRANSACTIONS','SALES','ORDERS','CASH')),
  filters jsonb NOT NULL CHECK(jsonb_typeof(filters)='object'),
  csv_schema_version integer NOT NULL DEFAULT 1 CHECK(csv_schema_version=1),
  status text NOT NULL CHECK(status IN ('QUEUED','GENERATING','READY','FAILED','EXPIRED')),
  row_count numeric CHECK(row_count>=0 AND row_count=trunc(row_count) AND row_count<>'NaN'::numeric AND row_count<>'Infinity'::numeric),
  snapshot_at timestamptz,
  generated_at timestamptz,
  expires_at timestamptz,
  error_code text,
  CHECK(status NOT IN ('GENERATING','READY','EXPIRED') OR snapshot_at IS NOT NULL),
  CHECK(status NOT IN ('READY','EXPIRED') OR (generated_at IS NOT NULL AND expires_at=generated_at+interval '24 hours' AND row_count IS NOT NULL)),
  CHECK(status<>'FAILED' OR error_code IS NOT NULL),
  UNIQUE(id,requested_by),
  UNIQUE(event_id, id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_parts (
  id uuid PRIMARY KEY,
  export_id uuid NOT NULL,
  part_index bigint NOT NULL CHECK(part_index>0),
  row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 100000),
  object_key text,
  content_hash bytea,
  UNIQUE(export_id,part_index),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_slots (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  slot integer NOT NULL CHECK(slot IN (1,2)),
  export_id uuid NOT NULL UNIQUE,
  UNIQUE(account_id,slot),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit (
  id uuid PRIMARY KEY,
  event_id uuid,
  shop_id uuid,
  actor_account_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  reason text,
  safe_changes jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(safe_changes)='object'),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  id uuid PRIMARY KEY,
  event_id uuid,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version positive_version,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','LEASED','DELIVERED')),
  retry_count stock_count NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  lease_version bigint NOT NULL DEFAULT 0 CHECK(lease_version>=0),
  lease_until timestamptz,
  processed_at timestamptz,
  UNIQUE(event_id,id),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_stream_positions (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  last_position bigint NOT NULL DEFAULT 0 CHECK(last_position>=0),
  version positive_version NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sse_replay_entries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  outbox_id uuid NOT NULL UNIQUE,
  position bigint NOT NULL CHECK(position>0),
  retain_until timestamptz NOT NULL,
  UNIQUE(event_id,position),
  UNIQUE(event_id, id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_profiles ADD CONSTRAINT account_profiles_0_fk FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE auth_contexts ADD CONSTRAINT auth_contexts_1_fk FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE publication_gates ADD CONSTRAINT publication_gates_2_fk FOREIGN KEY (responsible_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE events ADD CONSTRAINT events_3_fk FOREIGN KEY (owner_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE event_policies ADD CONSTRAINT event_policies_4_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE event_policies ADD CONSTRAINT event_policies_5_fk FOREIGN KEY (created_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE event_settings ADD CONSTRAINT event_settings_6_fk FOREIGN KEY (event_id,policy_version) REFERENCES event_policies (event_id,policy_version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE memberships ADD CONSTRAINT memberships_7_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE memberships ADD CONSTRAINT memberships_8_fk FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE memberships ADD CONSTRAINT memberships_9_fk FOREIGN KEY (event_id,accepted_policy_version) REFERENCES event_policies (event_id,policy_version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE shops ADD CONSTRAINT shops_10_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE registers ADD CONSTRAINT registers_11_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grants ADD CONSTRAINT grants_12_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grants ADD CONSTRAINT grants_13_fk FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grants ADD CONSTRAINT grants_14_fk FOREIGN KEY (granted_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grants ADD CONSTRAINT grants_15_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grant_permissions ADD CONSTRAINT grant_permissions_16_fk FOREIGN KEY (event_id,grant_id,account_id) REFERENCES grants (event_id,id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grant_permissions ADD CONSTRAINT grant_permissions_17_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grant_registers ADD CONSTRAINT grant_registers_18_fk FOREIGN KEY (event_id,grant_id) REFERENCES grants (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE grant_registers ADD CONSTRAINT grant_registers_19_fk FOREIGN KEY (event_id,shop_id,register_id) REFERENCES registers (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitations_20_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitations_21_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitations_22_fk FOREIGN KEY (created_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitations_23_fk FOREIGN KEY (accepted_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE invitations ADD CONSTRAINT invitations_24_fk FOREIGN KEY (event_id,accepted_grant_id) REFERENCES grants (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ownership_transfers ADD CONSTRAINT ownership_transfers_25_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ownership_transfers ADD CONSTRAINT ownership_transfers_26_fk FOREIGN KEY (old_owner_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ownership_transfers ADD CONSTRAINT ownership_transfers_27_fk FOREIGN KEY (new_owner_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE suspensions ADD CONSTRAINT suspensions_28_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE suspensions ADD CONSTRAINT suspensions_29_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE wallets ADD CONSTRAINT wallets_30_fk FOREIGN KEY (event_id,account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE dispute_preservations ADD CONSTRAINT dispute_preservations_31_fk FOREIGN KEY (event_id,wallet_id) REFERENCES wallets (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_32_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_33_fk FOREIGN KEY (actor_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tokens ADD CONSTRAINT tokens_34_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tokens ADD CONSTRAINT tokens_35_fk FOREIGN KEY (subject_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE tokens ADD UNIQUE(id,subject_account_id);
ALTER TABLE contact_email_verifications ADD FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE contact_email_verifications ADD FOREIGN KEY(token_id,account_id) REFERENCES tokens(id,subject_account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE products ADD CONSTRAINT products_36_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE inventory ADD CONSTRAINT inventory_37_fk FOREIGN KEY (event_id,shop_id,product_id) REFERENCES products (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE carts ADD CONSTRAINT carts_38_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE carts ADD CONSTRAINT carts_39_fk FOREIGN KEY (event_id,account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cart_lines ADD CONSTRAINT cart_lines_40_fk FOREIGN KEY (event_id,cart_id) REFERENCES carts (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cart_lines ADD CONSTRAINT cart_lines_41_fk FOREIGN KEY (event_id,shop_id,product_id) REFERENCES products (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_42_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_43_fk FOREIGN KEY (event_id,shop_id,register_id) REFERENCES registers (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_44_fk FOREIGN KEY (event_id,payer_account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE carts ADD CONSTRAINT carts_45_fk FOREIGN KEY (event_id,payment_request_id) REFERENCES payment_requests (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT transactions_46_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT transactions_47_fk FOREIGN KEY (actor_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT transactions_48_fk FOREIGN KEY (event_id,idempotency_id) REFERENCES idempotency_keys (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT transactions_49_fk FOREIGN KEY (event_id,source_transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transactions ADD CONSTRAINT transactions_50_fk FOREIGN KEY (event_id,payment_request_id) REFERENCES payment_requests (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_51_fk FOREIGN KEY (event_id,transaction_id,id) REFERENCES transactions (event_id,id,payment_request_id) ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_52_fk FOREIGN KEY (event_id,transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_53_fk FOREIGN KEY (event_id,wallet_id) REFERENCES wallets (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_54_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_55_fk FOREIGN KEY (event_id,account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_56_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_57_fk FOREIGN KEY (operator_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_operations ADD CONSTRAINT cash_operations_58_fk FOREIGN KEY (event_id,transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE holds ADD CONSTRAINT holds_59_fk FOREIGN KEY (event_id,wallet_id) REFERENCES wallets (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE holds ADD CONSTRAINT holds_60_fk FOREIGN KEY (event_id,cash_operation_id,source_bucket) REFERENCES cash_operations (event_id,id,balance_source) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE holds ADD CONSTRAINT holds_61_fk FOREIGN KEY (event_id,hold_transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE holds ADD CONSTRAINT holds_62_fk FOREIGN KEY (event_id,release_transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transfer_requests ADD CONSTRAINT transfer_requests_63_fk FOREIGN KEY (event_id,sender_account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transfer_requests ADD CONSTRAINT transfer_requests_64_fk FOREIGN KEY (event_id,recipient_account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transfer_requests ADD CONSTRAINT transfer_requests_65_fk FOREIGN KEY (event_id,recipient_token_id) REFERENCES tokens (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE transfer_requests ADD CONSTRAINT transfer_requests_66_fk FOREIGN KEY (event_id,transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT orders_67_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT orders_68_fk FOREIGN KEY (event_id,account_id) REFERENCES memberships (event_id,account_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE orders ADD CONSTRAINT orders_69_fk FOREIGN KEY (event_id,transaction_id,payment_request_id) REFERENCES transactions (event_id,id,payment_request_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE payment_requests ADD UNIQUE(event_id,id,shop_id,payer_account_id);
ALTER TABLE orders ADD CONSTRAINT orders_payment_scope_fk FOREIGN KEY(event_id,payment_request_id,shop_id,account_id) REFERENCES payment_requests(event_id,id,shop_id,payer_account_id) ON DELETE RESTRICT ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_70_fk FOREIGN KEY (event_id,shop_id,order_id) REFERENCES orders (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_lines ADD CONSTRAINT order_lines_71_fk FOREIGN KEY (event_id,shop_id,product_id) REFERENCES products (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_72_fk FOREIGN KEY (event_id,shop_id,product_id) REFERENCES products (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_reservations ADD CONSTRAINT stock_reservations_73_fk FOREIGN KEY (event_id,payment_request_id) REFERENCES payment_requests (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refunds_74_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refunds_75_fk FOREIGN KEY (event_id,original_transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refunds_76_fk FOREIGN KEY (event_id,refund_transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refunds_77_fk FOREIGN KEY (event_id,shop_id,order_id) REFERENCES orders (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refunds_78_fk FOREIGN KEY (requested_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refunds ADD CONSTRAINT refunds_79_fk FOREIGN KEY (event_id,idempotency_id) REFERENCES idempotency_keys (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refund_lines ADD CONSTRAINT refund_lines_80_fk FOREIGN KEY (event_id,refund_id) REFERENCES refunds (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refund_lines ADD CONSTRAINT refund_lines_81_fk FOREIGN KEY (event_id,shop_id,order_line_id,product_id) REFERENCES order_lines (event_id,shop_id,id,product_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_82_fk FOREIGN KEY (event_id,shop_id,product_id) REFERENCES products (event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_83_fk FOREIGN KEY (event_id,shop_id,refund_line_id,product_id) REFERENCES refund_lines (event_id,shop_id,id,product_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_84_fk FOREIGN KEY (event_id,idempotency_id) REFERENCES idempotency_keys (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_moves ADD CONSTRAINT stock_moves_85_fk FOREIGN KEY (actor_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_cancellations ADD CONSTRAINT order_cancellations_86_fk FOREIGN KEY (event_id,order_id) REFERENCES orders (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_cancellations ADD CONSTRAINT order_cancellations_87_fk FOREIGN KEY (requested_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE order_cancellations ADD CONSTRAINT order_cancellations_88_fk FOREIGN KEY (event_id,purchase_refund_id) REFERENCES refunds (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE receipt_verifications ADD CONSTRAINT receipt_verifications_89_fk FOREIGN KEY (event_id,order_id) REFERENCES orders (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE receipt_verifications ADD CONSTRAINT receipt_verifications_90_fk FOREIGN KEY (event_id,recovery_token_id) REFERENCES tokens (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_corrections ADD CONSTRAINT cash_corrections_91_fk FOREIGN KEY (event_id,cash_operation_id) REFERENCES cash_operations (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_corrections ADD CONSTRAINT cash_corrections_92_fk FOREIGN KEY (event_id,original_transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_corrections ADD CONSTRAINT cash_corrections_93_fk FOREIGN KEY (event_id,transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_94_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_95_fk FOREIGN KEY (operator_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_96_fk FOREIGN KEY (event_id,idempotency_id) REFERENCES idempotency_keys (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE report_snapshots ADD CONSTRAINT report_snapshots_97_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE report_snapshots ADD CONSTRAINT report_snapshots_98_fk FOREIGN KEY (requested_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE report_snapshot_rows ADD CONSTRAINT report_snapshot_rows_99_fk FOREIGN KEY (event_id,snapshot_id) REFERENCES report_snapshots (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_reconciliations ADD CONSTRAINT cash_reconciliations_100_fk FOREIGN KEY (event_id,snapshot_id) REFERENCES report_snapshots (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_reconciliations ADD CONSTRAINT cash_reconciliations_101_fk FOREIGN KEY (operator_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_reconciliations ADD CONSTRAINT cash_reconciliations_102_fk FOREIGN KEY (event_id,idempotency_id) REFERENCES idempotency_keys (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_cases ADD CONSTRAINT cash_cases_103_fk FOREIGN KEY (event_id,cash_operation_id) REFERENCES cash_operations (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_cases ADD CONSTRAINT cash_cases_104_fk FOREIGN KEY (event_id,correction_id) REFERENCES cash_corrections (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_cases ADD CONSTRAINT cash_cases_105_fk FOREIGN KEY (event_id,reconciliation_id) REFERENCES cash_reconciliations (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE cash_corrections ADD CONSTRAINT cash_corrections_106_fk FOREIGN KEY (event_id,resolution_case_id) REFERENCES cash_cases (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE expiration_runs ADD CONSTRAINT expiration_runs_107_fk FOREIGN KEY (event_id,policy_version) REFERENCES event_policies (event_id,policy_version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE expiration_items ADD CONSTRAINT expiration_items_108_fk FOREIGN KEY (event_id,run_id) REFERENCES expiration_runs (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE expiration_items ADD CONSTRAINT expiration_items_109_fk FOREIGN KEY (event_id,wallet_id) REFERENCES wallets (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE expiration_items ADD CONSTRAINT expiration_items_110_fk FOREIGN KEY (event_id,policy_version) REFERENCES event_policies (event_id,policy_version) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE expiration_items ADD CONSTRAINT expiration_items_111_fk FOREIGN KEY (event_id,transaction_id) REFERENCES transactions (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE exports ADD CONSTRAINT exports_112_fk FOREIGN KEY (event_id,snapshot_id) REFERENCES report_snapshots (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE exports ADD CONSTRAINT exports_113_fk FOREIGN KEY (requested_by) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE export_parts ADD CONSTRAINT export_parts_114_fk FOREIGN KEY (export_id) REFERENCES exports (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE export_slots ADD CONSTRAINT export_slots_115_fk FOREIGN KEY (export_id,account_id) REFERENCES exports (id,requested_by) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE audit ADD CONSTRAINT audit_116_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE audit ADD CONSTRAINT audit_117_fk FOREIGN KEY (event_id,shop_id) REFERENCES shops (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE audit ADD CONSTRAINT audit_118_fk FOREIGN KEY (actor_account_id) REFERENCES accounts (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE outbox ADD CONSTRAINT outbox_119_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE event_stream_positions ADD CONSTRAINT event_stream_positions_120_fk FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE sse_replay_entries ADD CONSTRAINT sse_replay_entries_121_fk FOREIGN KEY (event_id,outbox_id) REFERENCES outbox (event_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX transactions_event_time ON transactions (event_id,occurred_at DESC,id DESC);
CREATE INDEX ledger_wallet_time ON ledger_entries (event_id,wallet_id,created_at,id);
CREATE INDEX ledger_transaction ON ledger_entries (event_id,transaction_id);
CREATE INDEX outbox_pending ON outbox (next_retry_at,created_at,id) WHERE status='PENDING';
CREATE INDEX reservations_expiry ON stock_reservations (expires_at,event_id,id) WHERE status='RESERVED';
CREATE INDEX orders_shop_time ON orders (event_id,shop_id,created_at DESC,id DESC);
CREATE INDEX refunds_original ON refunds (event_id,original_transaction_id,status);
CREATE INDEX stock_returns ON stock_moves (event_id,refund_line_id);
CREATE INDEX cash_case_status ON cash_cases (event_id,status,created_at,id);
CREATE INDEX audit_event_time ON audit (event_id,created_at,id);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE='23514'; END $$;

CREATE TRIGGER transactions_immutable BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER event_policies_immutable BEFORE UPDATE OR DELETE ON event_policies FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER stock_moves_immutable BEFORE UPDATE OR DELETE ON stock_moves FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER order_lines_immutable BEFORE UPDATE OR DELETE ON order_lines FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER cash_movements_immutable BEFORE UPDATE OR DELETE ON cash_movements FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER report_snapshot_rows_immutable BEFORE UPDATE ON report_snapshot_rows FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Ledger rows belong to the transaction's original database commit, never a later append.
CREATE FUNCTION guard_posting_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original_xid xid8;
BEGIN
 IF TG_TABLE_NAME='transactions' THEN original_xid:=NEW.posting_xid;
 ELSE SELECT posting_xid INTO STRICT original_xid FROM transactions WHERE id=NEW.transaction_id;
 END IF;
 IF original_xid<>pg_current_xact_id() THEN
  RAISE EXCEPTION 'posting must belong to the original database transaction' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER transaction_posting_commit BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION guard_posting_commit();
CREATE TRIGGER ledger_posting_commit BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION guard_posting_commit();

CREATE FUNCTION check_ledger_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; n bigint; total numeric;
BEGIN
  IF TG_TABLE_NAME='transactions' THEN tid:=NEW.id; ELSE tid:=NEW.transaction_id; END IF;
  SELECT count(*),coalesce(sum(amount),0) INTO n,total FROM ledger_entries WHERE transaction_id=tid;
  IF n<2 OR total<>0 THEN RAISE EXCEPTION 'transaction % must have >=2 balanced ledger entries',tid USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transaction_balanced AFTER INSERT ON transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_transaction();
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_ledger_transaction();
CREATE FUNCTION guard_cash_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.balance_source IS DISTINCT FROM NEW.balance_source THEN RAISE EXCEPTION 'cash refund source is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cash_source_fixed BEFORE UPDATE ON cash_operations FOR EACH ROW EXECUTE FUNCTION guard_cash_source();
CREATE FUNCTION guard_hold_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.event_id,OLD.wallet_id,OLD.cash_operation_id,OLD.source_bucket,OLD.hold_transaction_id,OLD.amount)
     IS DISTINCT FROM (NEW.event_id,NEW.wallet_id,NEW.cash_operation_id,NEW.source_bucket,NEW.hold_transaction_id,NEW.amount)
  THEN RAISE EXCEPTION 'hold origin is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hold_origin_fixed BEFORE UPDATE ON holds FOR EACH ROW EXECUTE FUNCTION guard_hold_origin();
CREATE FUNCTION check_grant_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g grants;
BEGIN
  SELECT * INTO STRICT g FROM grants WHERE id=NEW.grant_id FOR UPDATE;
  IF g.shop_id IS DISTINCT FROM NEW.shop_id OR (TG_TABLE_NAME='grant_registers' AND g.role<>'CASHIER') THEN
    RAISE EXCEPTION 'grant child scope mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER grant_permission_scope BEFORE INSERT OR UPDATE ON grant_permissions FOR EACH ROW EXECUTE FUNCTION check_grant_scope();
CREATE TRIGGER grant_register_scope BEFORE INSERT OR UPDATE ON grant_registers FOR EACH ROW EXECUTE FUNCTION check_grant_scope();
CREATE FUNCTION lock_return_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source refund_lines; parent refunds; used numeric;
BEGIN
  IF NEW.kind<>'RETURN_TO_STOCK' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT source FROM refund_lines WHERE id=NEW.refund_line_id FOR UPDATE;
  SELECT * INTO STRICT parent FROM refunds WHERE id=source.refund_id;
  IF parent.status<>'SUCCEEDED' THEN RAISE EXCEPTION 'only succeeded refund can restore stock' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(delta),0) INTO used FROM stock_moves WHERE refund_line_id=NEW.refund_line_id;
  IF used+NEW.delta>source.quantity THEN RAISE EXCEPTION 'stock restore exceeds refunded quantity' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_return_limit BEFORE INSERT ON stock_moves FOR EACH ROW EXECUTE FUNCTION lock_return_source();
CREATE FUNCTION check_restored_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fid uuid; q integer; restored integer; used numeric;
BEGIN
  IF TG_TABLE_NAME='stock_moves' THEN fid:=NEW.refund_line_id; ELSE fid:=NEW.id; END IF;
  IF fid IS NULL THEN RETURN NULL; END IF;
  SELECT quantity,restored_quantity INTO q,restored FROM refund_lines WHERE id=fid;
  SELECT coalesce(sum(delta),0) INTO used FROM stock_moves WHERE refund_line_id=fid;
  IF used<>restored OR used>q THEN RAISE EXCEPTION 'restored quantity projection mismatch' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_restore_projection AFTER INSERT ON stock_moves DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_restored_projection();
CREATE CONSTRAINT TRIGGER refund_restore_projection AFTER INSERT OR UPDATE ON refund_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_restored_projection();
CREATE FUNCTION guard_refund_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.event_id,OLD.shop_id,OLD.refund_id,OLD.order_line_id,OLD.product_id,OLD.quantity,OLD.amount)
     IS DISTINCT FROM (NEW.event_id,NEW.shop_id,NEW.refund_id,NEW.order_line_id,NEW.product_id,NEW.quantity,NEW.amount)
  THEN RAISE EXCEPTION 'refund line facts are immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refund_line_facts BEFORE UPDATE ON refund_lines FOR EACH ROW EXECUTE FUNCTION guard_refund_line();
-- Parent/child shop scopes must agree even within the same event.
ALTER TABLE carts ADD UNIQUE(event_id,shop_id,id);
ALTER TABLE payment_requests ADD UNIQUE(event_id,shop_id,id);
ALTER TABLE refunds ADD UNIQUE(event_id,shop_id,id);
ALTER TABLE expiration_runs ADD UNIQUE(event_id,id,policy_version,expires_at);
ALTER TABLE cart_lines ADD FOREIGN KEY(event_id,shop_id,cart_id) REFERENCES carts(event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE stock_reservations ADD FOREIGN KEY(event_id,shop_id,payment_request_id) REFERENCES payment_requests(event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE refund_lines ADD FOREIGN KEY(event_id,shop_id,refund_id) REFERENCES refunds(event_id,shop_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE expiration_items ADD FOREIGN KEY(event_id,run_id,policy_version,expires_at) REFERENCES expiration_runs(event_id,id,policy_version,expires_at) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE exports ADD CHECK(status NOT IN ('READY','EXPIRED') OR expires_at IS NOT NULL);
ALTER TABLE transactions ADD CHECK(origin_kind = CASE type
 WHEN 'CASH_REFUND_HOLD' THEN 'HOLD'
 WHEN 'CASH_REFUND_RELEASE' THEN 'HOLD_RELEASE'
 WHEN 'CASH_REFUND_PAID' THEN 'HOLD_RELEASE'
 WHEN 'PURCHASE_REFUND' THEN 'REFUND'
 WHEN 'CHARGE_REVERSAL' THEN 'CORRECTION'
 WHEN 'CASH_REFUND_CORRECTION' THEN 'CORRECTION'
 WHEN 'EXPIRATION' THEN 'EXPIRATION_ITEM'
 ELSE type END);
ALTER TABLE transactions ADD CHECK(type<>'PAYMENT' OR origin_id=payment_request_id);
CREATE TRIGGER refund_line_no_delete BEFORE DELETE ON refund_lines FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION guard_payment_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.event_id,OLD.shop_id,OLD.register_id,OLD.mode,OLD.basis,OLD.amount,OLD.content_snapshot,OLD.content_hash,OLD.content_version)
 IS DISTINCT FROM (NEW.event_id,NEW.shop_id,NEW.register_id,NEW.mode,NEW.basis,NEW.amount,NEW.content_snapshot,NEW.content_hash,NEW.content_version)
 OR (OLD.payer_account_id IS NOT NULL AND OLD.payer_account_id IS DISTINCT FROM NEW.payer_account_id)
 OR (OLD.status IN ('SUCCEEDED','DECLINED','CANCELLED','EXPIRED') AND OLD.status<>NEW.status)
 OR (OLD.transaction_id IS NOT NULL AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id)
 THEN RAISE EXCEPTION 'payment request facts/terminal effect are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_facts_fixed BEFORE UPDATE ON payment_requests FOR EACH ROW EXECUTE FUNCTION guard_payment_facts();
CREATE FUNCTION check_hold_target() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op cash_operations; w wallets; t transactions;
BEGIN
 SELECT * INTO STRICT op FROM cash_operations WHERE id=NEW.cash_operation_id FOR UPDATE;
 SELECT * INTO STRICT w FROM wallets WHERE id=NEW.wallet_id;
 SELECT * INTO STRICT t FROM transactions WHERE id=NEW.hold_transaction_id;
 IF op.type<>'CASH_REFUND' OR op.account_id<>w.account_id OR op.amount<>NEW.amount
 OR t.type<>'CASH_REFUND_HOLD' OR t.amount<>NEW.amount OR t.origin_id<>NEW.id THEN
  RAISE EXCEPTION 'hold target/amount/transaction mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER hold_target BEFORE INSERT ON holds FOR EACH ROW EXECUTE FUNCTION check_hold_target();
CREATE FUNCTION lock_refund_original() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original transactions; request payment_requests; used numeric;
BEGIN
 SELECT * INTO STRICT original FROM transactions WHERE id=NEW.original_transaction_id FOR UPDATE;
 IF original.type<>'PAYMENT' OR original.event_id<>NEW.event_id THEN
  RAISE EXCEPTION 'refund requires same-event original PAYMENT' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT request FROM payment_requests WHERE id=original.payment_request_id;
 IF request.shop_id<>NEW.shop_id OR request.basis<>NEW.basis THEN
  RAISE EXCEPTION 'refund shop/basis mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.basis='ITEMS' AND NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND transaction_id=original.id)
 THEN RAISE EXCEPTION 'refund original order mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (OLD.event_id,OLD.shop_id,OLD.original_transaction_id,OLD.order_id,OLD.basis,OLD.amount,OLD.reason,OLD.requested_by)
  IS DISTINCT FROM (NEW.event_id,NEW.shop_id,NEW.original_transaction_id,NEW.order_id,NEW.basis,NEW.amount,NEW.reason,NEW.requested_by)
  OR (OLD.status IN ('SUCCEEDED','REJECTED') AND OLD.status<>NEW.status)
  OR (OLD.destination_bucket IS NOT NULL AND OLD.destination_bucket IS DISTINCT FROM NEW.destination_bucket)
  OR (OLD.refund_transaction_id IS NOT NULL AND OLD.refund_transaction_id IS DISTINCT FROM NEW.refund_transaction_id)
  THEN RAISE EXCEPTION 'refund request/terminal effect is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='SUCCEEDED' THEN
  SELECT coalesce(sum(amount),0) INTO used FROM refunds WHERE original_transaction_id=original.id AND status='SUCCEEDED' AND id<>NEW.id;
  IF used+NEW.amount>original.amount THEN RAISE EXCEPTION 'refund cumulative amount exceeded' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refund_original_lock BEFORE INSERT OR UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION lock_refund_original();
CREATE FUNCTION check_wallet_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid uuid; w wallets; a numeric; h numeric; r numeric;
BEGIN
 IF TG_TABLE_NAME='wallets' THEN wid:=NEW.id; ELSE wid:=NEW.wallet_id; END IF;
 IF wid IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO STRICT w FROM wallets WHERE id=wid;
 SELECT coalesce(sum(amount) FILTER(WHERE account_code='WALLET_AVAILABLE'),0),
        coalesce(sum(amount) FILTER(WHERE account_code='WALLET_HELD'),0),
        coalesce(sum(amount) FILTER(WHERE account_code='WALLET_REFUND_ONLY'),0)
 INTO a,h,r FROM ledger_entries WHERE wallet_id=wid;
 IF (w.available_amount,w.held_amount,w.refund_only_amount) IS DISTINCT FROM (a,h,r) THEN
  RAISE EXCEPTION 'wallet projection mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER wallet_projection AFTER INSERT OR UPDATE ON wallets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_projection();
CREATE CONSTRAINT TRIGGER ledger_wallet_projection AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_wallet_projection();
CREATE FUNCTION check_order_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid; o orders; request payment_requests; n bigint; total numeric; paid numeric;
BEGIN
 IF TG_TABLE_NAME='orders' THEN oid:=NEW.id; ELSE oid:=NEW.order_id; END IF;
 SELECT * INTO STRICT o FROM orders WHERE id=oid;
 SELECT count(*),coalesce(sum(line_total),0) INTO n,total FROM order_lines WHERE order_id=oid;
 SELECT amount INTO paid FROM transactions WHERE id=o.transaction_id;
 SELECT * INTO STRICT request FROM payment_requests WHERE id=o.payment_request_id;
 IF request.basis<>'ITEMS' OR request.status<>'SUCCEEDED' OR request.amount<>o.total_amount
 OR n NOT BETWEEN 1 AND 50 OR total<>o.total_amount OR paid<>o.total_amount THEN
  RAISE EXCEPTION 'order line count/total/payment mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER order_total AFTER INSERT OR UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_total();
CREATE CONSTRAINT TRIGGER order_line_total AFTER INSERT ON order_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_order_total();
-- Serializes permission insertion with simultaneous grant scope/role changes.
CREATE FUNCTION check_grant_children() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM grant_permissions WHERE grant_id=NEW.id AND shop_id IS DISTINCT FROM NEW.shop_id)
 OR EXISTS(SELECT 1 FROM grant_registers WHERE grant_id=NEW.id AND (shop_id IS DISTINCT FROM NEW.shop_id OR NEW.role<>'CASHIER'))
 THEN RAISE EXCEPTION 'grant parent scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER grant_children_scope AFTER UPDATE ON grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_grant_children();



ALTER TABLE refunds ADD CHECK((basis='ITEMS')=(order_id IS NOT NULL));
CREATE FUNCTION lock_refund_line_original() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r refunds; original_line order_lines;
BEGIN
 SELECT * INTO STRICT r FROM refunds WHERE id=NEW.refund_id;
 PERFORM 1 FROM transactions WHERE id=r.original_transaction_id FOR UPDATE;
 SELECT * INTO STRICT original_line FROM order_lines WHERE id=NEW.order_line_id;
 IF r.basis<>'ITEMS' OR original_line.order_id<>r.order_id
 OR original_line.product_id<>NEW.product_id OR NEW.quantity>original_line.quantity
 OR NEW.amount<>original_line.unit_price*NEW.quantity THEN
  RAISE EXCEPTION 'refund line original/quantity/price mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refund_line_original BEFORE INSERT ON refund_lines FOR EACH ROW EXECUTE FUNCTION lock_refund_line_original();
CREATE FUNCTION check_refund_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; r refunds; n bigint; total numeric; effect transactions;
BEGIN
 IF TG_TABLE_NAME='refunds' THEN rid:=NEW.id; ELSE rid:=NEW.refund_id; END IF;
 SELECT * INTO STRICT r FROM refunds WHERE id=rid;
 SELECT count(*),coalesce(sum(amount),0) INTO n,total FROM refund_lines WHERE refund_id=rid;
 IF (r.basis='ITEMS' AND (n NOT BETWEEN 1 AND 50 OR total<>r.amount))
 OR (r.basis='AMOUNT' AND n<>0) THEN
  RAISE EXCEPTION 'refund lines/total mismatch' USING ERRCODE='23514'; END IF;
 IF r.status='SUCCEEDED' THEN
  SELECT * INTO STRICT effect FROM transactions WHERE id=r.refund_transaction_id;
  IF effect.type<>'PURCHASE_REFUND' OR effect.amount<>r.amount OR effect.origin_id<>r.id
  OR effect.source_transaction_id IS DISTINCT FROM r.original_transaction_id THEN
   RAISE EXCEPTION 'refund transaction mismatch' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM refund_lines mine JOIN order_lines original ON original.id=mine.order_line_id
    WHERE mine.refund_id=rid AND (SELECT coalesce(sum(l.quantity),0) FROM refund_lines l
      JOIN refunds done ON done.id=l.refund_id
      WHERE l.order_line_id=mine.order_line_id AND done.status='SUCCEEDED')>original.quantity)
  THEN RAISE EXCEPTION 'refund cumulative quantity exceeded' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER refund_total AFTER INSERT OR UPDATE ON refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_refund_total();
CREATE CONSTRAINT TRIGGER refund_line_total AFTER INSERT ON refund_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_refund_total();

CREATE FUNCTION guard_correction_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.event_id,OLD.cash_operation_id,OLD.original_transaction_id,OLD.kind,OLD.amount,OLD.balance_source,OLD.transaction_id)
 IS DISTINCT FROM (NEW.event_id,NEW.cash_operation_id,NEW.original_transaction_id,NEW.kind,NEW.amount,NEW.balance_source,NEW.transaction_id)
 OR (OLD.cash_return_status IN ('RETURNED','NOT_REQUIRED') AND OLD.cash_return_status<>NEW.cash_return_status)
 OR (OLD.cash_return_status<>'NOT_REQUIRED' AND NEW.cash_return_status='NOT_REQUIRED')
 OR (OLD.cash_return_status='INVESTIGATING' AND NEW.cash_return_status='PENDING_RETURN')
 THEN RAISE EXCEPTION 'correction origin/terminal return state is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.cash_return_status='INVESTIGATING' AND NEW.cash_return_status='RETURNED'
 AND NOT EXISTS(SELECT 1 FROM cash_cases WHERE id=NEW.resolution_case_id AND event_id=NEW.event_id
   AND source_type='CORRECTION' AND correction_id=NEW.id AND status='RESOLVED'
   AND db_outcome='COMMITTED' AND cash_fact IN ('NOT_RETURNED','RETURNED'))
 THEN RAISE EXCEPTION 'correction return needs same-source resolved evidence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER correction_facts_fixed BEFORE UPDATE ON cash_corrections FOR EACH ROW EXECUTE FUNCTION guard_correction_facts();

CREATE FUNCTION guard_contact_email_facts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='contact_email_verifications' THEN
  IF (OLD.account_id,OLD.token_id,OLD.email) IS DISTINCT FROM (NEW.account_id,NEW.token_id,NEW.email)
  OR (OLD.verified_at IS NOT NULL AND OLD.verified_at IS DISTINCT FROM NEW.verified_at)
  THEN RAISE EXCEPTION 'contact email ownership facts are immutable' USING ERRCODE='23514'; END IF;
 ELSE
  IF (OLD.purpose='CONTACT_EMAIL' OR NEW.purpose='CONTACT_EMAIL') AND
   ((OLD.purpose,OLD.subject_account_id,OLD.binding_hash,OLD.expires_at)
     IS DISTINCT FROM (NEW.purpose,NEW.subject_account_id,NEW.binding_hash,NEW.expires_at)
    OR (OLD.consumed_at IS NOT NULL AND OLD.consumed_at IS DISTINCT FROM NEW.consumed_at))
  THEN RAISE EXCEPTION 'contact token binding/consumption is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contact_email_facts_fixed BEFORE UPDATE ON contact_email_verifications FOR EACH ROW EXECUTE FUNCTION guard_contact_email_facts();
CREATE TRIGGER contact_token_facts_fixed BEFORE UPDATE ON tokens FOR EACH ROW EXECUTE FUNCTION guard_contact_email_facts();

CREATE FUNCTION contact_email_binding(account_id uuid, address text) RETURNS bytea LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT sha256(convert_to('FESPAY_CONTACT_EMAIL_V1'||E'\n'||account_id::text||E'\n'||address,'UTF8'));
$$;
CREATE FUNCTION check_contact_email_verification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; t tokens; c contact_email_verifications;
BEGIN
 IF TG_TABLE_NAME='tokens' THEN tid:=NEW.id;
 ELSIF TG_OP='DELETE' THEN tid:=OLD.token_id;
 ELSE tid:=NEW.token_id; END IF;
 SELECT * INTO t FROM tokens WHERE id=tid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO c FROM contact_email_verifications WHERE token_id=tid;
 IF NOT FOUND THEN
  IF t.purpose='CONTACT_EMAIL' THEN RAISE EXCEPTION 'contact token needs address record' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 IF t.purpose<>'CONTACT_EMAIL' OR t.binding_hash IS DISTINCT FROM contact_email_binding(c.account_id,c.email::text)
 OR c.verified_at IS DISTINCT FROM t.consumed_at
 OR (c.verified_at IS NOT NULL AND (t.revoked_at IS NOT NULL OR c.verified_at>=t.expires_at))
 THEN RAISE EXCEPTION 'contact email purpose/binding/verification mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER contact_email_verified AFTER INSERT OR UPDATE OR DELETE ON contact_email_verifications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_contact_email_verification();
CREATE CONSTRAINT TRIGGER contact_token_verified AFTER INSERT OR UPDATE ON tokens DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_contact_email_verification();

COMMIT;
