# FesPay

学園祭・バザーなどのイベント内決済プラットフォーム。
GitHub：[fespay-team/fespay](https://github.com/fespay-team/fespay)（public）。
API/DB設計はPR #8/#9、開発基盤はPR #15で採択済み。[認証文脈・本人セッションAPI](docs/testing/auth-session-adapter.md)はPR #19でマージ済み。[本人の認証手段一覧](docs/testing/auth-identity-list.md)もPR #23でマージ済みで、業務機能全体の実装受入は未実施です。

起動・検証は[ローカル開発手順](docs/operations/development.md)、担当と後続Issueは[開発計画](docs/project/development-plan.md)を参照してください。

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
│   ├── requirements/       # 現行要件書・変更記録
│   ├── design/             # アーキテクチャ・DB・API・UI・業務フローの設計
│   ├── adr/                # 技術・構成に関する意思決定記録
│   ├── testing/            # 受入試験の進捗・試験報告
│   ├── operations/         # 環境台帳・障害対応などの運用資料
│   ├── manuals/            # 主催者・受付・店舗・来場者マニュアル
│   ├── project/            # 工程・公開前ゲート・発表資料の案内
│   ├── team/               # GitHub設定・担当・チーム運用
│   └── templates/          # 設計書・ADR・試験報告のひな形
├── apps/                  # APIとWebの開発基盤・部分実装
├── database/              # 開発専用migrationとmanifest
├── scripts/               # 起動・設計検証
├── compose.yaml           # ローカル開発DB
└── package.json           # 固定npm workspace
```

単一リポジトリで要件・API・画面・DBを管理します。現在は全担当枠をnatuki53が兼任し、作者以外のdevelopersがレビューします。初期の配置案と現在の対応は[ADR-0001](docs/adr/0001-repository-structure.md)、固定workspaceは採択済み[ADR-0005](docs/adr/0005-development-foundation.md)を参照してください。

## 現在の状態

- 受領したEPP-REQ-001 v0.1を初期基準として[安定パスの現行要件書](docs/requirements/event_payment_requirements.md)を作成し、CR-0001を反映した現行v0.2を管理中。受領時点はGit履歴で保管する。
- [基本](docs/design/basic-design.md)・[詳細](docs/design/detailed-design.md)・API・DBの主要設計は採択済み。[採択・進捗記録](docs/project/design-status.md)に対象head・承認者・マージ記録を集約。
- 開発基盤と認証5経路は部分実装済み。公開登録/login、実OAuth/MFA、金銭/注文/worker・画面/運用の実装・受入は残る。
- [受入管理表](docs/testing/acceptance-status.md)の全70件は全条件の判定が未実施。部分検証の証跡と担当窓口を記録し、一式の合格へ読み替えない。
- GitHub Organization とリモートリポジトリの設定状況は[設定記録](docs/team/github-setup.md)を参照。
- 当面の公開方針は[権利留保（All rights reserved）](LICENSE)。OSSライセンスは採用せず、再利用・再配布の包括的な許諾は付与しません。将来のOSSライセンス採用はチームで決定します。
