# ドキュメント一覧

| 場所 | 内容 | 現在の状態 |
| --- | --- | --- |
| [requirements](requirements/README.md) | 要件原本・現行版・変更履歴 | v0.1取込済み |
| [design](design/README.md) | アーキテクチャ・DB・API・UI・業務フロー | 配置と作成予定を準備 |
| [adr](adr/README.md) | 構成・技術の意思決定記録 | リポジトリ構成を記録 |
| [testing](testing/README.md) | 受入試験・証跡 | 70件すべて未実施 |
| [operations](operations/README.md) | 環境・リリース・障害対応 | 作成予定のみ |
| [manuals](manuals/README.md) | ロール別マニュアル | 作成予定のみ |
| [project](project/README.md) | 工程・公開前ゲート・発表 | 原本参照と未完了項目 |
| [team](team/ownership.md) | 分担・GitHub運用 | ロール定義、実名未割当 |
| [templates](templates/README.md) | 設計・ADR・試験報告のひな形 | 利用可能 |

## 管理方法

文書は原則Markdown、図はMermaidなど編集可能な形式を使います。
画像・PDFが必要なら該当文書と同じ階層の `assets/` に置き、編集元と対応を記載します。
Figma等の外部資料は設計書からリンクし、版・参照日・閲覧権限を記録します。
秘密情報や本番の個人情報を含む証跡はコミットせず、アクセス制限のある保存先への参照を残します。

設計書はファイル名を固定し、変更履歴をGitで管理します。
要件定義書は受領した版を保持し、改訂時は次版を追加します。
設計書の状態は「下書き → レビュー中 → 承認済み → 廃止」。
マージしたPR・承認者・日付がそろってから承認済みと記載します。
