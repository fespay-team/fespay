# API・DB対応（論理仕様ベース）

## 範囲と根拠

`docs/design/api-design.md` および `docs/design/api/openapi.yaml` は未作成。下記は `basic-design.md` 14.2のA/E/S/Q/T/W/C/H/F/P/O/R/N論理API ID群と `detailed-design.md` 11章を対応付けたもの。正確な個別path・列・検索条件・response schemaの完全照合はOpenAPI作成後に必要。

| API群 | 主な読取表 | 登録・更新表 | Tx/整合性・検索 |
|---|---|---|---|
| A01–A04 認証 | accounts, identities, sessions | 認証基盤所有表（要確認）、sessions | Better Auth管理と独自表の境界未決。資格情報を業務監査へ複製しない。 |
| E01–E10 イベント | events, memberships, event_policies, wallets, orders, cash_operations | events, event_policies, memberships, audit, outbox | 参加は(event,account)一意。完了は未解決残高・現金・注文・返金の検査を含むTx。検索filter未確定。 |
| S01–S04 招待/権限 | invitations, grants, accounts, shops | invitations, grants, audit, outbox | token hash一回消費とgrant作成を同一Tx。event/shop scope検査。 |
| Q01–Q04 支払要求 | shops, registers, products, payment_requests, tokens | payment_requests, tokens, audit, outbox | 承認はrequest・walletをロックし、内容版/hashと認可を再検証。GET結果照会。 |
| T01–T05 / W01–W02 残高・取引 | wallets, transactions, ledger_entries | transactions, ledger_entries, wallets, idempotency_keys, audit, outbox | 同一Tx、冪等、walletロック。履歴は(event_id, occurred_at DESC, id)索引。 |
| C01–C05 / H01–H04 現金/払戻し | tokens, wallets, cash_operations, holds, cash_cases | 上記に加えtransactions, ledger_entries, audit, outbox | 現金物理授受はDB非原子的。結果不明はcase化し再交付を推測しない。hold自動解除禁止。 |
| F01–F03 譲渡 | memberships, tokens, wallets | transactions, ledger_entries, wallets, idempotency_keys, audit, outbox | 送受walletを固定順ロック。同一event・機能有効を確認。 |
| P01–P05 商品/在庫/checkout | products, inventory, stock_moves, stock_reservations | products, inventory, stock_moves, payment_requests, stock_reservations, audit, outbox | checkout全明細を一Txで予約。inventory/product順ロック、version検証。 |
| O01–O05 注文/受取 | orders, order_lines, products, stock_reservations | orders, order_lines, inventory, stock_reservations, transactions, ledger_entries | 決済・注文・在庫・台帳同一Tx。注文状態はversion条件付き更新。 |
| R01–R05 集計/CSV | transactions, refunds, orders, audit | exports, outbox（生成要求） | snapshot固定、認可scopeを絞る。download時に権限再確認。CSV object本体はDB外。 |
| N01 SSE | outbox, memberships, grants | なし（配信状態はworkerがoutbox更新） | Last-Event-IDで再開、event scopeごと再認可。通知は正本でなくID/versionのみ。 |

## 検索・ページング索引

現状明示されている候補: `transactions(event_id, occurred_at DESC, id)`、`orders(shop_id,status,created_at)`、`orders(account_id,created_at)`、`ledger_entries(event_id,transaction_id)`、`ledger_entries(wallet_id,created_at)`、`stock_reservations(event_id,status,expires_at)`、`outbox(status,next_retry_at,created_at)`、`audit(event_id,created_at)`。APIの全sort/filterとcursorは未確定なので、追加索引はOpenAPI確定後に実データ量・EXPLAINで判断する。

## トランザクション境界

金銭確定では冪等キー確保→認可/状態再検証→wallet等を決まった順にロック→業務行・取引・仕訳・残高射影・監査・Outbox書込み→COMMIT。返金は元取引/注文明細をロックし累計上限を確認。在庫checkout/決済/失効は予約行をロックし、部分確定を許さない。読み取りAPIの分離レベル・一貫性契約は未確定。
