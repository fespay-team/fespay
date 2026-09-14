# GitHub Organization・リポジトリ設定

## 現在の状態

確認日：2026-09-14。

- Organization：[fespay-team](https://github.com/fespay-team)。作成済み、GitHub Free。
- リポジトリ：[fespay-team/fespay](https://github.com/fespay-team/fespay)。Public、既定ブランチ `main`。
- ローカル：Gitを初期化し、`origin` を上記リポジトリに設定。文書一式をpush済み。
- 設定：Issues有効、Wiki無効、Squash mergeのみ有効、マージ後の作業ブランチ自動削除。
- 登録連絡先：ユーザー指定済み。実値は本書に記録しない。
- チーム・メンバー招待：未設定。担当者のGitHubアカウントが確定したら割り当てる。
- CODEOWNERS・ブランチ保護：公開化に合わせて有効化。`main` はPRと1名以上の承認を要求する。
- CI：未導入。今回はドキュメントとリポジトリの準備まで。

## Organizationを使う理由

個人から独立した所有先を用意し、メンバーの参加・離脱とチーム単位の権限を管理します。
現在はGitHub Freeを利用しています。有料プランへの変更は未実施です。
Organization作成では名称・連絡先・所有主体などを確認し、登録画面で設定します。

## 設定・運用方針

| 項目 | 設定・方針 |
| --- | --- |
| 所有者 | まず作成者。引継ぎ用の2人目はメンバー確定後に選定 |
| Repository visibility | Public。閲覧・fork・PR作成は公開、直接pushとmergeは権限者のみ |
| Default branch | `main` |
| 開発メンバー | チーム単位でWrite、運用担当に必要なMaintain権限 |
| マージ方法 | Squash merge、マージ後のブランチ自動削除 |
| レビュー | 作者以外の最低1人。金銭・認証認可は別のBE担当 |
| Issues | 有効。テンプレートを利用 |
| Wiki | 無効。文書の正本は `docs/` |
| Projects | 未作成。Backlog / Ready / In progress / In review / Doneを推奨 |

## 無料プランでの運用

2026-09-14にpublicへ変更し、GitHub Freeで利用できるCODEOWNERSとブランチ保護を有効にしました。
外部ユーザーは内容の閲覧、fork、Issue・PRによる提案ができますが、このリポジトリへ直接push・mergeする権限はありません。
公開リポジトリのため閲覧やfork自体は制限できません。提案を受け付ける窓口としてIssuesとPull Requestsは有効にします。

`main` はPR、1名以上の承認、CODEOWNERSの承認、未解決会話の解消を要求し、force pushと削除を禁止します。
管理者は初期整備と緊急対応のため保護を迂回できます。CI必須化は該当チェックが実際に動いた後に行います。

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
