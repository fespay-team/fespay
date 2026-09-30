# 設計書

[基本設計書](basic-design.md)をEPP-DES-001の本文としてレビュー中です。基準は[安定パスの現行要件書](../requirements/event_payment_requirements.md)です。QR期限等は[要件変更記録のCR-0001](../requirements/changes.md)としてレビュー中であり、承認前のため現行要件書の確定仕様としては扱いません。

| 領域 | 入口 | 主担当の目安 |
| --- | --- | --- |
| 基本設計全体 | [basic-design.md](basic-design.md) | 総合 |
| 全体構成・境界 | [architecture](architecture/README.md) | 総合＋BE |
| DB・台帳 | [database](database/README.md) | BE-1＋BE-2 |
| API契約 | [api](api/README.md) | BE＋利用するFE |
| 画面・導線 | [ui](ui/README.md) | FE-1＋FE-2 |
| 業務状態・競合 | [flows](flows/README.md) | 各担当＋BE |

APIの仕様本文は作成後の `api/openapi.yaml` を正本とし、説明文でリクエスト定義を重複管理しません。
DBの論理設計と将来のマイグレーションの対応を記録し、UI・API・DBで同じ要件IDを参照します。
