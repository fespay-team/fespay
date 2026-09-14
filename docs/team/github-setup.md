# GitHub Organization・リポジトリ設定

## 現在の状態

- ローカル：リポジトリの初期構成を準備。
- 所有先：FesPay用Organizationを新設する方針。
- Organization名：`fespay-team`（ユーザー指定）。希望の `fespay` は既存アカウントが使用中。
- リポジトリ名：`fespay`。公開範囲はprivateを初期案とする。
- GitHub上のOrganization・リポジトリ：未作成、push未実施。無料プランの登録画面まで準備済み。
- 登録待ち：GitHubのContact emailは必須。ユーザー指定は空欄のため、使用する連絡先の指定待ち。
- チーム、メンバー招待、CODEOWNERS、ブランチ保護、CI：未設定。

## Organizationを使う理由

個人から独立した所有先を用意し、メンバーの参加・離脱とチーム単位の権限を管理します。
無料のGitHub Freeを初期候補とし、有料プランは自動契約しません。
Organization作成では名称・連絡先・所有主体などを確認し、登録画面で設定します。

## 設定案

| 項目 | 設定案 |
| --- | --- |
| 所有者 | まず作成者。引継ぎ用の2人目はメンバー確定後に選定 |
| Repository visibility | Private |
| Default branch | `main` |
| 開発メンバー | チーム単位でWrite、運用担当に必要なMaintain権限 |
| マージ方法 | Squash merge、マージ後のブランチ自動削除 |
| レビュー | 作者以外の最低1人。金銭・認証認可は別のBE担当 |
| Issues | 有効。テンプレートを利用 |
| Wiki | 無効。文書の正本は `docs/` |
| Projects | Backlog / Ready / In progress / In review / Done |

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

- [ ] 作成先、private、default branchが正しい
- [ ] ローカルとリモートのコミットが一致する
- [ ] チームと実メンバーに適切な権限がある
- [ ] 新しい参加者がcloneして要件・設計文書を読める
- [ ] IssueとPRのテンプレートが表示される
- [ ] プランで利用できる保護機能を確認し、有効・未設定を記録した

## 公式資料

- [Organizationの概要](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations)
- [Organizationの新規作成](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
- [ブランチ保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
