# DB物理モデルER図

状態：レビュー案。根拠は[設計方針](design.md)、全列/制約は[物理スキーマ](physical-schema.md)。領域ごとに55表を掲載し、SQLのFKから親子関係を抽出した。関連する領域外の親も図に表示する。線は親子参照を示し、必須/任意・1対1・同時件数は列のNULLと一意制約を参照する。

## 認証・イベント・管理

```mermaid
erDiagram
  accounts
  account_profiles
  auth_contexts
  contact_email_verifications
  service_control
  publication_gates
  events
  event_policies
  event_settings
  memberships
  ownership_transfers
  suspensions
  accounts ||--o{ account_profiles : references
  accounts ||--o{ auth_contexts : references
  accounts ||--o{ contact_email_verifications : references
  tokens ||--o{ contact_email_verifications : references
  accounts ||--o{ event_policies : references
  accounts ||--o{ events : references
  accounts ||--o{ memberships : references
  accounts ||--o{ ownership_transfers : references
  accounts ||--o{ publication_gates : references
  event_policies ||--o{ event_settings : references
  event_policies ||--o{ memberships : references
  events ||--o{ event_policies : references
  events ||--o{ memberships : references
  events ||--o{ ownership_transfers : references
  events ||--o{ suspensions : references
  shops ||--o{ suspensions : references
```

## 店舗・権限

```mermaid
erDiagram
  shops
  registers
  grants
  grant_permissions
  grant_registers
  invitations
  accounts ||--o{ grants : references
  accounts ||--o{ invitations : references
  events ||--o{ grants : references
  events ||--o{ invitations : references
  events ||--o{ shops : references
  grants ||--o{ grant_permissions : references
  grants ||--o{ grant_registers : references
  grants ||--o{ invitations : references
  registers ||--o{ grant_registers : references
  shops ||--o{ grant_permissions : references
  shops ||--o{ grants : references
  shops ||--o{ invitations : references
  shops ||--o{ registers : references
```

## 金銭・台帳

```mermaid
erDiagram
  wallets
  dispute_preservations
  idempotency_keys
  tokens
  payment_requests
  transactions
  ledger_entries
  cash_operations
  holds
  transfer_requests
  accounts ||--o{ cash_operations : references
  accounts ||--o{ idempotency_keys : references
  accounts ||--o{ tokens : references
  accounts ||--o{ transactions : references
  cash_operations ||--o{ holds : references
  events ||--o{ idempotency_keys : references
  events ||--o{ tokens : references
  events ||--o{ transactions : references
  idempotency_keys ||--o{ transactions : references
  memberships ||--o{ cash_operations : references
  memberships ||--o{ payment_requests : references
  memberships ||--o{ transfer_requests : references
  memberships ||--o{ wallets : references
  payment_requests ||--o{ transactions : references
  registers ||--o{ payment_requests : references
  shops ||--o{ cash_operations : references
  shops ||--o{ ledger_entries : references
  shops ||--o{ payment_requests : references
  tokens ||--o{ transfer_requests : references
  transactions ||--o{ cash_operations : references
  transactions ||--o{ holds : references
  transactions ||--o{ ledger_entries : references
  transactions ||--o{ payment_requests : references
  transactions ||--o{ transfer_requests : references
  wallets ||--o{ dispute_preservations : references
  wallets ||--o{ holds : references
  wallets ||--o{ ledger_entries : references
```

## 商品・注文・返金

```mermaid
erDiagram
  products
  inventory
  carts
  cart_lines
  orders
  order_lines
  stock_reservations
  refunds
  refund_lines
  stock_moves
  order_cancellations
  receipt_verifications
  accounts ||--o{ order_cancellations : references
  accounts ||--o{ refunds : references
  accounts ||--o{ stock_moves : references
  carts ||--o{ cart_lines : references
  idempotency_keys ||--o{ refunds : references
  idempotency_keys ||--o{ stock_moves : references
  memberships ||--o{ carts : references
  memberships ||--o{ orders : references
  order_lines ||--o{ refund_lines : references
  orders ||--o{ order_cancellations : references
  orders ||--o{ order_lines : references
  orders ||--o{ receipt_verifications : references
  orders ||--o{ refunds : references
  payment_requests ||--o{ carts : references
  payment_requests ||--o{ orders : references
  payment_requests ||--o{ stock_reservations : references
  products ||--o{ cart_lines : references
  products ||--o{ inventory : references
  products ||--o{ order_lines : references
  products ||--o{ stock_moves : references
  products ||--o{ stock_reservations : references
  refund_lines ||--o{ stock_moves : references
  refunds ||--o{ order_cancellations : references
  refunds ||--o{ refund_lines : references
  shops ||--o{ carts : references
  shops ||--o{ orders : references
  shops ||--o{ products : references
  shops ||--o{ refunds : references
  tokens ||--o{ receipt_verifications : references
  transactions ||--o{ orders : references
  transactions ||--o{ refunds : references
```

## 現金照合・失効

```mermaid
erDiagram
  cash_corrections
  cash_movements
  cash_reconciliations
  cash_cases
  expiration_runs
  expiration_items
  accounts ||--o{ cash_movements : references
  accounts ||--o{ cash_reconciliations : references
  cash_cases ||--o{ cash_corrections : references
  cash_corrections ||--o{ cash_cases : references
  cash_operations ||--o{ cash_cases : references
  cash_operations ||--o{ cash_corrections : references
  cash_reconciliations ||--o{ cash_cases : references
  event_policies ||--o{ expiration_items : references
  event_policies ||--o{ expiration_runs : references
  events ||--o{ cash_movements : references
  expiration_runs ||--o{ expiration_items : references
  idempotency_keys ||--o{ cash_movements : references
  idempotency_keys ||--o{ cash_reconciliations : references
  report_snapshots ||--o{ cash_reconciliations : references
  transactions ||--o{ cash_corrections : references
  transactions ||--o{ expiration_items : references
  wallets ||--o{ expiration_items : references
```

## 集計・出力・配信

```mermaid
erDiagram
  report_snapshots
  report_snapshot_rows
  exports
  export_parts
  export_slots
  audit
  outbox
  event_stream_positions
  sse_replay_entries
  accounts ||--o{ audit : references
  accounts ||--o{ exports : references
  accounts ||--o{ report_snapshots : references
  events ||--o{ audit : references
  events ||--o{ event_stream_positions : references
  events ||--o{ outbox : references
  events ||--o{ report_snapshots : references
  exports ||--o{ export_parts : references
  exports ||--o{ export_slots : references
  outbox ||--o{ sse_replay_entries : references
  report_snapshots ||--o{ exports : references
  report_snapshots ||--o{ report_snapshot_rows : references
  shops ||--o{ audit : references
```

認証基盤のidentity/session/因子/OAuth表は外部所有境界で、この図に複製しない。accounts.auth_user_refで業務IDへ対応付ける。SSEの公開Outbox UUIDを配信順にせず、sse_replay_entries.positionを使う。
