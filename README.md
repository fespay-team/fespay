# FesPay

学園祭・バザーなどのイベント内決済プラットフォーム。
GitHub：[fespay-team/fespay](https://github.com/fespay-team/fespay)（private）。
現在はチーム開発の準備段階です。アプリケーション、DB、実行環境はまだ実装していません。

## 最初に読むもの

1. [ドキュメント一覧](docs/README.md)
2. [要件定義書と変更方法](docs/requirements/README.md)
3. [チーム開発ルール](CONTRIBUTING.md)
4. [担当・レビュー分担](docs/team/ownership.md)
5. [GitHub Organization の設定](docs/team/github-setup.md)

## リポジトリ構成

```text
fespay/
├── README.md
├── CONTRIBUTING.md
├── .github/                # Issue・PRテンプレート、レビュー担当設定例
├── docs/
│   ├── requirements/       # 要件定義書の原本・現行版の案内・変更記録
│   ├── design/             # アーキテクチャ・DB・API・UI・業務フローの設計
│   ├── adr/                # 技術・構成に関する意思決定記録
│   ├── testing/            # 受入試験の進捗・試験報告
│   ├── operations/         # 環境台帳・障害対応などの運用資料
│   ├── manuals/            # 主催者・受付・店舗・来場者マニュアル
│   ├── project/            # 工程・公開前ゲート・発表資料の案内
│   ├── team/               # GitHub設定・担当・チーム運用
│   └── templates/          # 設計書・ADR・試験報告のひな形
└── （コード用ディレクトリは実装開始時に作成）
```

5人で要件・API・画面・DBを同時に変更できるよう、最初は1つのリポジトリで管理します。
将来の `apps/web`、`apps/api`、`packages/contracts`、`tests`、`infra` の配置案は
[構成の意思決定記録](docs/adr/0001-repository-structure.md)に記載しています。

## 現在の状態

- 要件定義書 EPP-REQ-001 v0.1 を内容変更なしで取り込み済み。
- 設計書の置き場所とひな形、70件の受入試験の管理表を準備済み。
- 設計・実装・受入試験は未完了。試験管理表の初期状態はすべて「未実施」。
- GitHub Organization とリモートリポジトリの設定状況は[設定記録](docs/team/github-setup.md)を参照。
- OSSライセンスは未選定。公開・再配布の条件はチームで決定します。
