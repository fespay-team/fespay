# FesPay 詳細設計書

## 1. 文書概要

| 項目 | 内容 |
|---|---|
| 文書ID | EPP-DES-002 |
| 文書名 | FesPay 詳細設計書 |
| 対象システム | FesPay |
| 対象基本設計書 | [EPP-DES-001](basic-design.md)（設計v0.2、レビュー案） |
| 版 | 0.1 |
| 作成日 | 2026-10-01 |
| ステータス | 下書き・レビュー前 |
| 担当 | 未割当 |
| レビュー者 | 未割当 |
| 更新日 | 2026-10-01 |
| 目的 | 確定仕様と明示した詳細設計上の補完を分け、実装の境界・永続化・処理規約を定める |

対象は基本設計の初期対象に限る。初期対象外機能は実装しない。実金銭運用可能、法令適合、性能達成、セキュリティ監査済みを示す文書ではない。基本設計がレビュー案であり、本書もその承認状態を引き継ぐ。

## 2. 設計方針

### 2.1 根拠・区分

基本設計記載の確定事項を **基本設計確定**、実装に必要な追加判断を **詳細設計上の補完**、決定権者・外部確認・実測が必要なものを **未決** と表記する。補完は基本設計を変更せず、要件変更が必要な業務ルールは追加しない。QR関連のCR-0001はレビュー中として扱う。

### 2.2 実装規約

| 項目 | 規約 |
|---|---|
| 技術 | React + Vite、Hono + Node.js、Better Auth、PostgreSQL、SSE + Outbox、オブジェクトストレージ（基本設計確定） |
| ID | 内部主キーはUUID。外部公開識別子・短い表示番号・認証秘密を分離（UUID方式自体は補完、形式は未決） |
| 名前 | DBはsnake_case、TypeScriptはcamelCase、型・コンポーネントはPascalCase。要件IDは変更しない（補完） |
| 時刻 | DB timestamptz UTC、API UTC ISO 8601、UI Asia/Tokyo。受付期間は開始含み終了含まず |
| 金額 | APIは10進数字文字列、DB NUMERIC(30,0)、演算は任意精度整数。1～30桁の正数入力、途中オーバーフローは全体拒否 |
| API | HTTPS JSON `/v1`、セッションCookie、更新時CSRF、許可Originのみ。成功応答はCOMMIT後 |
| エラー | `{code,message,request_id,retryable,current_state_or_query?}`。金銭の応答不明は未成立と判定せず同じキーで照会 |
| Tx | 金銭・関連注文/在庫/台帳・残高射影・監査・Outboxを単一PostgreSQLトランザクションに含める |
| ログ | 構造化、request_id/correlation_id、秘密・認証情報・QR生値を記録しない |

DBの各テーブル名・型・索引など本書で具体化したDDL詳細は、確定DDLと同等の変更管理対象とする。DDLレビュー前に本書の補完を既成の基本設計仕様として扱わない。

## 3. システム構成詳細

```mermaid
flowchart LR
  Browser[React + Vite] -->|HTTPS JSON /v1, Cookie, CSRF| Hono[Hono API / Node.js]
  Browser -->|EventSource / SSE| Stream[SSE endpoint]
  Hono --> Auth[Better Auth]
  Hono --> PG[(PostgreSQL)]
  Worker[同一アプリ内ワーカー] --> PG
  Worker --> Mail[認証メール配送]
  Worker --> Obj[(オブジェクトストレージ)]
  Stream --> PG
  PG --> Outbox[(Outbox)]
  Outbox --> Worker
```

| 境界/コンポーネント | 責務と通信 | 依存規則 |
|---|---|---|
| Web UI | 画面状態、入力補助、確認表示、API呼出し。権限の最終判断をしない | API契約のみ参照。DB/秘密鍵へ接続しない |
| Hono route/controller | HTTP解析、認証主体・CSRF・共通エラー、DTO変換 | applicationへ依存。直接SQL/金銭計算を置かない |
| application/use case | ユースケース、認可、Tx境界、結果照会 | domainとportへ依存 |
| domain | 金額、状態遷移、仕訳規則、業務不変条件 | DB/HTTP/外部SDKへ依存しない |
| infrastructure | PostgreSQL repository、Better Auth、メール、ストレージ、clock/logger | domain/application portを実装 |
| Outbox worker | 行ロック取得、配送、再試行、結果記録 | 配送成功を業務Txの成功条件にしない |
| PostgreSQL | 業務正本、台帳、残高射影、監査、Outbox | アプリ以外から更新不可 |
| SSE | 認証・所属を確認し、許可された更新通知のみ送信 | 通知本文を正本にせず、クライアントはAPI再取得 |

**詳細設計上の補完:** デプロイは単一の論理アプリケーションとワーカー役割を同一コードベースで提供する。別サービス化はしない。構成製品、リージョン、スケール方式は未決。ブラウザからDB/ストレージ秘密へ直接アクセスしない。

## 4. ディレクトリ・モジュール構成

```text
apps/web/src/{app,features,shared}
apps/api/src/{http,middleware,modules,workers,bootstrap}
packages/{contracts,domain,application,infrastructure}
packages/domain/src/{money,ledger,identity,event,shop,order}
packages/application/src/{auth,events,roles,payments,cash,transfers,refunds,inventory,orders,reports}
packages/infrastructure/src/{postgres,storage,mail,auth,observability}
database/{migrations,seeds}
```

すべて**詳細設計上の補完**。FEはcontracts以外のserver内部モジュールに依存しない。domainはapplication/infrastructure/httpに依存しない。applicationはdomainとportに依存し、infrastructureがportを実装する。モジュラーモノリスを維持し、モジュール間の書込みはapplication use case経由とする。DB migrationはレビュー済みの順方向変更を基本とし、成立取引の削除・書換えをするrollbackを作らない。実際のworkspace/パッケージ管理ツールと配置は未決事項 U-06。

## 5. 認証詳細設計

Better Authのsession/accountを認証の基盤にする。アプリ側は内部`account_id`を主体として用い、外部provider subjectを業務データに使わない。

| 処理 | 入力・処理/DB | 成功・失敗 | エラー/安全策 |
|---|---|---|---|
| メール登録・確認 | メール、15～128文字PW。正規化メール一意確認、Better Authでハッシュ保存、確認tokenはハッシュ保存 | 未確認状態のアカウントとメールOutbox。確認tokenは24h | `AUTH_INVALID`/`AUTH_RATE_LIMITED`; 生PW/tokenをログに出さない |
| メールログイン | 資格情報をBetter Authで検証しsession発行 | Cookieを返す | 不一致は同一応答、レート制限、資格情報列挙を防止 |
| Googleログイン | ID tokenをサーバー検証（署名、iss、aud、exp、nonce）。`provider+subject`一意 | 既存identityへ接続、なければ新規認証主体 | メール一致だけで自動統合しない。無効tokenは拒否 |
| identity連携/解除 | 既存主体再認証＋追加provider認証、最終認証手段は解除不可 | identity変更をAudit記録 | `AUTH_REAUTH_REQUIRED`、`AUTH_LAST_METHOD` |
| session/logout | HttpOnly/Secure/SameSite cookie、無操作7日・絶対30日。logoutで現session、全端末logoutで全session失効 | session状態を失効 | 失効主体は次のAPI要求から401 |
| PW再設定 | 30分token、単回消費、成功時既存session失効 | 通知はOutbox | token生値を保存・記録しない |
| 認証主体取得 | cookie→Better Auth→account有効性・メール確認・event停止を読み取る | `Principal{accountId,sessionId,authenticatedAt,mfaAt}` | 未認証401、停止主体403 |

