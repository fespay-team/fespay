# 物理スキーマ案

状態：レビュー案。PostgreSQL 16以上。API参照：PR #8、`52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32`（v0.4）。

列・CHECK・FK・一意制約の正本候補は[検証用SQL](sql/initial-schema-draft.sql)。この本文はその列一覧とAPIへの意味付けであり、運用migrationではない。全IDは内部/公開UUID案、生成方式はBEで固定する。金額domainはscaleなしnumericに整数・有限・30桁のCHECKを加え、入力段階の丸めを防ぐ。更新表のversionは正のbigint、全表created_at、更新表updated_atを持つ。FKはRESTRICT、event関連は複合所属を保証する。

Better Authのidentity/session/因子/回復コード/OAuth/challengeは認証基盤の正本とし、このSQLで同名表を二重作成しない。accountsは業務ID、account_profilesは削除可能な個人情報、auth_contextsは検証済みの業務追加認証時刻を保存するadapter文脈。文脈だけで認証せず、毎要求で基盤sessionの有効性を確認する。基盤の固定版・内部migrationは統合試験で確定する。

## 型

| 型 | 範囲/意味 |
| --- | --- |
| yen | 符号付き30桁以内・整数・有限。丸めなし |
| positive_yen | 1円以上の取引/商品額 |
| nonnegative_yen | 残高・参考合計。0可 |
| signed_ledger_yen | 台帳の符号付き非ゼロ額。絶対値30桁以内 |
| stock_count | 0～2147483647。保存型がbigintでも32bit範囲外を拒否 |
| positive_version | 正のbigint。APIでは精度を失わない10進文字列 |

集計はscaleなしnumericと有限整数検査を使い、1取引の30桁制限を合計へ流用しない。DB型に実装上の有限範囲はあり、APIの「桁を限定しない」は業務上限を付けない意味とする。

## テーブル・全列


### accounts

```sql
id uuid PRIMARY KEY,
auth_user_ref text UNIQUE,
status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','DELETION_PENDING','DELETED')),
delete_after timestamptz,
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### account_profiles

```sql
id uuid PRIMARY KEY,
account_id uuid NOT NULL UNIQUE,
email citext NOT NULL UNIQUE,
email_verified_at timestamptz,
display_name varchar(100) NOT NULL,
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### auth_contexts

```sql
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
```

### service_control

```sql
id uuid PRIMARY KEY,
singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
status text NOT NULL CHECK(status IN ('ENABLED','EMERGENCY_STOP','DRAINING','CLOSED')),
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### publication_gates

```sql
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
```

### events

```sql
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
```

### event_policies

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
policy_version positive_version NOT NULL,
terms jsonb NOT NULL CHECK(jsonb_typeof(terms)='object'),
effective_at timestamptz NOT NULL,
created_by uuid NOT NULL,
UNIQUE(event_id,policy_version),
UNIQUE(event_id, id),
created_at timestamptz NOT NULL DEFAULT now()
```

### event_settings

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL UNIQUE,
policy_version positive_version NOT NULL,
settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),
participation_password_ref text,
UNIQUE(event_id, id),
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### memberships

```sql
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
```

### shops

```sql
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
```

### registers

```sql
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
```

### grants

```sql
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
```

### grant_permissions

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
grant_id uuid NOT NULL,
account_id uuid NOT NULL,
shop_id uuid,
permission text NOT NULL CHECK(permission IN ('CREATE_PAYMENT_REQUEST','FULFILL_ORDER','CHARGE','CASH_REFUND','MANAGE_CASH_REFUNDS','CORRECT_CASH','INVESTIGATE_CASH','RECONCILE_CASH','PURCHASE_REFUND','MANAGE_PRODUCTS','MANAGE_INVENTORY','READ_REPORT','EXPORT','READ_AUDIT')),
UNIQUE(grant_id,permission),
UNIQUE(event_id, id),
created_at timestamptz NOT NULL DEFAULT now()
```

### grant_registers

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
grant_id uuid NOT NULL,
shop_id uuid NOT NULL,
register_id uuid NOT NULL,
UNIQUE(grant_id,register_id),
UNIQUE(event_id, id),
created_at timestamptz NOT NULL DEFAULT now()
```

### invitations

```sql
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
```

### ownership_transfers

```sql
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
```

### suspensions

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
shop_id uuid,
active boolean NOT NULL DEFAULT true,
reason text NOT NULL,
UNIQUE(event_id, id),
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### wallets

```sql
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
```

### dispute_preservations

```sql
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
```

### idempotency_keys

```sql
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
```

### tokens

```sql
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
```

### products

```sql
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
```

### inventory

```sql
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
```

### carts

```sql
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
```

### cart_lines

```sql
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
```

### payment_requests

```sql
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
```

### transactions

```sql
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
```

### ledger_entries

```sql
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
```

### cash_operations

```sql
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
```

### holds

```sql
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
```

