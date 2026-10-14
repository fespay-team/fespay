# GitHub Organization・リポジトリ設定

## 現在の状態

確認日：2026-10-14。リポジトリ/チーム/ブランチ保護のGitHub APIとCODEOWNERS、PRの承認/CI記録を照合。

- Organization：[fespay-team](https://github.com/fespay-team)。作成済み、GitHub Free。
- リポジトリ：[fespay-team/fespay](https://github.com/fespay-team/fespay)。Public、既定ブランチ `main`。
- ローカル：Gitを初期化し、`origin` を上記リポジトリに設定。文書一式をpush済み。
- 設定：Issues有効、Wiki無効、Squash mergeのみ有効、マージ後の作業ブランチ自動削除。
- 登録連絡先：ユーザー指定済み。実値は本書に記録しない。
- チーム：developersは存在し、このrepoへのWrite権限を確認。担当枠はPR #17でnatuki53へ割当済み。個々の招待の回答状況や全メンバー権限はこの同期で検証していない。
- CODEOWNERS・ブランチ保護：公開化に合わせて有効化。CODEOWNERSはレビュー依頼先の自動選定に使い、`main` はPR作者以外による1名以上の承認を要求する。
- CI：PR #15で導入済み。3OSのworkspaceとLinuxの設計/DB/認証を実行。PR #23マージ後main 17a2186の全4ジョブ成功（[run 38497451389](https://github.com/fespay-team/fespay/actions/runs/38497451389)）。必須status checkの設定は未指定（required_status_checks=null）。

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
| Projects | 初期案では未作成。現状はread:project権限不足で未確認。Backlog / Ready / In progress / In review / Doneを推奨 |

## 無料プランでの運用

2026-09-14にpublicへ変更し、GitHub Freeで利用できるCODEOWNERSとブランチ保護を有効にしました。
外部ユーザーは内容の閲覧、fork、Issue・PRによる提案ができますが、このリポジトリへ直接push・mergeする権限はありません。
公開リポジトリのため閲覧やfork自体は制限できません。提案を受け付ける窓口としてIssuesとPull Requestsは有効にします。

`main` はPR、作者以外による1名以上の承認、最新push者以外の承認、push後の古い承認の無効化、未解決会話の解消を要求し、force pushと削除を禁止します。CODEOWNERSはレビュー依頼を自動化しますが、PR作者が単独のCODEOWNERでも別のWrite権限メンバーの承認で進められるよう、CODEOWNER本人の承認は必須ゲートにしません。
Rulesetにbypass actorはなく、管理者にも保護を適用します。CIは実際に稼働しているが、必須status check指定は未設定。チェック成功を確認してからマージする運用を維持し、この文書同期で保護設定を変更しない。

## 初期公開後に確認すること

- [x] 作成先、Public、default branch=mainを確認
- [x] 初期文書一式をpushし、リモートのmainへの反映を確認した
- [x] developersチームのrepo Writeと担当窓口を確認
- [ ] 個々の招待回答・全メンバーの適切な権限を確認（この同期では未検証）
- [ ] 新しい参加者がcloneして要件・設計文書を読める
- [x] IssueとPRのテンプレートをリモートのmainに配置した
- [x] プランで利用できる保護機能を確認し、有効・未設定を記録した

## 公式資料

- [Organizationの概要](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/about-organizations)
- [Organizationの新規作成](https://docs.github.com/en/organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch)
- [ブランチ保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