TOTPは30秒周期、±1周期、再利用不可、5回/5分失敗後15分停止。回復コードは一回限りのハッシュ。業務追加認証の最大8h/無操作30分、特権操作5分以内要件はAPIごとに再検証する。メール配送事業者やcookie具体属性は未決。

## 6. 認可詳細設計

すべてのhandlerは`authorize(principal, event_id, shop_id?, operation, resource?)`を呼ぶ。サーバーはアカウント状態、本人確認、membership、grant、event/shop/register停止、機能設定、受付期間、必要MFA、対象行の所属を検証する。画面表示状態を信用しない。ID指定リソースはevent/shop/account複合関係を照合し、秘匿対象は404を返す。

| 主体 | API操作群（基本設計API ID） | 強制確認 |
|---|---|---|
| 来場者 | E03、Q02/Q04、T01/T03/T04、C02、F01/F02/F03、H01、P03/P05、O01/O02/O04/O05、W01/W02、N01 | event membership、対象wallet/order所有者、参加・機能・期限、本人承認 |
| 主催者 | E02/E04～E09、S01/S03/S04、C04/C05、H02～H04、P01～P04、O03/O04、R01～R05 | owner一致、必要MFA/理由、自eventのみ。任意残高編集不可 |
| 運営担当 | 付与されたE/S/C/H/R操作 | active grantのevent・operation・有効範囲、停止状態、追加認証 |
| 店舗管理者 | E08、S01/S03、P01～P04、O02～O04、Q01 | event＋shop所属、主催者許可範囲、管理対象店舗 |
| レジ担当 | Q01/Q03、O02/O03（付与操作のみ） | register割当、shop・event一致、最新grant。返金/総売上は付与なければ拒否 |
| 返金権限者 | R02、T05 | 元取引event/shop一致、返金grant、MFA、累計・数量上限 |
| プラットフォーム管理者 | A05/E10/R05 | 特権grant・MFA・理由。業務権限自己付与不可 |

権限と資源状態の読取り・業務更新を同一Tx内で行う。grant変更との競合はgrant行をFOR UPDATEでロックし、金銭確定と解除の順序を直列化する。

## 7. データモデル物理設計

### 7.1 共通規約

以下の物理表は**詳細設計上の補完案**である。全表に`created_at timestamptz NOT NULL DEFAULT now()`、更新される表に`updated_at timestamptz NOT NULL DEFAULT now()`、必要な行に`version integer NOT NULL DEFAULT 1 CHECK(version>0)`を持たせる。金銭・監査履歴は論理削除しない。FKは原則`ON DELETE RESTRICT ON UPDATE RESTRICT`。参照不能な一時秘密は期限後削除。すべてのevent子表にevent_idを持たせ、複合FKでevent越境を防ぐ。IDの生成・UUID方式は未決。

### 7.2 テーブル定義

省略なしの列一覧を示す。`NN`=NOT NULL、`?`=NULL可。UNIQUE/INDEX/CHECKも各行に記載する。単一列PKは`id UUID NN PK`で表す。

