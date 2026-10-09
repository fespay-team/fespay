# API契約

| 項目 | 内容 |
| --- | --- |
| 文書ID / 状態 | EPP-API-001 / 下書き（v0.3、全領域の契約初稿・レビュー前） |
| 担当 / レビュー者 | natuki53 / FE・BE・DB担当（未割当） |
| 更新日 | 2026-10-09 |
| 関連要件 / 受入試験 | ACC/JOIN/EVT/CFG/STF/ROL、MNY/WAL/TX/LED、CHG/PAY/TRF/CSH/REF/EXP、PRD/INV/ORD/RPT、SEC/PRV/API/DAT、GOV/LEG/REL / operationごとのIDはOpenAPI、対応表はcoverage.md |
| Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) / [ADR-0002](../../adr/0002-refund-api-workflows.md)、[ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)（提案） |

## 目的・成果物

DB設計と並行し、FEとBEが共有するHTTP契約を作成する。[要件v0.2](../../requirements/event_payment_requirements.md)、[基本設計第14章](../basic-design.md)、[詳細設計](../detailed-design.md)を基準に、全58論理API IDを168 HTTP操作へ具体化した。共通・照会・返金から、認証・管理・チャージ・決済・譲渡・商品/注文・集計まで初稿が揃った。型/状態/認可/再送の追加判断はレビュー案で、要件やADRの承認・実装完成を意味しない。

| ファイル | 内容 |
| --- | --- |
| [openapi.yaml](openapi.yaml) | 入力/応答・権限・状態・キー・エラー、168操作/234スキーマ |
| [coverage.md](coverage.md) | 全58論理ID→operationId索引、内部worker境界、確定前レビュー項目 |
| [conventions.md](conventions.md) | Cookie/CSRF、金額、版、GLOBAL/EVENTキー、結果復帰、ページング、エラー |
| [authentication.md](authentication.md) | メール/Google・MFA、イベント/参加/設定、招待/権限/owner交代、停止/完了 |
| [payments-and-cash.md](payments-and-cash.md) | A/B/C共通決済、チャージ、譲渡、訂正、現金調査/返却/実査、失効 |
| [refunds.md](refunds.md) | 未使用チャージの現金払戻しと、店舗決済の購入返金 |
| [products-orders-reports.md](products-orders-reports.md) | 商品/在庫戻し/画像、cart/注文/受取/取消、集計/CSV/照合 |
| [events.md](events.md) | SSE通知型、現在認可、再接続/正本取得 |
| [db-handoff.md](db-handoff.md) | DB担当へ渡す不変条件・自然一意・型/Tx/保管境界 |
| [validation](validation/README.md) | 形式/状態境界・参照・論理ID/キー照会網羅の再実行手順 |

HTTPフィールドの正本候補はOpenAPI。DBのテーブル/索引/DDLはDB担当の成果物を正本とし、この作業では変更しない。

## 設計段階と検証

全領域の公開API案は作成済み。62のキー付きコマンドは元operationIdとキーで結果照会できる。秘密を発行する認証/QR/招待/受取操作は単回消費/再発行の別契約。T02汎用金銭操作を専用操作に分解し、Q02/O01の共通確定で二重決済を防ぐ設計とした。

289件のサンプル/異常入力/状態ケース、全ローカル参照/パラメータ/要件・AT ID/文書リンク、58論理IDの対応と62キー操作の照会網羅を静的確認。Redoclyは構造エラー0、既知警告4（ライセンス未選定、302 callbackの2xxなし、SSE拡張参照2件）。

実アプリ/DBは未実装。認可、実残高、同時実行、切断、認証基盤統合、実機、性能の受入試験は未実施。API案とDB型/enum、GLOBALキー、snapshot/Outbox、失効worker認証、具体値の採択は[レビュー項目](coverage.md)を残している。担当間レビューとADR採択を得て契約を確定する。

承認者・日付・PR：未記入。Issue #7/PR #8はレビュー前のまま。
