# API契約

| 項目 | 内容 |
| --- | --- |
| 文書ID / 状態 | EPP-API-001 / 下書き（v0.4、DBに依存しない公開契約を具体化・レビュー前） |
| 担当 / レビュー者 | natuki53 / FE・BE・DB担当（未割当） |
| 更新日 | 2026-10-09 |
| 関連要件 / 受入試験 | ACC/JOIN/EVT/CFG/STF/ROL、MNY/WAL/TX/LED、CHG/PAY/TRF/CSH/REF/EXP、PRD/INV/ORD/RPT、SEC/PRV/API/DAT、GOV/LEG/REL / operationごとのIDはOpenAPI、対応表はcoverage.md |
| Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) / [ADR-0002](../../adr/0002-refund-api-workflows.md)、[ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)、[ADR-0004](../../adr/0004-api-client-recovery-and-wire-contracts.md)（提案） |

## 目的・成果物

DB設計と並行し、FEとBEが共有するHTTP契約を作成する。[要件v0.2](../../requirements/event_payment_requirements.md)、[基本設計第14章](../basic-design.md)、[詳細設計](../detailed-design.md)を基準に、全58論理API IDを171 HTTP操作へ具体化した。認証・管理・チャージ・決済・譲渡・払戻し/返金・商品/注文・集計の初稿に加え、入力・旧画面・認証/通知の復帰・CSVの表示/配信手順を記述した。追加判断はレビュー案で、要件やADRの承認・実装完成を意味しない。

| ファイル | 内容 |
| --- | --- |
| [openapi.yaml](openapi.yaml) | 入力/応答・権限・状態・キー・エラー、171操作/244スキーマ |
| [coverage.md](coverage.md) | 全58論理ID→operationId索引、API側で具体化した範囲と共同レビュー残件 |
| [conventions.md](conventions.md) | Cookie/CSRF、金額、版、GLOBAL/EVENTキー、結果復帰、ページング |
| [http-contract.md](http-contract.md) | JSON/multipart/画像入力上限、54コードと画面動作、旧画面のREAD/RECOVERY/CURRENT |
| [client-flows.md](client-flows.md) | Google開始/戻り・login challenge、SSE/GET世代・poll、結果不明/現金処理中の更新待機 |
| [csv-contract.md](csv-contract.md) | 集計基準/内訳、CSV列版/順序/数式対策、snapshot/期限、空結果/分割/partページング/配信 |
| [authentication.md](authentication.md) | メール/Google・MFA、イベント/参加/設定、招待/権限/owner交代、停止/完了 |
| [payments-and-cash.md](payments-and-cash.md) | A/B/C共通決済、チャージ、譲渡、訂正、現金調査/返却/実査、失効 |
| [refunds.md](refunds.md) | 未使用チャージの現金払戻しと、店舗決済の購入返金 |
| [products-orders-reports.md](products-orders-reports.md) | 商品/在庫戻し/画像、cart/注文/受取/取消、集計/CSV/照合 |
| [events.md](events.md) | SSE通知型、現在認可、再接続/正本取得 |
| [db-handoff.md](db-handoff.md) | DB担当へ渡す不変条件・自然一意・型/Tx/保管境界 |
| [validation](validation/README.md) | 形式/状態・入力/互換性/CSV参照手順・lint・論理ID/キー照会の再実行 |

HTTPフィールドの正本候補はOpenAPI。DBのテーブル/索引/DDLはDB担当の成果物を正本とし、この作業では変更しない。client-policyの配信設定や列・画面復帰の公開契約はDB完成前にレビューできる。

## 設計段階と検証

全領域の公開API案は作成済み。62のキー付きコマンドは元operationIdとキーで結果照会できる。秘密を発行する認証/QR/招待/受取操作は単回消費/再発行の別契約。Q02/O01は共通確定で二重決済を防ぐ設計とした。新規処理の必須更新で、元キーの結果照会や開始済み現金処理の完了を止めない。

378件のサンプル/異常入力/状態ケースと、69件の入力/互換性/集計期間/CSV参照ケースを確認する。全ローカル参照/パラメータ/要件・AT ID/文書リンク、58論理IDと62キー操作の照会網羅も静的確認する。[権利留保表示](../../../LICENSE)とOpenAPIの公開条件を統一し、[専用検証](validation/README.md)でGoogle callbackの302/Location/no-store、OAuth queryとSSEの型参照を認識する。Redoclyはエラー0・警告0・無視0。13件の故意に壊した仕様の検出も確認する。

実アプリ/DBは未実装。認可、実残高、同時実行、切断、認証基盤統合、実機、性能の受入試験は未実施。FE/BEの契約レビュー・具体値の採択、DB型/enum/GLOBALキー/ロック/snapshot/Outboxの共同調整、BE/環境の統合試験は[残件表](coverage.md)で区別している。担当間レビューとADR採択を得て契約を確定する。

承認者・日付・PR：未記入。Issue #7/PR #8はレビュー前のまま。
