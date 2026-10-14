# DB・台帳設計のレビュー確認票

状態：設計資料の承認・マージ済み。作業者：natuki53。レビュー依頼先：fespay-team/developers。更新日：2026-10-13。
関連：[Issue #10](https://github.com/fespay-team/fespay/issues/10)、[DB PR #9](https://github.com/fespay-team/fespay/pull/9)、[API PR #8](https://github.com/fespay-team/fespay/pull/8)。

## 今回の承認対象

承認済み要件v0.2 / CR-0001を基準に、API参照版 `120efcdc652d687534d2ced955625d6ac39147ee`（v0.4、171操作）へ対応する55表の保存モデルと制約、台帳・排他方針をレビューする。設計用SQLはその不変条件を検証する資料として扱う。

API PR #8も2026-10-13に承認・マージ済み。API契約と保存モデルをそれぞれのPRで採択した。参照版が変わる場合は対応表・検証を同じ変更で更新する。運用migrationへの昇格は認証基盤・handler・復旧手順の統合検証後に行う。

## 読む順序と確認事項

チェック欄は設計PR時のレビュアー確認観点として保持する。最終head 8fe36ccへのmarron46・popoten0630-devのAPPROVEDとマージは確認済みだが、個別欄のチェック結果は承認本文にないため作業者が推測して付けない。採否の記録は[共通記録](../../project/design-status.md)。作業者による検証合格とは分ける。レビューコメントまたは承認本文に確認結果を記録し、指摘があれば修正後のheadで再確認する。

| 確認 | 資料・判断する内容 | 検証との対応 |
| --- | --- | --- |
| [ ] 基準・責務 | [設計方針](design.md)：承認済み要件とAPI案の区別、詳細設計7章を起点とする追加モデル、認証基盤と業務DBの境界 | [参照版](validation/api-reference.json)と全171操作の静的照合 |
| [ ] 永続化・公開値 | [API対応](api-mapping.md)、[物理スキーマ](physical-schema.md)、[ER図](er-diagram.md)：全operationの保存先/導出元、型・enum・所属FK・自然一意 | 55表・全列・enum・リンクの静的照合 |
| [ ] 台帳・冪等・排他 | [台帳](ledger.md)：3区分、元区分への解放、均衡、不変履歴、別キーの二重効果、共通ロック順 | 通常app権限の制約試験、在庫戻しの2接続競合 |
| [ ] 訂正・連絡先・注文 | [設計方針](design.md)と[SQL](sql/initial-schema-draft.sql)：返却4状態と解決証跡、tokenとメール所有確認、注文の店舗/支払者、同値在庫訂正 | 追加40ケース（状態・本人/用途/期限・注文成立・delta=0） |
| [ ] 保管・集計・配信 | [設計方針](design.md)：個人情報30日と金銭履歴7年の分離、CSV snapshot/parts/slots、Outbox/SSEの位置 | DDL・保存先を確認。実worker/保持値/負荷の実証は下表の別工程 |
| [ ] 受入境界 | [検証手順](validation/README.md)、[検証証跡](validation/review-evidence.json)：実施条件・結果と未実施項目が一致し、制約試験をAT合格へ読み替えていない | SQL・検証器のSHA-256と実施した各ケースを記録 |

関連要件：LED-01～06、WAL-01～03、TX-01～06、DAT-01～03、PAY-B04、CSH-01～07、REF-01～04、INV-01～05、ORD-01～06、PRV-03～05。
対応受入：AT-021～024、AT-026～048、AT-049～058、AT-063。実装受入の合格記録は今回追加しない。

## 実装・運用へ持ち越す項目

以下はDB設計PRの検証済み範囲に含めない。全担当枠と決定窓口はnatuki53に割当済み（PR #17）。期限・依存・必要な証跡は[決定管理表](../../team/decisions.md)、部分実装は[採択・進捗記録](../../project/design-status.md)。

| 工程・担当枠 | 残る判断・検証 |
| --- | --- |
| API / FE / BE / DB | API #8/DB #9の採択と総合設計側の参照同期は完了。今後の契約変更で双方の参照版・検証を同じPRで更新する |
| BE / 認証基盤 | PR #15で固定版、PR #19/#23で本人session/認証手段一覧を部分実証。全業務の現在認可/MFA、本人承認、メール配送・所有確認はIssue #13に残る |
| BE / DB | 実handlerの同キー復帰、別キー競合・全取消・返金先選択、現金事実と調査resolve後のcommand。DB単体では現物授受を証明しない |
| BE / 運用 | CSV物化・配信worker、SSE replayの保持値と安全な再開、個人情報削除/失効の再適用 |
| DB / 環境 / 運用 | 運用migration/rollback、実データ移行、性能/実機/復旧、通常appロールの権限設定と監視 |

## GitHub上の承認条件

2026-10-09の確認では、PR #9はmainと競合せず、未解決レビュースレッドは0件。developersチームにレビュー依頼済み。mainは作者以外の承認1件と最終push者以外の承認を要求し、追加pushで古い承認を取り消す設定。台帳・金銭処理を含むため、[開発ガイド](../../../CONTRIBUTING.md)に従いバックエンド担当がレビューする。

この文書のチェックを付けるだけでGitHubの承認にはならない。承認者・日時・対象headはGitHubのレビュー記録で確定する。設計PR時点の証拠はローカル検証。開発基盤PR #15でCI workflowを追加し、3OSと設計/DB/auth統合が成功した。mainの必須status check指定は別の設定であり、この変更では追加していない。設定やheadが変わった場合は承認前に再確認する。

2026-10-13の最終記録：API #8はmarron46が52ef2d4を承認、DB #9はmarron46・popoten0630-devが8fe36ccを承認。双方Squash merge済み（API 120efcd、DB 9d54a2b）。上表は確認観点として残し、個別チェック欄を作業者が代わりに承認しない。後続実装は[開発計画](../../project/development-plan.md)へ引き継ぐ。
