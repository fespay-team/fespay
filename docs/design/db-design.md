# FesPay DB設計（レビュー案）

## 文書状態と根拠

本書はEPP-DES-001（基本設計v0.2レビュー案）とEPP-DES-002（詳細設計v0.1下書き）を根拠にした設計案であり、承認済み仕様ではない。特に詳細設計7章の物理表30件は「詳細設計上の補完案」と明記されている。現行要件書を基準とし、CR-0001は未承認として採用していない。

| 区分 | 内容 |
|---|---|
| 確定仕様 | PostgreSQL、UUID内部ID、UTC `timestamptz`、JPY整数金額 `NUMERIC(30,0)`、金銭・台帳・残高射影・監査・Outboxを同一DBトランザクションに含める。成立取引/台帳/監査は追記専用。 |
| 設計上の提案 | 詳細設計7章の30表・列・索引案を初期物理モデルとして採用。event複合FK、行ロック、冪等一意制約、遅延仕訳均衡検査を採用候補とする。 |
| 要確認 | U-04/U-18/U-20等の物理ER・勘定科目・UUID生成・分離レベル・状態語彙・トリガー実装、OpenAPI/API正本、認証DB所有境界、マイグレーション方式。 |

## 調査結果

指定の `docs/design/api-design.md` は存在しない。`docs/design/api/README.md` は `openapi.yaml` を将来のAPI契約正本とするが、ファイルは未作成。APIの参照可能な仕様は `basic-design.md` 14.2の論理API一覧と `detailed-design.md` 11章のAPI群要約である。第7章には物理表30件が記載されている。既存ER図、DDL、マイグレーション、DB接続設定、ORM/DBアクセスライブラリは見つからず、実DBMSのバージョンも未指定。基本設計はPostgreSQL採用を規定するが、実装バージョンは確定していない。

## テーブルと設計方針

30表の全列・型案は[テーブル定義書](db-table-definitions.md)、関係は[ER図](db-er-diagram.md)、API対応とTx境界は[API/DB対応表](db-api-mapping.md)を参照。

UUIDは内部主キー。生成方式は未決。全event子表にevent_idを置き、複合FKで別イベントへの参照を防ぐ。event/shopなど親子所属はアプリケーション認可とDB制約の両方で確認する。削除は原則RESTRICT、金銭・監査・履歴データは物理削除しない。共通日時はUTC `timestamptz`。金額は通貨JPYの整数円で、小数・丸めを許さない。

### 金銭・在庫の整合性

Transactionは不変の業務取引、Ledger Entryは符号付き仕訳、Walletは台帳から再構築可能な残高射影とする。取引・最低2件の仕訳・wallet更新・業務データ・監査・Outboxを同じトランザクションで確定する。仕訳合計ゼロは行単位CHECKでは保証できないため、遅延constraint trigger等のDB機構が必要。ただしPostgreSQL実機で実装・並行Tx・復元検証は未実施である。

残高変更はwallet行をロックし、利用可能残高を条件付きで検査する。決済要求、元取引、返金明細、在庫予約も固定順にロックし、冪等キー一意制約と状態条件付き更新で二重実行を防ぐ。返金累計額・数量は元取引/order lineのロック下で評価する。予約在庫は `0 <= reserved <= on_hand`、決済・予約失効はreservation行ロックで直列化する。現金受渡しとDB commitは原子的にできないため、現金事実の記録、照合、cash caseで差異を処理する。

### インデックス・制約方針

詳細設計7章に明記された一意制約・検索索引を基準にする。全event関連FKにイベント境界を含める複合キーを追加提案する。部分インデックスは実際のAPI検索条件（未処理Outbox、期限切れ予約等）をOpenAPI確定後に検討し、先行して増やさない。JSONB検索用GINは検索仕様がないため追加しない。

### 未決事項と影響

| 項目 | 必要性・影響 | 推奨/代替案 |
|---|---|---|
| API/OpenAPI未作成 | 正確な全endpoint、request/response、filter/pagination、列利用、HTTP競合仕様の照合が未完了。 | OpenAPIを先に正本化。暫定では基本設計14.2の論理IDを追跡。 |
| Better Authとaccounts/identities/sessionsの二重管理境界 | 認証基盤が独自テーブルを所有するか不明。二重sessionは失効・認証事故の原因。 | Better Auth管理スキーマを確認し、accountsへの対応付けだけを業務DBで持つ案を推奨。統合/分離案あり。 |
| 複合FK/一部参照列 | 詳細設計は関係を説明するが全複合FK列や参照キーをDDLとして確定していない。 | API契約とERレビュー後に全制約を確定。 |
| ledger勘定科目と残高射影対応 | 残高の正本再構築と均衡検査に必要。誤ると資金残高差異。 | account_code辞書とwallet集計規則をADR/DDLで固定。 |
| 状態CHECK語彙、削除・保持 | membership/shop/register等の状態語彙がU-18で未決。 | OpenAPI・状態遷移承認後にCHECK化。 |
| 移行ツール/DBバージョン | 実装構成・rollback規約を選べない。 | 既存仕組みはなし。導入時にPostgreSQL版とツールを決定。 |

## 成果物と検証状況

今回のDDLは新規DB向けの初期スキーマ案で、既存migrationへの適用変更ではない。運用DBには適用していない。SQL構文、FK、trigger、migration rollback、並行処理の実DB検証も未実施。特に認証表の所有境界と全複合FKはレビュー後の確定が必要。
