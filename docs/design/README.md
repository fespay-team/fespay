# 設計書

基本・詳細設計、API・DBの主要設計は採択済みです。基準は[現行要件v0.2](../requirements/event_payment_requirements.md)と承認済み[CR-0001](../requirements/changes.md)。承認者・対象head・マージ日は[採択・進捗記録](../project/design-status.md)、現行担当は[担当表](../team/ownership.md)を参照してください。

| 領域 | 入口 | 状態 / 担当 |
| --- | --- | --- |
| 基本設計全体 | [basic-design.md](basic-design.md) | PR #3/#6で設計基準採択、現行保守natuki53 |
| 詳細設計全体 | [detailed-design.md](detailed-design.md) | PR #6で採択、API/DBの具体化は#8/#9、natuki53 |
| 全体構成・境界 | [architecture](architecture/README.md) | 本文は基本/詳細設計とADR。分冊は未作成、natuki53 |
| DB・台帳 | [database](database/README.md) | PR #9で採択済み、natuki53 |
| API契約 | [api](api/README.md) | PR #8で採択済み、natuki53 |
| 画面・導線 | [ui](ui/README.md) | 基本設計に一覧/遷移あり。プロトタイプのレビュー・詳細画面は残る、natuki53 |
| 業務状態・競合 | [flows](flows/README.md) | 基本/詳細/APIで採択済みの処理境界あり。分冊は未作成、natuki53 |

APIの正本は[openapi.yaml](api/openapi.yaml)、保存モデル・制約は[DB設計](database/README.md)。全58論理API IDを171操作へ具体化し、55業務表と対応付けています。[共通HTTP規約](api/common/http-contract.md)、[画面復帰](api/flows/client-flows.md)、[CSV契約](api/domains/csv-contract.md)、[網羅表](api/coverage.md)を参照してください。Markdownへ入力型やSQLの全文を重複管理しません。

採択は設計の基準があることを示します。未決U-01～U-20の残る判断・実証は[決定管理表](../team/decisions.md)、公開条件は[工程](../project/README.md#公開前ゲート)。担当割当、部分実装、受入合格、公開可能をそれぞれ区別します。

開発基盤と認証5経路はPR #15/#19/#23で部分実装済み。続く公開登録/login等は[Issue #13](https://github.com/fespay-team/fespay/issues/13)、金銭/注文/worker/運用は[Issue #14](https://github.com/fespay-team/fespay/issues/14)。今回の同期で新しい実装・受入合格を追加しません。
