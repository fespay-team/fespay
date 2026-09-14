# 設計書

現時点では設計書本文は未作成です。下記の配置に沿って[設計書テンプレート](../templates/design.md)から作成します。
要件の制約は[要件原本](../requirements/event_payment_requirements_integrated_v0.1.md)を参照してください。

| 領域 | 入口 | 主担当の目安 |
| --- | --- | --- |
| 全体構成・境界 | [architecture](architecture/README.md) | 総合＋BE |
| DB・台帳 | [database](database/README.md) | BE-1＋BE-2 |
| API契約 | [api](api/README.md) | BE＋利用するFE |
| 画面・導線 | [ui](ui/README.md) | FE-1＋FE-2 |
| 業務状態・競合 | [flows](flows/README.md) | 各担当＋BE |

APIの仕様本文は作成後の `api/openapi.yaml` を正本とし、説明文でリクエスト定義を重複管理しません。
DBの論理設計と将来のマイグレーションの対応を記録し、UI・API・DBで同じ要件IDを参照します。
