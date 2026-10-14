# 設計採択後の開発計画

更新日：2026-10-14。実装はFE-1=popoten0630-dev、FE-2=KawataKenshirou、BE-1（金銭/台帳）=marron46、BE-2（認証/認可と関連業務API）=yamadahanako2へ分担する。DB/運用/総合の調整窓口はnatuki53。[担当表](../team/ownership.md)と[担当変更 #36](https://github.com/fespay-team/fespay/issues/36)を参照する。

採択と現在の工程は[共通記録](design-status.md)。主要設計は採択済み、基盤/認証は部分実装済みで、全機能の受入/公開は残る。

## 採択記録

| 対象 | 承認 | mainへの反映 |
| --- | --- | --- |
| API / ADR-0002～0004 | marron46、2026-10-13、52ef2d4 | [PR #8](https://github.com/fespay-team/fespay/pull/8)、120efcdc652d687534d2ced955625d6ac39147ee |
| DB / 台帳 / 保存モデル | marron46・popoten0630-dev、2026-10-13、8fe36cc | [PR #9](https://github.com/fespay-team/fespay/pull/9)、9d54a2bba1f2896a492dc7374ecc64e58d232db4 |
| 担当 / 未決事項の決定管理 | popoten0630-dev、2026-10-14、7dc1858 | [PR #17](https://github.com/fespay-team/fespay/pull/17)、7e1055a2c1ef666cd81607d66e70083fb5fc385e |
| 認証文脈 / 本人セッションAPI | popoten0630-dev、2026-10-14、cf08525 | [PR #19](https://github.com/fespay-team/fespay/pull/19)、309703c37ac175f2b64bea5df7456fc44487fd01 |
| 本人の認証手段一覧 | marron46、2026-10-14、aef930d | [PR #23](https://github.com/fespay-team/fespay/pull/23)、17a2186e9e89c2c6904d21058266005e29a64c66 |

GitHubアカウントからFE/BEの役割を推定しない。設計採択、実装準備案、実装受入合格を区別する。OpenAPIの0.4.0-draftは採択した原文の版名として保持する。

## タスクと担当

| Issue | 完了条件 / 現在の状態 | 担当 |
| --- | --- | --- |
| [#11 開発基盤](https://github.com/fespay-team/fespay/issues/11) | 承認記録同期、固定workspace、起動/型/build、開発migration、認証の隔離DB検証、CI、PRレビュー。PR #15で完了 | natuki53 |
| [#12 担当・未決割当](https://github.com/fespay-team/fespay/issues/12) | FE/BE/DB個人割当、相互レビュー、U-01～U-20の責任者・期限・依存。割当はPR #17で完了 | natuki53（準備時点の兼任記録）、[決定管理表](../team/decisions.md) |
| [#13 認証統合](https://github.com/fespay-team/fespay/issues/13) | /v1/authアダプター、業務MFA/CSRF/Origin、実メール/Google、因子/退会・失効の受入検証 | yamadahanako2（BE-2）、認証画面はpopoten0630-dev（#28） |
| [#14 業務・worker](https://github.com/fespay-team/fespay/issues/14) | 金銭・注文・在庫の小さな実装PR、並行/再送/切断、CSV/SSE、移行/性能/復旧 | marron46（BE-1）、関連領域は#28～#32の担当へ分担 |

未決事項を設計採択だけで消さない。U-03の公開契約、U-04/U-18/U-20の保存モデル/制約は採択済み。UUID生成方式・分離レベル/負荷・現金運用・worker保持値・クラウド/鍵・実機・法務/公開条件は責任者の決定・実証を残す。#12 / PR #17で全責任者をnatuki53へ割当済み。基盤の採択記録は[ADR-0005](../adr/0005-development-foundation.md)。

## 着手順

1. #11の開発基盤と#12の担当・期限は承認・マージ済み。
2. #13の認証アダプターを先行する。#16の文脈/session APIと[#21 本人の認証手段一覧](https://github.com/fespay-team/fespay/issues/21)はマージ・完了済み。次の実装は公開メール登録と業務accountの作成/関連付けを小さなPRへ分ける。公開登録/login・追加/解除・実メール/Google・MFA/退会・実ブラウザーの受入は残る。
3. #14をチャージ、決済、譲渡、払戻し/返金、訂正、注文/在庫、配信へ分割する。台帳・残高・監査・Outboxを同一Txへ含める。
4. 運用migration昇格、復旧/性能/実機・公開gateを実施する。

DB制約104件、API契約378件/参照69件の検証をAT-001～070の実装受入へ読み替えない。運用DBや実金銭公開は今回の準備対象外。

2026-10-14、[PR #15](https://github.com/fespay-team/fespay/pull/15)をKawataKenshirouの最終head承認後にマージし、Issue #11を完了。認証の部分実装は[Issue #16](https://github.com/fespay-team/fespay/issues/16) / PR #19とIssue #21 / PR #23で完了。親#13/#14は残る全条件が揃うまでOPENとし、子Issueの部分完了だけで閉じない。

画面プロトタイプはIssue #18/#24、PR #20/#25でレビュー・統合待ち。認証画面は#28、参加者画面は#29、管理画面は#30、イベント/参加/権限は#31、商品/在庫/注文/集計/CSVは#32へ分割済み。ATの管理窓口/計画参照だけで実装タスクが完了したと扱わない。今回の変更は担当記録の更新で、実装・試験の完了状態は変更しない。