### transfer_requests

```sql
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
```

### orders

```sql
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
```

### order_lines

```sql
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
```

### stock_reservations

```sql
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
```

### refunds

```sql
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
```

### refund_lines

```sql
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
```

### stock_moves

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
shop_id uuid NOT NULL,
product_id uuid NOT NULL,
kind text NOT NULL CHECK(kind IN ('ADD','WASTE','CORRECTION','RETURN_TO_STOCK')),
refund_line_id uuid,
idempotency_id uuid NOT NULL,
delta bigint NOT NULL CHECK(delta BETWEEN -2147483647 AND 2147483647 AND delta<>0),
reason text NOT NULL,
actor_account_id uuid NOT NULL,
CHECK((kind='RETURN_TO_STOCK' AND refund_line_id IS NOT NULL AND delta>0) OR (kind<>'RETURN_TO_STOCK' AND refund_line_id IS NULL)),
UNIQUE(idempotency_id),
UNIQUE(event_id, id),
created_at timestamptz NOT NULL DEFAULT now()
```

### order_cancellations

```sql
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
```

### receipt_verifications

```sql
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
```

### cash_corrections

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
cash_operation_id uuid NOT NULL,
original_transaction_id uuid NOT NULL,
kind text NOT NULL CHECK(kind IN ('CHARGE_REVERSAL','CASH_REFUND_CORRECTION')),
amount positive_yen NOT NULL,
balance_source text NOT NULL CHECK(balance_source IN ('AVAILABLE','REFUND_ONLY')),
transaction_id uuid NOT NULL UNIQUE,
cash_returned_confirmed boolean NOT NULL DEFAULT false,
reason text NOT NULL,
resolution_case_id uuid,
UNIQUE(event_id, id),
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### cash_movements

```sql
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
```

### report_snapshots

```sql
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
```

### report_snapshot_rows

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
snapshot_id uuid NOT NULL,
ordinal bigint NOT NULL CHECK(ordinal>0),
data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
UNIQUE(snapshot_id,ordinal),
UNIQUE(event_id, id),
created_at timestamptz NOT NULL DEFAULT now()
```

### cash_reconciliations

```sql
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
```

### cash_cases

```sql
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
```

### expiration_runs

```sql
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
```

### expiration_items

```sql
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
```

### exports

```sql
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
```

### export_parts

```sql
id uuid PRIMARY KEY,
export_id uuid NOT NULL,
part_index bigint NOT NULL CHECK(part_index>0),
row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 100000),
object_key text,
content_hash bytea,
UNIQUE(export_id,part_index),
created_at timestamptz NOT NULL DEFAULT now()
```

### export_slots

```sql
id uuid PRIMARY KEY,
account_id uuid NOT NULL,
slot integer NOT NULL CHECK(slot IN (1,2)),
export_id uuid NOT NULL UNIQUE,
UNIQUE(account_id,slot),
created_at timestamptz NOT NULL DEFAULT now()
```

### audit

```sql
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
```

### outbox

```sql
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
```

### event_stream_positions

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL UNIQUE,
last_position bigint NOT NULL DEFAULT 0 CHECK(last_position>=0),
version positive_version NOT NULL DEFAULT 1,
updated_at timestamptz NOT NULL DEFAULT now(),
created_at timestamptz NOT NULL DEFAULT now()
```

### sse_replay_entries

```sql
id uuid PRIMARY KEY,
event_id uuid NOT NULL,
outbox_id uuid NOT NULL UNIQUE,
position bigint NOT NULL CHECK(position>0),
retain_until timestamptz NOT NULL,
UNIQUE(event_id,position),
UNIQUE(event_id, id),
created_at timestamptz NOT NULL DEFAULT now()
```

## 制約と処理の分担

SQLは台帳均衡・wallet射影・注文合計・返金の元注文/単価/数量/合計/成立累計・在庫戻し累計を遅延triggerと原資源ロックで検査する。検証済みの範囲は[検証入口](validation/README.md)を参照。認可・MFA・現金事実・実時刻・勘定選択・監査/Outbox同時成立は[API対応](api-mapping.md)のTx規約に従うhandlerが必要。制約だけをアプリ実装の代わりにしない。

`refunds.destination_bucket`はREQUESTED/INVESTIGATING/REJECTEDでNULL、SUCCEEDEDで必須。返金先は申出時に先決めせずexecute時の期間/有効性で選ぶ。`order_lines.refunded_quantity/restored_quantity`の公開値は成立refund_linesの集計から算出する。元商品/単価/数量は不変、restored_quantityだけ在庫戻しで更新する。

APIのGrantは権限集合のID。grantsはrole/現在状態/版、grant_permissionsは同scope/permissionの一意な正本、grant_registersはレジ範囲を表す。再付与は既存行/版を更新し、grant_permissionsの重複行を増やさない。旧発行者の権限解除は受諾済みgrantを連鎖解除しない。
