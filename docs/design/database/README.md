# DB・台帳設計

状態：レビュー案。担当：DB担当（実名未割当）。更新日：2026-10-09。
[DB PR #9](https://github.com/fespay-team/fespay/pull/9)で管理する。基準は[現行要件v0.2](../../requirements/event_payment_requirements.md)、承認済み[CR-0001](../../requirements/changes.md)、[詳細設計](../detailed-design.md)。API参照は[PR #8](https://github.com/fespay-team/fespay/pull/8)の `52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32`、v0.4・171操作。APIと追加物理モデルは採択前の案で、main承認済み仕様と区別する。

| 資料 | 内容 |
| --- | --- |
| [設計方針](design.md) | 責務・参照版・既存案との差分・残件 |
| [ER図](er-diagram.md) | 物理モデル候補の親子関係 |
| [物理スキーマ](physical-schema.md) | 全列・型、JSON/外部認証境界、制約 |
| [台帳](ledger.md) | 勘定・3区分・復元・不変条件・排他 |
| [API対応](api-mapping.md) | 全operationの保存先・Tx・自然一意 |
| [設計用SQL](sql/initial-schema-draft.sql) | PostgreSQL 16+で制約を実証する新規スキーマ案 |
| [検証](validation/README.md) | 実DB境界/競合と参照版の静的検証 |

旧 `docs/design/db-*.md` の本文をここへ移した。実行用migrationは将来リポジトリ直下の `database/migrations/` に置く。現SQLは設計用であり、認証基盤の固定版・担当間採択・実handler/復旧/移行を確定してからmigrationへ昇格する。設計用と実行用のSQLを二重管理しない。

API本文は[52ef2d4のOpenAPI](https://github.com/fespay-team/fespay/blob/52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32/docs/design/api/openapi.yaml)を参照し、別ブランチの全文をコピーしない。参照版の更新は対応表と検証を同じPRで更新する。

承認者・日付：未記入。運用DB適用・受入試験・性能・法的公開判断：未実施。