| テーブル（論理名） | 列定義: `物理名 型 NULL DEFAULT 制約 —意味/値域` | 一意・検索・ライフサイクル |
|---|---|---|
| accounts（アカウント） | `id UUID NN`、`email CITEXT NN`、`email_verified_at timestamptz ?`、`status text NN 'ACTIVE'`、`display_name varchar(100) NN`、共通日時 | PK id、UNIQUE email、CHECK status ACTIVE/SUSPENDED/DELETION_PENDING。identity参照中削除不可。認証基盤との分離方法は未決 |
| identities（外部認証） | `id UUID NN`、`account_id UUID NN`、`provider text NN`、`provider_subject text NN`、`created_at` | PK、FK accounts、UNIQUE(provider,provider_subject)、INDEX(account_id)。provider値メール/Google（Better Auth内部形式に合わせる） |
| sessions（セッション） | `id UUID NN`、`account_id UUID NN`、`token_hash bytea NN`、`expires_at timestamptz NN`、`revoked_at timestamptz ?`、日時 | PK、FK accounts、UNIQUE token_hash、INDEX(account_id,expires_at)。期限後削除可能 |
| events（イベント） | `id UUID NN`、`owner_account_id UUID NN`、`name varchar(100) NN`、`status text NN`、`listing_status text NN`、`participation_mode text NN`、`starts_at/ends_at timestamptz NN`、`settings jsonb NN '{}'`、`version int NN 1`、日時 | PK、FK accounts、CHECK時刻順・状態列挙、INDEX(status,starts_at,id)。業務履歴参照中削除不可 |
| event_policies（条件版） | `id UUID NN`、`event_id UUID NN`、`version int NN`、`terms jsonb NN`、`effective_at timestamptz NN`、`created_by UUID NN`、`created_at` | PK、FK event/account、UNIQUE(event_id,version)、INDEX(event_id,effective_at)。append-only |
| memberships（参加） | `id UUID NN`、`event_id UUID NN`、`account_id UUID NN`、`status text NN 'ACTIVE'`、`accepted_policy_version int NN`、`joined_at timestamptz NN`、日時 | PK、複合一意(event_id,account_id)、FK event/account/policy。INDEX(account_id,status)。参加だけではgrantなし |
| grants（権限付与） | `id UUID NN`、`event_id UUID NN`、`account_id UUID NN`、`shop_id UUID ?`、`operation text NN`、`status text NN`、`granted_by UUID NN`、`version int NN 1`、日時 | PK、FK event/account/shop、UNIQUE(event_id,account_id,shop_id,operation)、INDEX(event_id,shop_id,status)。親発行者削除に依存しない |
| invitations（招待） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID ?`、`token_hash bytea NN`、`email CITEXT NN`、`grant_spec jsonb NN`、`status text NN`、`expires_at timestamptz NN`、`created_by UUID NN`、`accepted_by UUID ?`、日時 | PK、UNIQUE token_hash、INDEX(event_id,status,expires_at)。72h・一回限り、秘密ハッシュは失効30日後削除 |
| shops（店舗） | `id UUID NN`、`event_id UUID NN`、`name varchar(100) NN`、`description varchar(1000) NN ''`、`status text NN`、`suspension jsonb NN '{}'`、`version int NN 1`、日時 | PK、UNIQUE(event_id,id)、INDEX(event_id,status)。参照履歴があれば削除不可 |
| registers（レジ） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID NN`、`register_code varchar(64) NN`、`status text NN`、`assigned_account_id UUID ?`、日時 | PK、複合FK(event_id,shop_id)、UNIQUE(shop_id,register_code)、INDEX(shop_id,status) |
| wallets（残高射影） | `id UUID NN`、`event_id UUID NN`、`account_id UUID NN`、`available_amount numeric(30,0) NN 0`、`held_amount numeric(30,0) NN 0`、`refund_only_amount numeric(30,0) NN 0`、`version bigint NN 1`、日時 | PK、UNIQUE(event_id,account_id)、UNIQUE(event_id,id)、複合FK membership、CHECK各額>=0、INDEX(event_id,account_id)。台帳から再構築可能な射影 |
| holds（払戻し拘束） | `id UUID NN`、`event_id UUID NN`、`wallet_id UUID NN`、`cash_operation_id UUID NN`、`amount numeric(30,0) NN`、`status text NN`、`expires_at timestamptz NN`、`version int NN 1`、日時 | PK、FK wallet/operation、CHECK amount>0、UNIQUE(cash_operation_id)、INDEX(event_id,status,expires_at)。自動解除禁止 |
| transactions（取引） | `id UUID NN`、`event_id UUID NN`、`type text NN`、`status text NN 'SUCCEEDED'`、`amount numeric(30,0) NN`、`actor_account_id UUID NN`、`source_ref UUID ?`、`occurred_at timestamptz NN`、`idempotency_id UUID NN`、`metadata jsonb NN '{}'`、`created_at` | PK、UNIQUE(event_id,id)、FK event/account/idempotency、CHECK amount>0、INDEX(event_id,occurred_at DESC,id)、INDEX(source_ref)。確定後更新/削除禁止 |
| ledger_entries（台帳明細） | `id UUID NN`、`event_id UUID NN`、`transaction_id UUID NN`、`account_code text NN`、`wallet_id UUID ?`、`amount numeric(31,0) NN`、`created_at` | PK、複合FK(event_id,transaction_id)、FK wallet、INDEX(event_id,transaction_id)、INDEX(wallet_id,created_at)。transaction内SUM(amount)=0は遅延制約triggerで検査。append-only |
| idempotency_keys（冪等結果） | `id UUID NN`、`event_id UUID NN`、`actor_account_id UUID NN`、`operation text NN`、`key varchar(128) NN`、`request_hash bytea NN`、`result_resource_id UUID ?`、`response_snapshot jsonb ?`、`status text NN`、`created_at` | PK、UNIQUE(actor_account_id,event_id,operation,key)、INDEX(status,created_at)。取引保存期間保持 |
| payment_requests（支払要求） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID NN`、`register_id UUID ?`、`payer_account_id UUID ?`、`token_id UUID ?`、`type text NN`、`status text NN`、`amount numeric(30,0) NN`、`content_snapshot jsonb NN`、`content_hash bytea NN`、`expires_at timestamptz NN`、`version int NN 1`、`transaction_id UUID ?`、日時 | PK、複合FK shop/event、FK account/transaction、CHECK amount>0、INDEX(event_id,status,expires_at)、payer/event/statusの承認待ち検索。状態列挙は8章 |
| tokens（用途限定token） | `id UUID NN`、`event_id UUID NN`、`purpose text NN`、`token_hash bytea NN`、`subject_account_id UUID ?`、`resource_id UUID ?`、`expires_at timestamptz NN`、`consumed_at timestamptz ?`、`revoked_at timestamptz ?`、日時 | PK、UNIQUE token_hash、INDEX(event_id,purpose,expires_at)。一回消費は条件付きUPDATE |
| cash_operations（現金処理） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID ?`、`account_id UUID NN`、`operator_account_id UUID NN`、`type text NN`、`status text NN`、`amount numeric(30,0) NN`、`transaction_id UUID ?`、`external_fact text ?`、`reason text ?`、`version int NN 1`、日時 | PK、複合FK event/shop、FK accounts/transaction、CHECK amount>0、INDEX(event_id,type,status,created_at) |
| cash_cases（現金調査案件） | `id UUID NN`、`event_id UUID NN`、`cash_operation_id UUID NN`、`status text NN`、`reason text NN`、`assigned_to UUID ?`、`resolved_at timestamptz ?`、`resolution jsonb ?`、日時 | PK、FK operation/account、INDEX(event_id,status,created_at)。解決履歴はAuditにも追記 |
| products（商品） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID NN`、`name varchar(100) NN`、`description varchar(1000) NN ''`、`price numeric(30,0) NN`、`status text NN`、`image_key text ?`、`version int NN 1`、日時 | PK、UNIQUE(event_id,shop_id,id)、複合FK shop、CHECK price>0、INDEX(shop_id,status,name)。物理削除不可、停止状態で保管 |
| inventory（現在在庫） | `event_id UUID NN`、`shop_id UUID NN`、`product_id UUID NN`、`on_hand bigint NN 0`、`reserved bigint NN 0`、`version bigint NN 1`、日時 | PK(event_id,product_id)、複合FK product/shop、CHECK 0<=reserved<=on_hand、INDEX(shop_id,product_id) |
| stock_moves（在庫移動） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID NN`、`product_id UUID NN`、`delta bigint NN`、`reason text NN`、`actor_account_id UUID NN`、`created_at` | PK、複合FK product/shop、CHECK delta<>0、INDEX(event_id,product_id,created_at)。append-only |
| stock_reservations（予約） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID NN`、`product_id UUID NN`、`payment_request_id UUID NN`、`order_line_id UUID ?`、`quantity integer NN`、`status text NN`、`expires_at timestamptz NN`、`version int NN 1`、日時 | PK、FK product/request/order line、UNIQUE(payment_request_id,product_id)、CHECK quantity BETWEEN 1 AND 999、INDEX(event_id,status,expires_at) |
| orders（注文） | `id UUID NN`、`event_id UUID NN`、`shop_id UUID NN`、`account_id UUID NN`、`transaction_id UUID ?`、`payment_request_id UUID ?`、`display_number varchar(32) NN`、`channel text NN`、`status text NN`、`fulfillment_status text NN`、`total_amount numeric(30,0) NN`、`version int NN 1`、日時 | PK、UNIQUE(event_id,shop_id,id)、UNIQUE(event_id,shop_id,display_number)、FK membership/shop/transaction/request、CHECK total>=0、INDEX(shop_id,status,created_at)、INDEX(account_id,created_at) |
| order_lines（注文明細） | `id UUID NN`、`event_id UUID NN`、`order_id UUID NN`、`product_id UUID NN`、`product_name_snapshot varchar(100) NN`、`unit_price numeric(30,0) NN`、`quantity integer NN`、`line_total numeric(30,0) NN`、`product_version int NN`、`refunded_quantity integer NN 0`、日時 | PK、複合FK(order,event)、FK product RESTRICT、CHECK unit_price>0、quantity 1..999、line_total=unit_price*quantity、0<=refunded<=quantity、INDEX(order_id) |
| refunds（返金） | `id UUID NN`、`event_id UUID NN`、`original_transaction_id UUID NN`、`refund_transaction_id UUID ?`、`order_id UUID ?`、`actor_account_id UUID NN`、`amount numeric(30,0) NN`、`status text NN`、`reason text NN`、`idempotency_id UUID NN`、日時 | PK、FK event/transaction/order/key、CHECK amount>0、INDEX(event_id,original_transaction_id)、成立累計は元取引ロック下で検証 |
| refund_lines（返金明細） | `id UUID NN`、`event_id UUID NN`、`refund_id UUID NN`、`order_line_id UUID NN`、`quantity integer NN`、`amount numeric(30,0) NN`、日時 | PK、FK refund/line、CHECK quantity>0 AND amount>0、INDEX(order_line_id)。累計数量はTx内検証 |
| audit（監査） | `id UUID NN`、`event_id UUID ?`、`shop_id UUID ?`、`actor_account_id UUID ?`、`action text NN`、`target_type text NN`、`target_id UUID ?`、`reason text ?`、`before_data jsonb ?`、`after_data jsonb ?`、`request_id text ?`、`ip inet ?`、`created_at timestamptz NN` | PK、INDEX(event_id,created_at)、INDEX(actor_account_id,created_at)、追記のみ。credential/token/不要個人情報禁止 |
| outbox（後続配信） | `id UUID NN`、`event_id UUID ?`、`aggregate_type text NN`、`aggregate_id UUID NN`、`event_type text NN`、`payload jsonb NN`、`status text NN 'PENDING'`、`retry_count int NN 0`、`next_retry_at timestamptz NN now()`、`locked_at timestamptz ?`、`processed_at timestamptz ?`、`last_error_code text ?`、`created_at` | PK、UNIQUE(id)、CHECK retry_count>=0、INDEX(status,next_retry_at,created_at)。payloadに秘密を含めない |
| exports（CSV成果物） | `id UUID NN`、`event_id UUID NN`、`requested_by UUID NN`、`snapshot_id UUID NN`、`filters jsonb NN`、`status text NN`、`object_key text ?`、`row_count bigint ?`、`expires_at timestamptz NN`、`error_code text ?`、日時 | PK、FK event/account、INDEX(requested_by,status)、24時間後削除 |

`amount`のledgerは符号付きなので`numeric(31,0)`で差分を表し、各取引の絶対値は30桁以内。台帳合計ゼロ制約は複数行制約のため**詳細設計上の補完**として遅延constraint triggerでCOMMIT時に検証する。勘定科目コード一覧、残高射影と台帳の勘定マッピングはDDL確定時に固定する。

### 7.3 関係・削除更新

```mermaid
erDiagram
  ACCOUNTS ||--o{ MEMBERSHIPS : joins
  EVENTS ||--o{ MEMBERSHIPS : has
  EVENTS ||--o{ SHOPS : contains
  SHOPS ||--o{ PRODUCTS : sells
  PRODUCTS ||--|| INVENTORY : stock
  PRODUCTS ||--o{ STOCK_MOVES : changes
  PRODUCTS ||--o{ STOCK_RESERVATIONS : reserves
  ACCOUNTS ||--o{ WALLETS : owns
  EVENTS ||--o{ WALLETS : scopes
  WALLETS ||--o{ HOLDS : locks
  EVENTS ||--o{ TRANSACTIONS : records
  TRANSACTIONS ||--|{ LEDGER_ENTRIES : posts
  TRANSACTIONS ||--o{ PAYMENT_REQUESTS : settles
  EVENTS ||--o{ ORDERS : receives
  ORDERS ||--|{ ORDER_LINES : contains
  TRANSACTIONS ||--o{ REFUNDS : corrected_by
  REFUNDS ||--o{ REFUND_LINES : details
  EVENTS ||--o{ AUDIT : audits
  EVENTS ||--o{ OUTBOX : emits
```

Membership (account,event)は一意、Walletも同一組で一意。ShopはEventの子、Register/Product/Orderはshop/event複合FKを持つ。Transactionは台帳明細を2件以上持ち、削除連鎖なし。Orderは複数line、Refundは複数refund_line。Reservationはrequest/product単位で一意、成立・期限切れ・取消の各処理で同じ行をロックする。履歴・金銭根拠がある行は物理削除しない。アカウント個人情報の分離はPRV-03～05と保存基準に従う。

## 8. 金銭・台帳詳細設計

`Transaction → Ledger Entry → Wallet/Account`を正本関係とする。Walletは読取性能用射影で、台帳なし更新は禁止。`available_amount`, `held_amount`, `refund_only_amount`は別区分であり、held/refund-onlyは支払可能額に含めない。

| 業務 | 台帳・業務データ | Wallet/在庫効果 |
|---|---|---|
| 現金チャージ | cash受領事実確認後、取引+利用者借方相当/現金受領勘定貸方の均衡仕訳 | available加算。現金事実とDB Txは非原子的、照合案件で扱う |
| 決済 | 利用者利用可能勘定から店舗売上勘定へ振替 | available減、注文なら売上/注文/在庫も同一Tx |
| 譲渡 | 送信者から受取人へイベント内振替 | 送信者減・受取人増、イベント総額不変 |
| 払戻し申出 | 取引を成立させず、availableからheldへ内部振替とHoldを作成 | available減、held増。現金交付確定は別操作 |
| 払戻しPAID | heldから払戻し済勘定へ別取引 | held減、現金交付記録。既交付現金を取消さない |
| 未交付取消 | heldからavailableへ解放取引 | held減、available増。現金未交付確認必須 |
| 購入返金 | 元取引を変更せず、新TransactionとRefundを追加 | 販売中はavailableへ、販売終了後はrefund_onlyへ。返金専用額は支払不可 |
| 失効/訂正 | 理由・対象を参照する別Transaction | 既存仕訳を更新/削除しない |

各Transactionは正数amount、type、actor、event、idempotency参照を持つ。仕訳金額の絶対値は30桁以下、符号合計0、最低2行。`NUMERIC(30,0)`範囲を越える計算は全体ROLLBACK。丸めなし。数量は整数、金額からの換算なし。チャージ・譲渡・保有残高に業務上限を設けない。

## 9. トランザクション・排他・冪等性

### 9.1 共通Tx順序

1. `BEGIN`。冪等キー行を作成、競合時既存行を取得。
2. 内容hashが異なれば409。同hashなら保存結果を返し、再実行しない。
3. Event/停止・membership・grantをロックまたは条件付き再読込し認可する。
4. 対象行を固定順で`SELECT ... FOR UPDATE`: walletsをaccount_id昇順、payment_request/transaction、productsをproduct_id昇順、reservations、order/refund元行。
5. 業務条件と値域を検証、業務データ・Transaction・Ledger Entry・wallet射影を更新。
6. AuditとOutboxを同じTxにINSERT。
7. 遅延仕訳制約とCHECKを検証してCOMMIT。応答はcommit後のみ。

**詳細設計上の補完:** IsolationはREAD COMMITTED + 明示行ロック・一意制約・条件付きUPDATEを標準とする。`40001`/`40P01`は内部で同一キー最大3回再試行（指数遅延なしの短いjitter、Tx全体を再実行）。超過は503 retryable、クライアントは同一冪等キーを維持する。分離レベルは実装・負荷試験で再確認する未決。

### 9.2 個別排他

| 競合 | ロック/制約・競合時 |
|---|---|
| wallet同時更新 | wallet行をevent/account順でFOR UPDATE。残高不足なら409、部分確定しない |
| 二重決済/Payment Request承認 | request行FOR UPDATE、`status=AWAITING_APPROVAL`条件付きUPDATE、transactionの要求参照一意、冪等キーUNIQUE |
| 二重返金 | 元transactionと対象order_lineをFOR UPDATE。確定refund累計・返金数量を再計算して上限超過409 |
| 二重払戻し | walletとcash_operation/hold行をFOR UPDATE、cash_operation idempotency UNIQUE。CASH_HANDING後は自動解放禁止 |
| 在庫競合 | inventory行product_id順FOR UPDATE。`on_hand-reserved >= qty`条件付き更新。全明細一括、不可なら全体拒否 |
| reservation expiry vs pay | reservation行FOR UPDATE、期限と状態をDB時刻で判定。成立か解放の一方だけが状態更新 |
| 注文同時更新 | order行FOR UPDATEとversion条件。古いversionは409＋最新状態 |
| 権限解除 vs commit | grant行を金銭業務行より先にFOR UPDATE。解除が先なら拒否、確定が先なら解除後は新規操作不可 |

### 9.3 冪等性

金銭/在庫確定APIは`Idempotency-Key`必須（1～128 ASCII可視文字、**補完**）。DB一意キー `(actor_account_id,event_id,operation,key)`、canonical JSON SHA-256を保存する。同じ内容は同じresource/結果を返す。同キー異内容は409 `IDEMPOTENCY_CONFLICT`。応答喪失時は同キー再送またはresource照会。処理中行は短時間待機後202/409 `REQUEST_IN_PROGRESS`を返し、二重処理しない。永続保持は台帳と同期間。Outboxは`outbox.id`を配信側dedupe keyにする。配信はat-least-once、受信側重複排除を必須とする。

## 10. 状態遷移詳細

基本設計で定義された状態名を維持する。下表にない任意遷移、終端状態からの復帰を禁止する。DB状態CHECKは列挙、遷移許可はapplicationと条件付きUPDATEで検証。

| 対象 | 許可遷移 | 禁止/例外 |
|---|---|---|
| Event | 下書き→公開・準備中→開催中→販売終了→精算中→完了 | 完了後訂正は理由付き再開。未解決残高/現金/注文/返金があれば完了不可 |
| Payment Request | CREATED→AWAITING_APPROVAL→SUCCEEDED/DECLINED/CANCELLED/EXPIRED。CREATED→CANCELLED | SUCCEEDEDから逆遷移なし。内容変更は旧取消+新規 |
| Transaction | 作成→SUCCEEDEDの一方向。現金結果不明等の業務状態はcash_operation/caseに保持 | 成立Transactionの取消/UPDATE/DELETE禁止。訂正は別取引 |
| Hold/払戻し | PREPARED→HELD→CASH_HANDING→PAID。未交付確認後CANCELLED。結果不明→INVESTIGATING | 5分警告、30分調査一覧、自動解除なし。CASH_HANDING以降調査必須 |
| Refund | 要求→成立、または未完了調査 | 元Transaction変更なし。30日経過で消去しない |
| Order | 支払待ち→受付済み→調理・準備中→受取待ち→受取完了 | 支払済取消は返金と対応。提供/返金状態は独立 |
| Stock Reservation | RESERVED→CONSUMED / RELEASED / EXPIRED | 終端から遷移なし。部分予約なし |
| Membership | ACTIVE→SUSPENDED/LEFT（基本設計上の主体状態に従う） | wallet残高処理前の削除不可。正確な状態名・退会手順はOpenAPI/DDL確定事項 |
| Shop/Register | ACTIVE↔SUSPENDED、registerの割当/解除 | 停止で履歴削除しない。店舗/レジ全状態語彙は要件から不足、要確認 |
| Invitation | ISSUED→ACCEPTED/DECLINED/EXPIRED/REVOKED | 72h、一回限り。受諾時権限再計算 |

membership/shop/registerの状態語彙など基本設計が一意に定めない箇所は補完候補として本節に記載したが、最終enumは未決 U-18。

## 11. API詳細設計

APIパスは基本設計14章の論理案を引き継ぎ、パスを確定仕様とはしない。実装時の契約はOpenAPIが正本。共通ルール: JSON body、UUID path、UTF-8、金額文字列、UTC日時、カーソル不透明文字列。POST成功は201、非同期CSV受付202、GET 200、削除/失効204。認証不要は公開イベント一覧と認証入口のみ。更新系はCSRF。全pathで親子所属を検証。

| API群/ID | Request要点→Response要点 | 認証・Tx・代表競合 |
|---|---|---|
| A01–A04 | 認証入力→主体/session状態 | Better Auth処理。資格情報は応答・監査へ含めない |
| E01–E10 | 検索/イベント設定/参加/停止/完了→event、version、状態 | E03 membership一意。設定更新はIf-Match/version。完了判定Tx |
| S01–S04 | 招待先/権限/受諾→invitation/grant状態 | tokenハッシュ一回消費、受諾とgrant作成同一Tx |
| Q01–Q04 | 店舗/方式/金額/明細/承認内容版→request状態/transaction ID | request承認はwallet・requestロック、内容hash一致。GETは結果照会 |
| T01–T05/W01–W02 | wallet summary、履歴、取引、訂正理由→残高/取引結果 | T02/T05は冪等必須。成功応答はcommit後 |
| C01–C05/H01–H04 | QR/額/現金事実/担当/調査理由→cash_operation/hold/case | 現金記録と台帳Tx区別。結果不明を照会し、勝手に再現金交付しない |
| F01–F03 | 受取token/金額/承認→譲渡結果/受取QR | 送受walletをID順ロック、event同一・譲渡ON |
| P01–P05 | 商品/在庫移動/カート/checkout→商品版/予約期限/request | 画像5MB制限。checkout全明細予約を単一Tx |
| O01–O05 | 支払request/注文状態/受取確認→order・line snapshot | 決済・注文・在庫・台帳同一Tx。状態更新はversion必須 |
| R01–R05 | 集計条件/CSV条件→report/export/snapshot | 範囲認可、snapshot固定、download時再認可 |
| N01 | Last-Event-ID→SSE stream | 有効認証+event membership、送信対象再認可 |

### 11.1 金銭APIの代表JSON型

```ts
type Money = string; // /^(0|[1-9][0-9]{0,29})$/。業務入力では1以上
type ErrorBody = { code: string; message: string; request_id: string;
  retryable: boolean; current_state_or_query?: { resource_id: string; status?: string } };
type CreatePaymentRequest = {
  shop_id: string; register_id?: string; method: "A" | "B" | "C";
  amount: Money; currency: "JPY"; lines?: Array<{product_id:string; quantity:number; product_version:number}>;
  content_version: number;
};
type TransactionResult = { transaction_id:string; status:"SUCCEEDED";
  event_id:string; amount:Money; currency:"JPY"; occurred_at:string; request_id:string };
```

**詳細設計上の補完:** currency固定値JPY、数量1..999、version一致を契約候補とする。支払応答に不要な個人情報を返さない。具体path/schema/error HTTP最終対応はU-03/U-15。

### 11.2 API validation

Bodyはstrict schema（未知フィールド拒否）、UUID形式、文字列長・列挙値・範囲・親子関係をサーバー検証。金額は指数・符号・小数・空白・先頭ゼロ（`0`以外）を拒否。時刻はoffset付きRFC3339。ページ上限は基本設計値を維持（イベント20、履歴50、各最大100等）。エラーは14章。

## 12. エラー設計

| code | HTTP | 表示/ログ/再試行 | クライアント動作 |
|---|---:|---|---|
| AUTH_REQUIRED / AUTH_INVALID | 401 | 再ログイン案内、INFO、不可 | 認証画面へ |
| FORBIDDEN / RESOURCE_NOT_FOUND | 403/404 | 範囲外を露出しない、WARN、不可 | 権限/対象確認 |
| VALIDATION_ERROR | 422 | 項目修正、INFO、不可 | 入力修正 |
| INVALID_STATE / VERSION_CONFLICT | 409 | 最新状態案内、INFO、不可 | 再取得し再確認 |
| INSUFFICIENT_BALANCE / INSUFFICIENT_STOCK | 409 | 部分確定なし、INFO、不可 | 金額/数量再確認 |
| IDEMPOTENCY_CONFLICT | 409 | 同じキーで照会、WARN、不可 | 元要求を照会、キー再利用禁止 |
| REQUEST_IN_PROGRESS / RESULT_UNKNOWN | 202/409 | status照会、INFO、可（同キーのみ） | resource照会。新キーを生成しない |
| TOKEN_EXPIRED / TOKEN_CONSUMED | 409 | 新規発行案内、INFO、不可 | 用途に従い再取得 |
| RATE_LIMITED | 429 | retry-after、WARN、待機後可 | 指示時間待つ |
| DEPENDENCY_UNAVAILABLE / DB_UNAVAILABLE | 503 | request_id付き、ERROR、条件付き可 | 同一キー照会/再送 |
| INTERNAL_ERROR | 500 | 一般文言、ERROR、原則不可 | request_idで問い合わせ |

例外handlerはSQL詳細・stack・秘密をresponseへ返さない。DB connection消失時はcommit結果不明として冪等レコード/取引照会を優先する。

## 13. QR・トークン詳細

基本設計の用途別有効時間を維持する（受付60秒、B表示60秒/要求180秒、A表示300秒/要求180秒、譲渡300秒）。固定Cは公開識別URLで金額・残高・承認を含めず、停止/再発行可能。CR-0001レビュー中の仕様は未採用確定とし、現行要件との差を実装前に解決する。

QR本体は自サービスのHTTPS URLと不透明tokenのみ。金額・残高・氏名・メール・恒久権限を含めない。tokenはCSPRNG生成、生値を発行応答だけで返しDBにはSHA-256以上の検証用hash保存。**bit長は基本設計未決のため固定しない**。purpose/event/subject/resource/expiry/consumedを照合し、消費は`UPDATE ... WHERE consumed_at IS NULL AND expires_at > now() RETURNING`で一回性を保証。読取成功は決済成功でなく、常にPayment Requestを照会する。

## 14. 商品・在庫・注文

商品更新はversion付き。価格・商品名・商品version・単価・数量・合計をcheckout時にrequest/order lineへsnapshot保存し、商品master更新で過去注文を変更しない。数量は整数、販売可能数=`on_hand-reserved`。在庫移動は理由付きStockMove追記とinventory残高更新を同一Tx。負数・予約数未満になる調整は拒否。

Checkoutはカートversion、商品status/価格version、店舗受付、在庫を再検証し、全明細予約180秒と支払要求を一括作成。予約中の価格固定はsnapshotに保持。決済成功でinventory.on_handとreservedを予約数量分減算、reservationをCONSUMED、注文/line/ledgerを作成。取消・期限切れはreservedのみ解放しRELEASED/EXPIREDにする。expiry workerと決済は予約行ロックで競合解決。

OrderLineは商品名、単価、商品版、数量、line_totalを保存。部分返金はrefund_lineの数量・金額を追記し、提供状態を書き換えない。再販可能在庫への戻しは明示的なStockMoveとして運営判断後のみ行い、自動で戻さない（基本設計に再販自動化なし）。受取照合は8桁コード、注文/10分5失敗で保留、公開呼出画面に氏名・メール・残高を出さない。

## 15. Outbox・SSE

### 15.1 Outbox

イベント形式: `{id,event_id,aggregate_type,aggregate_id,event_type,occurred_at,schema_version,payload}`。payloadは通知に必要な最小情報とresource IDのみ。金銭詳細・秘密tokenを含めない。Workerは`SELECT ... FOR UPDATE SKIP LOCKED`でPENDINGかつnext_retry_at到来行を取得し、短時間ロック後に配送。成功はPROCESSED/processed_at、失敗はretry_count+1、指数バックオフ（1s,2s,4s...最大15m、**補完**）、last_error_code更新。最大試行後も削除せずDEAD状態/運用アラートにし、手動再実行は同event IDを保つ。外部配送はat-least-once。

### 15.2 SSE

`GET /v1/events/{event_id}/stream`。session cookieで認証しCSRFはGETのため不要、Originを検査、event membership/許可範囲を確認。heartbeat 20秒（補完）、`id:`はoutbox UUID、`event:`は許可型、`data:`は最小JSON `{resource_type,resource_id,version}`。Last-Event-IDから再開できない/保持範囲外の場合`resync`を送信し、正本API再取得を促す。接続中も停止・membership失効を再確認し、権限外・他eventのeventを配信しない。SSEは成功証明でない。

## 16. 監査・ログ

Auditは金銭、権限、招待、返金、払戻し、現金、停止/再開、所有者交代、失効、CSV生成/取得、特権調査を記録。actor/event/shop/action/target/time/reason/request_idと必要な差分を記録する。IPは不正調査目的に限定しPRV保存期限を適用。before/afterからemail、PW、token、TOTP、回復コード、session cookie、全文リクエストを除去。監査行は追記のみで通常アプリから更新削除不可。

アプリログはJSONで`timestamp,level,service,request_id,correlation_id,account_id?,event_id?,operation,code,duration_ms`。errorはstackをアクセス制限ログへ分離。ログレベルDEBUG開発、INFO通常、WARN拒否/競合、ERROR障害。アクセス/認証ログ30/180日、台帳・重要監査は基本設計の7年等の保持基準に従う。DBログ・保存先・鍵は環境台帳で確定。

## 17. CSV・レポート・ストレージ

集計はイベント/店舗/期間を認可scopeで絞り、決済成立時刻、返金成立時刻を別々に集計。売上=成立商品決済、純売上=決済-返金。チャージ・譲渡・未使用払戻しは店舗売上に含めない。CSVはUTF-8 BOM、CRLF、RFC4180 quoting、式注入対策（先頭`=+-@`等は文字列化）、金額は整数数字列、認証秘密/メール除外。10万行/ファイル、超過連番分割、同時生成2件、24h期限、権限範囲ごとsnapshot固定。出力は正本ではない。

| 成果物 | object key案（補完） | 制御 |
|---|---|---|
| 商品画像 | `events/{event}/shops/{shop}/products/{product}/{random}.{ext}` | JPEG/PNG/WebPのみ、5MB、実体・寸法検査、2048px長辺、EXIF除去・再encode。公開可否/URL設計は未決 |
| CSV | `exports/{event}/{exportId}/{part}.csv` | private bucket、生成者/現在権限を毎回確認、短時間署名URL、24h削除 |

ストレージにユーザー指定URLをfetchしない。拡張子だけでなくContent-Type/マジックbyteを検証。object keyに生メール・氏名・秘密を含めない。具体容量/署名URL TTL/暗号化製品は未決。

## 18. セキュリティ・バリデーション

| 対象 | 制御 |
|---|---|
| 認証/権限 | Better Auth、CSRF、MFA、全handlerでaccount+event+shop+operation検証。IDだけを根拠にしない |
| SQLi | parameterized query、動的order/filter allowlist |
| XSS | React escaping、HTML挿入禁止、CSP。CSV式注入対策 |
| CSRF/CORS | cookie更新系はCSRF token + Origin、許可Origin allowlist |
| SSRF | 外部URL取得機能なし、画像をサーバーfetchしない |
| Rate limit | login/参加PW/受取コード/token/API単位。共用会場IPだけで一括banしない |
| Security headers | HTTPS/HSTS、CSP、frame-ancestors、nosniff、Referrer-Policy（具体値は環境確定） |
| 機密情報 | secrets manager/env注入、ログ・URL・analyticsへtoken/credentialを出さない |
| 金銭保護 | MFA、確認画面、冪等、wallet/元取引/在庫ロック、台帳原子性 |

全検証はサーバー側必須。API共通: bodyサイズ上限、strict schema、許容文字長、enum、UUID、cursor/page上限、数値domain、イベント・店舗・アカウント関係を検査する。画面検証はUX補助に限る。API固有の確定値はOpenAPIで定義し、未決値を暗黙決定しない。

## 19. データ整合性ルール

| 不変条件 | DB制約 | アプリ | Tx/排他 |
|---|---|---|---|
| 金額範囲/正数 | NUMERIC、CHECK >0 | 文字列・桁検証、BigInt | 超過時全ROLLBACK |
| 仕訳合計0/event一致 | FK、遅延trigger | 勘定科目・2行以上生成 | Transaction+entries原子 |
| 利用可能残高非負 | wallet CHECK | 残高不足判定 | wallet FOR UPDATE |
| event/shop所属一致 | 複合FK | scope認可 | 同一Txで最新権限検査 |
| 二重確定なし | UNIQUE冪等/参照 | 状態遷移 | 対象行FOR UPDATE |
| 返金累計以下 | 索引/FK | 元額・数量累計検証 | 元transaction/order_lineロック |
| 在庫予約以内 | CHECK reserved<=on_hand | 可用数/全明細検証 | inventory/reservationロック |
| 注文snapshot不変 | FK、列制約 | masterからsnapshot作成 | 成立後変更なし |
| 監査/台帳append-only | 権限、trigger | 訂正は別行 | 同一Txで関連付け |

## 20. テスト設計

試験を実施したという意味ではない。受入ID AT-001～070は既存管理表を正本とする。

| レイヤ | 観点 |
|---|---|
| Unit | 金額30桁/31桁、拒否形式、仕訳均衡、状態遷移、返金累計、権限policy |
| DB統合 | FK/UNIQUE/CHECK、複合event FK、遅延仕訳制約、append-only、migration |
| API | request/response schema、全認証・認可境界、IDOR、error mapping、rate limit |
| Tx/冪等 | 同一キー再送、異内容衝突、commit前障害、commit後応答喪失、DB rollback、結果照会 |
| 排他 | 同一wallet決済、二重承認、二重返金、二重払戻し、予約expiryと決済、注文同時遷移 |
| Outbox/SSE | worker二重起動、配送失敗/backoff/dead、SSE切断・再接続・Last-Event-ID・範囲越境 |
| 商品/在庫 | 価格変更後snapshot、部分予約を起こさない競合、全量rollback、在庫戻し監査 |
| Security | CSRF/XSS/SQLi/SSRF、token再利用、権限解除race、secret log、画像偽装、CSV式注入 |
| 境界/運用 | 0/負/30桁/桁超過、受付境界、現金DB非原子・結果不明、Outbox遅延、復旧/照合 |

特に通信timeoutは「未成立」と断定しない。実金銭試験、負荷試験、法務/セキュリティ評価の実施前に合格と記録しない。

## 21. シーケンス図

以下は主要フローの処理境界を表す。QR期限等レビュー中差分は実装を開始する前に要件正本との整合を確認する。

### 21.1 ログイン
```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Hono/Better Auth
  participant D as PostgreSQL
  B->>A: email/password
  A->>D: credential/session検証
  D-->>A: account状態
  A-->>B: secure session cookie
  B->>A: GET protected API
  A-->>B: Principal付き応答
```

### 21.2 イベント参加
```mermaid
sequenceDiagram
  participant U as User
  participant API as API
  participant DB as PostgreSQL
  U->>API: 条件版・同意・参加PW
  API->>DB: event/policy検証
  API->>DB: membership upsert (unique)
  DB-->>API: membership
  API-->>U: 参加結果
```

### 21.3 現金チャージ
```mermaid
sequenceDiagram
  participant C as Clerk
  participant API
  participant DB as PostgreSQL
  C->>API: QR + amount + idempotency key
  API->>DB: BEGIN / auth / cash fact / locks
  API->>DB: cash op + transaction + ledger + wallet + audit + outbox
  API->>DB: COMMIT
  DB-->>API: committed result
  API-->>C: transaction id
  Note over C,DB: 現金授受とDB確定は原子的でない。結果不明はcase照会
```

### 21.4 QR決済
```mermaid
sequenceDiagram
  participant Shop as Register
  participant User as Payer
  participant API
  participant DB
  Shop->>API: payment request
  API->>DB: request CREATED
  User->>API: QR resolve / approve
  API->>DB: BEGIN, request+wallet lock, reauthorize
  API->>DB: transaction+ledger+wallet+request+outbox
  API->>DB: COMMIT
  API-->>User: transaction result
  API-->>Shop: result via query/SSE hint
```

### 21.5 譲渡
```mermaid
sequenceDiagram
  participant S as Sender
  participant API
  participant DB
  S->>API: recipient token + amount + key
  API->>DB: BEGIN#59; lock both wallets by account_id
  API->>DB: membership/transfer enabled/balance check
  API->>DB: transfer transaction + balanced ledger + both wallets + outbox
  API->>DB: COMMIT
  API-->>S: transaction result
```

### 21.6 払戻し申請・確定
```mermaid
sequenceDiagram
  participant U as User
  participant Clerk
  participant API
  participant DB
  U->>API: amount + approval
  API->>DB: lock wallet, create hold PREPARED/HELD
  DB-->>U: request id / held amount
  Clerk->>API: confirm cash handoff
  API->>DB: lock operation/hold, record CASH_HANDING
  Clerk->>API: PAID or investigate
  API->>DB: ledger settlement + release hold + audit
  API->>DB: COMMIT
```

### 21.7 購入・取消・部分返金
```mermaid
sequenceDiagram
  participant U as User
  participant Shop
  participant API
  participant DB
  U->>API: checkout cart version
  API->>DB: lock inventory#59; snapshot price#59; reserve all lines
  U->>API: approve payment request
  API->>DB: lock request/wallet/reservations
  API->>DB: order+lines+transaction+ledger+stock consume
  API->>DB: COMMIT
  Shop->>API: fulfill transition
  Shop->>API: cancel/refund lines + reason
  API->>DB: lock original transaction/lines#59; enforce cumulative cap
  API->>DB: separate refund transaction + refund lines
```

### 21.8 在庫予約
```mermaid
sequenceDiagram
  participant U as User
  participant API
  participant DB
  participant W as Expiry worker
  U->>API: checkout
  API->>DB: lock inventory rows in product order
  API->>DB: reserve every line + request (180s)
  W->>DB: lock expired reservations
  DB-->>W: rows only if still RESERVED and expired
  W->>DB: release stock reservation
  Note over API,W: payment commit and expiry serialize on reservation row
```

### 21.9 Outbox・SSE
```mermaid
sequenceDiagram
  participant API
  participant DB
  participant Worker
  participant SSE
  participant Client
  API->>DB: business rows + outbox in one transaction
  Worker->>DB: SKIP LOCKED pending rows
  Worker->>SSE: publish minimal event
  SSE-->>Client: id/type/resource version
  Client->>API: fetch authoritative resource
  Worker->>DB: mark processed
```

## 22. トレーサビリティ

要件IDの完全索引は基本設計36.3を正本として維持する。本表は主要機能単位の実装追跡表であり、既存要件IDを改名しない。

| 要件ID | 基本設計章 | 詳細設計章 | 実装対象 | テスト観点 |
|---|---|---|---|---|
| ACC-01～06, SEC-01～06 | 15,29 | 5,6,18 | auth/session/mfa | login、token、失効、権限 |
| EVT-01～06, JOIN-01～03 | 8,10 | 6,7,10,11 | event/membership/policy | 期間境界、参加一意、完了条件 |
| ROL-01～06, STF-01～05 | 6,15 | 6,7,9 | grants/invitations/audit | 越権、解除race、受諾期限 |
| MNY-01/02, WAL-01～04, LED-01～06 | 17,24 | 7～9,19 | wallet/transaction/ledger | 桁境界、均衡、rollback、競合 |
| TX-01～06, PAY-A/B/C, QR-01～03 | 14,16～18 | 9,11～13 | payment request/token | 二重承認、timeout、token再利用 |
| CHG-01～06, CSH-01～07 | 10,19,25 | 8,9,11,12,21 | cash operation/hold/case | 現金不明、二重交付、拘束 |
| TRF-01～06 | 20 | 8,9,13 | wallet transfer | 二口座競合、イベント境界 |
| REF-01～04, EXP-01～03 | 19,24 | 7～9,14 | refund/refund_line | cumulative cap、返金専用額 |
| PRD-01/02, INV-01～05, ORD-01～06 | 21,22 | 7,9,14,21 | product/inventory/order | 予約競合、snapshot、受取 |
| API-01～05, DAT-01～03 | 14,24 | 2,7,11,18,19 | contracts/DB | schema/FK/IDOR |
| RPT-01～06, PRV-01～05 | 25,26,29 | 7,16,17 | reports/export/audit | 範囲、CSV注入、保持期限 |
| NET-01～04, PWA-01/02 | 5,13,28 | 3,15,21 | SSE/client cache | 再接続、権限外配信 |
| SEC-07～11, PERF-01～13, OPS-01～06 | 29～32 | 3,16～20 | API/infra/observability | セキュリティ、性能、復旧 |
| GOV/LEG/REL/DEV/CHGLOG | 1～3,30～36 | 1,20,23 | gate/運営/変更記録 | gate未完了公開防止 |

## 23. 未決事項

本表は基本設計35章U-01～U-17を引き継ぎ、本詳細設計で露呈した不足を追加する。推奨は案であり、決定扱いではない。

| ID/項目 | 根拠・現状/決める理由 | 候補・推奨 | 影響・変更時注意 |
|---|---|---|---|
| U-01 法的発行主体/法令該当性 | 基本設計未決。資金流れ・上限なし・譲渡・現金払戻しの評価必要 | 法務/関係機関確認を推奨 | 実金銭公開gate、wallet/transfer/cash |
| U-02 運営責任者/終了後窓口 | 未割当 | 主催者・プラットフォーム責任境界を公開前に決定 | 問合せ/保存・公開gate |
| U-03 OpenAPI、Cookie、OAuth callback | APIは論理案 | OpenAPI YAMLを正本化し本文重複を避ける（推奨） | UI/API契約 |
| U-04 物理ER、UUID、分離レベル、勘定科目 | 本書は補完案 | PostgreSQL実機でDDL/競合試験し決定 | 全DB、金銭移行に注意 |
| U-05 クラウド/リージョン/鍵/監視 | 未選定 | 要件RPO/RTOと契約を満たす構成を評価 | ARC/OPS |
| U-06 package/runtime/lockfile | 実版未確定 | 対応期限までにADRとlockfile固定 | build・脆弱性更新 |
| U-07 Google/メール配送 | 未契約 | 開発/本番分離し実機確認 | auth/通知 |
| U-08 QR端末/カメラ/公開cache | 実機未評価 | 複数端末・共用回線で評価 | QR/公開導線 |
| U-09 WCAG/320px評価 | 未実施 | 実機・支援技術評価 | UI |
| U-10 負荷環境・実測 | 未測定 | PERF条件で測定し結果報告 | DB/index/scale |
| U-11 RPO/RTO実装証明 | 未実証 | WAL/PITRと復元・障害試験 | 復旧 |
| U-12 保存期間の法務確認 | 基準は基本設計採用済み | 現基準を維持し、変更は要件変更で扱う | PRV/削除 |
| U-13 招待/全認証喪失窓口 | 未決 | 本人確認窓口・手順を運営決定 | account recovery |
| U-14 object storage/暗号化/期限削除 | 未選定 | private bucket・削除検証を推奨 | 画像/CSV |
| U-15 最終HTTP error mapping/UI文言 | 未確定 | OpenAPIと文言表で固定 | clients |
| U-16 現金実査/差異解消手順 | 運用責任未決 | 模擬運営後に手順確定 | 現金照合 |
| U-17 表示注文番号/照合番号 | 詳細未決 | 推測困難性と現場読み上げ性を評価 | 受取・問い合わせ |
| U-18 Membership/Shop/Register列挙、状態履歴 | 基本設計で全列挙なし | 有効/停止等の状態機械を要件照合後にDDL化 | 6,7,10章。勝手なenum確定不可 |
| U-19 token長/正確な乱数仕様、CSV signed URL TTL | QR強度・TTL未決 | 脅威評価と事業者仕様確認で決める | QR/ストレージ。URL公開漏えいを防ぐ |
| U-20 PostgreSQL trigger実装/台帳勘定体系 | 本書の遅延triggerは補完 | migration・復元・並行Txで実証 | 台帳正本、後方互換注意 |

## 24. 詳細設計で補完した事項

| 項目 | 根拠 | 判断 | 理由・影響 | 将来変更時の注意 |
|---|---|---|---|---|
| 物理テーブル群/共通日時 | 論理データモデル | 7章のUUID/FK/日時/CHECK案 | 実装可能なDDL案を示す | DDL化前にER/移行レビュー |
| Isolation/lock順 | TX-03/04/06、LED-03/04 | READ COMMITTED+行lock+一意制約 | 明示した行単位競合制御 | 性能測定後変更、台帳原子性維持 |
| Idempotency-Key長/hash | 冪等必須 | 1..128文字、canonical hash | 同一キー異内容拒否 | key scope変更は再送互換を壊す |
| Outbox retry | DB+後続通知整合 | SKIP LOCKED/at-least-once/backoff | worker多重実行耐性 | consumer側重複排除を保持 |
| SSE payload/heartbeat | SSE通知方針 | resource ID/versionのみ、20s heartbeat | 個人/金銭情報露出抑制 | Last-Event-ID保持期間を合わせる |
| API TS型/JPY | 金額・API方針 | 代表型を提示、JPY固定 | 型検証の実装開始支援 | OpenAPIを正本化 |
| CSV object key/画像制御 | 保存/画像要件 | private key命名案、5MB/形式制限再掲 | 混在・実行ファイル防止 | 実サービス制約確認 |
| エラーコード群 | 基本設計共通error | 章12の候補コード | UI/再試行を統一 | HTTP最終mappingはOpenAPIで確定 |
| directory分割 | モジュラーモノリス | 4章案 | 依存方向と実装所有境界 | repo ADR/実装開始時調整 |

## 25. 自己レビュー・今後の成果物

| 観点 | 確認結果 |
|---|---|
| 基本設計整合 | 基本設計の数値・状態・期間・保存基準を保持。QR CR-0001、OpenAPI/DDL未決は確定扱いせず |
| 用語/ID | 要件ID・主要用語を維持。要件ID完全索引は基本設計36.3を参照 |
| 金銭 | 台帳を正本、walletは射影、返金別取引、Hold分離、同一Tx/冪等/結果不明を記述 |
| DB/API | 物理表・型・制約案と代表JSONを提示。最終DDL/OpenAPI一致は未検証・未作成 |
| 状態/権限 | 主要状態機械とサーバー側認可・権限解除raceを記述。membership等一部enumは未決として残す |
| セキュリティ/運用 | IDOR、CSRF、XSS、SQLi、SSRF、秘密ログ、CSV/画像制御、試験観点を記載。監査未実施 |

次工程では、(1) U-01～U-20の担当と決定日を記録、(2) OpenAPI YAMLを作成して全API request/response・HTTP mapping・validationを唯一の契約化、(3) PostgreSQL DDL/migrationと台帳遅延制約・複合FKをレビュー、(4) 各金銭Txの統合/競合/結果不明試験を受入IDへ対応、(5) QRレビュー差分を正本要件へ反映または不採用決定、(6) 実測・法務・セキュリティ公開gateを別証跡で完了する。基本設計書は本作業で変更していない。
