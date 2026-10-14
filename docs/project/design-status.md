# 設計採択と実装進捗の記録

照合日：2026-10-14（Asia/Tokyo）。記録担当：natuki53。GitHubの最終headへのAPPROVED、MERGED、main上のマージcommitを照合した。過去headへのDISMISSEDやCOMMENTEDを最終承認者へ含めない。

## 工程の位置

基本・詳細設計、API・DBの主要設計は採択済みで、実装を進める基準がある。現行要件はEPP-REQ-001 v0.2。要件/HTTP/保存モデルの正本は各文書で保持し、採択の記録を理由に本文の仕様を変えない。

開発基盤と認証の5経路は実装・レビュー・マージ済み。公開登録/login、実メール/Google、MFA成立/回復、認証手段追加/解除、退会、金銭/注文/worker/画面統合は未完了。設計採択、部分実装、AT全体の合格、運用公開をそれぞれ記録する。

## 承認とmainへの反映

承認者は各PRの最終headに対するもの。日付はマージ日（JST）。基本設計の初稿はPR #3、CR-0001の要件反映はPR #5、詳細設計/レビュー修正はPR #6、具体的なAPI/DBの採択はPR #8/#9に記録されている。

| 対象 | PR | 最終headの承認者 | 承認対象head | マージ日 / main commit |
| --- | --- | --- | --- | --- |
| 基本設計 | [#3](https://github.com/fespay-team/fespay/pull/3) | natuki53, yamadahanako2 | 5c98656 | 2026-09-30 / 7612c64 |
| CR-0001と現行要件v0.2 | [#5](https://github.com/fespay-team/fespay/pull/5) | marron46, KawataKenshirou, popoten0630-dev | f1f6ce4 | 2026-10-01 / e42b564 |
| 詳細設計と基本設計のレビュー修正 | [#6](https://github.com/fespay-team/fespay/pull/6) | KawataKenshirou, popoten0630-dev | 5a726ef | 2026-10-09 / 789a76b |
| API契約 / ADR-0002～0004 | [#8](https://github.com/fespay-team/fespay/pull/8) | marron46 | 52ef2d4 | 2026-10-13 / 120efcd |
| DB・台帳・API対応 | [#9](https://github.com/fespay-team/fespay/pull/9) | popoten0630-dev, marron46 | 8fe36cc | 2026-10-13 / 9d54a2b |
| 開発基盤 / ADR-0005 | [#15](https://github.com/fespay-team/fespay/pull/15) | KawataKenshirou | 3cbd03c | 2026-10-14 / 375b56d |
| 担当・未決事項の決定管理 | [#17](https://github.com/fespay-team/fespay/pull/17) | popoten0630-dev | 7dc1858 | 2026-10-14 / 7e1055a |
| 認証文脈・本人セッションAPI | [#19](https://github.com/fespay-team/fespay/pull/19) | popoten0630-dev | cf08525 | 2026-10-14 / 309703c |
| API資料のディレクトリ整理 | [#22](https://github.com/fespay-team/fespay/pull/22) | popoten0630-dev, marron46 | 7ce9c10 | 2026-10-14 / 445d7ba |
| 本人の認証手段一覧 | [#23](https://github.com/fespay-team/fespay/pull/23) | marron46 | aef930d | 2026-10-14 / 17a2186 |

PR #23はディレクトリ整理後のaef930dへのmarron46再承認を採用した。更新前のd6e1777への3件の承認はDISMISSEDであり、最新headの承認には数えない。ADR-0001は初期構成へ適用済みだがPR #1に個別APPROVEDの記録がない。実workspace/固定runtimeは後続のADR-0005 / PR #15で採択済み。

## 完了と残件

| 項目 | 現在の状態 | 依存・証跡 |
| --- | --- | --- |
| API/DB設計 | 採択・マージ済み | Issue #7/#10、PR #8/#9 |
| 開発基盤 | 完了 | Issue #11、[基盤検証](../testing/development-foundation.md)、PR #15 |
| 担当・未決事項の責任者 | 割当完了 | Issue #12、[担当表](../team/ownership.md)、[決定管理表](../team/decisions.md)、PR #17 |
| 認証文脈・本人session | 部分実装完了 | Issue #16、[検証](../testing/auth-session-adapter.md)、PR #19 |
| 本人の認証手段一覧 | 部分実装完了 | Issue #21、[検証](../testing/auth-identity-list.md)、PR #23 |
| 公開登録/login・実メール/Google・MFA/回復・追加/解除・退会 | 未完了 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) |
| 金銭・注文・在庫・CSV/SSE worker、性能/復旧/運用昇格 | 未完了 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) |
| 画面プロトタイプの資料/ソース移行 | レビュー・統合待ち | Issue #18 / PR #20、Issue #24 / PR #25（照合時点でOPEN）。画面の採択・実API接続とは別 |
| AT-001～070 | 全条件の受入判定は未実施。部分検証の証跡あり | [受入管理表](../testing/acceptance-status.md) |
| U-01～U-20 / G1～G5 | 決定済み事項と残る判断・実証を区別 | [決定管理表](../team/decisions.md)、[公開前ゲート](README.md#公開前ゲート) |

現行の実装5経路はgetAuthContext / getMySession / listMySessions / revokeMySessions / listMyIdentities。内蔵認証handlerを使ったfixtureの登録/loginを公開APIの合格に数えない。設計検証171操作/schema378件/wire69件、DB制約104件と、通常8件/DB統合34件/実応答83件は、各対象範囲の証跡である。AT全体や実機・性能・法務/運営の完了へ読み替えない。

## 次工程への引継ぎ

[開発計画](development-plan.md)を参照する。準備時点のnatuki53全枠兼任から実装チームへ分担済み。FEはpopoten0630-dev/KawataKenshirou、金銭/台帳はmarron46（#14）、認証/認可・イベント/商品/注文/CSVはyamadahanako2（#13/#31/#32）が担当し、作者以外の担当者が相互レビューする。DB/運用/総合・受入管理の窓口はnatuki53。[担当表](../team/ownership.md)と[担当変更 #36](https://github.com/fespay-team/fespay/issues/36)を参照する。まず公開メール登録と業務accountの作成/関連付けを小さなPRへ分け、確認/login・配送・画面の統合へ進む。金銭APIの公開前に現在認可と業務MFAの成立/確認を満たす。

今回の整理は承認・担当・進捗の記録同期で、残る設定/値/外部合意の決定や新しい実装を行ったものではない。今後の採択変更は別PR/ADR、要件変更はCR手順で扱う。ローカルoutputs内のWBSは共有版を確認せずに移動・更新しない。
