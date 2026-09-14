# GitHub Organization・リポジトリ設定

## 現在の状態

確認日：2026-09-14。

- Organization：[fespay-team](https://github.com/fespay-team)。作成済み、GitHub Free。
- リポジトリ：[fespay-team/fespay](https://github.com/fespay-team/fespay)。Private、既定ブランチ `main`。
- ローカル：Gitを初期化し、`origin` を上記リポジトリに設定。文書一式をpush済み。
- 設定：Issues有効、Wiki無効、Squash mergeのみ有効、マージ後の作業ブランチ自動削除。
- 登録連絡先：ユーザー指定済み。実値は本書に記録しない。
- チーム・メンバー招待：未設定。担当者のGitHubアカウントが確定したら割り当てる。
- CODEOWNERS・ブランチ保護：Freeのprivateでは利用対象外。以下のレビュー運用を適用する。
- CI：未導入。今回はドキュメントとリポジトリの準備まで。

## Organizationを使う理由

個人から独立した所有先を用意し、メンバーの参加・離脱とチーム単位の権限を管理します。
現在はGitHub Freeを利用しています。有料プランへの変更は未実施です。
Organization作成では名称・連絡先・所有主体などを確認し、登録画面で設定します。

## 設定・運用方針

| 項目 | 設定・方針 |
| --- | --- |
| 所有者 | まず作成者。引継ぎ用の2人目はメンバー確定後に選定 |
| Repository visibility | Private |
| Default branch | `main` |
| 開発メンバー | チーム単位でWrite、運用担当に必要なMaintain権限 |
| マージ方法 | Squash merge、マージ後のブランチ自動削除 |
| レビュー | 作者以外の最低1人。金銭・認証認可は別のBE担当 |
| Issues | 有効。テンプレートを利用 |
| Wiki | 無効。文書の正本は `docs/` |
| Projects | 未作成。Backlog / Ready / In progress / In review / Doneを推奨 |

## 無料プランでの運用

2026-09-14のGitHub公式仕様では、GitHub Freeのprivateリポジトリではブランチ保護・rulesetsによる強制は利用できません。
FreeのprivateではCODEOWNERS・Draft PRも利用対象外です。作業途中のPRは `[WIP]` を明示します。
無料のまま始める場合はPR・相互レビュー・mainへの直接pushを避ける合意で運用し、強制済みと表現しません。
保護のために勝手にpublicへ変更したり、有料プランへ切り替えたりはしません。

利用可能なプランになったら、mainへのPR必須、1人以上の承認、古い承認の無効化、
会話の解決、force push・削除禁止を設定します。CI必須化は該当チェックが実際に動いた後に行います。

`.github/CODEOWNERS.example` は無効な参考ファイルです。
実在するOrganization・チームのハンドルに置換し、権限とプランを確認した後に `CODEOWNERS` として有効化します。

## 初期公開後に確認すること

- [x] 作成先、private、default branchが正しい
- [x] 初期文書一式をpushし、リモートのmainへの反映を確認した
- [ ] チームと実メンバーに適切な権限がある
- [ ] 新しい参加者がcloneして要件・設計文書を読める
- [x] IssueとPRのテンプレートをリモートのmainに配置した
- [x] プランで利用できる保護機能を確認し、有効・未設定を記録した

## 公式資料

- [Organizationの概要](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations)
- [Organizationの新規作成](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
- [ブランチ保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
