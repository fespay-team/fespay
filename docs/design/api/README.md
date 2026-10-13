# API契約

| 項目 | 内容 |
| --- | --- |
| 文書ID / 状態 | EPP-API-001 / 設計採択済み（PR #8、v0.4） |
| 担当 / レビュー者 | natuki53 / marron46（GitHubレビュー） |
| 更新日 | 2026-10-13 |
| 関連要件 / 受入試験 | ACC/JOIN/EVT/CFG/STF/ROL、MNY/WAL/TX/LED、CHG/PAY/TRF/CSH/REF/EXP、PRD/INV/ORD/RPT、SEC/PRV/API/DAT、GOV/LEG/REL / operationごとのIDはOpenAPI、対応表はcoverage.md |
| Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [PR #8（承認・マージ済み）](https://github.com/fespay-team/fespay/pull/8) / [ADR-0002](../../adr/0002-refund-api-workflows.md)、[ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)、[ADR-0004](../../adr/0004-api-client-recovery-and-wire-contracts.md)（採択済み） |

## 目的・成果物

DB設計と並行し、FEとBEが共有するHTTP契約を作成する。[要件v0.2](../../requirements/event_payment_requirements.md)、[基本設計第14章](../basic-design.md)、[詳細設計](../detailed-design.md)を基準に、全58論理API IDを171 HTTP操作へ具体化した。認証・管理・チャージ・決済・譲渡・払戻し/返金・商品/注文・集計の初稿に加え、入力・旧画面・認証/通知の復帰・CSVの表示/配信手順を記述した。PR #8で公開契約とADR-0002～0004を採択し、PR #9でDBの保存モデルを採択した。要件変更や実装完成を意味しない。

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

HTTPフィールドの正本はOpenAPI。DBの保存モデル・制約は[DB設計](../database/README.md)を参照する。OpenAPIの版名0.4.0-draftは承認された原文のまま保持し、運用APIのリリース版と区別する。client-policyの配信設定や列・画面復帰の公開契約はDB完成前にレビューできる。

## 設計段階と検証

全領域の公開API案は作成済み。62のキー付きコマンドは元operationIdとキーで結果照会できる。秘密を発行する認証/QR/招待/受取操作は単回消費/再発行の別契約。Q02/O01は共通確定で二重決済を防ぐ設計とした。新規処理の必須更新で、元キーの結果照会や開始済み現金処理の完了を止めない。

378件のサンプル/異常入力/状態ケースと、69件の入力/互換性/集計期間/CSV参照ケースを確認する。全ローカル参照/パラメータ/要件・AT ID/文書リンク、58論理IDと62キー操作の照会網羅も静的確認する。[権利留保表示](../../../LICENSE)とOpenAPIの公開条件を統一し、[専用検証](validation/README.md)でGoogle callbackの302/Location/no-store、OAuth queryとSSEの型参照を認識する。Redoclyはエラー0・警告0・無視0。13件の故意に壊した仕様の検出も確認する。

業務APIの実装受入は未実施。認可、実残高、同時実行、切断、認証基盤統合、実機、性能は別工程。[開発計画](../../project/development-plan.md)で担当割当・認証統合・業務実装/workerの残件を管理する。DB設計の制約104件合格と実handlerのAT合格を区別する。

承認記録：2026-10-13、marron46がPR #8の52ef2d4を承認し、ユーザーのマージ指示によりmainへ取り込み。実装受入は別工程。後続はIssue #11～14へ引き継ぐ。
