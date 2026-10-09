# 設計書

[基本設計書](basic-design.md)をEPP-DES-001の本文としてレビュー中です。基準は[安定パスの現行要件書](../requirements/event_payment_requirements.md)です。[CR-0001](../requirements/changes.md)で承認されたQR表示・関連付け後承認・見積・在庫予約の期限と安全な再試行条件を反映しています。

| 領域 | 入口 | 主担当の目安 |
| --- | --- | --- |
| 基本設計全体 | [basic-design.md](basic-design.md) | 総合 |
| 詳細設計全体（再レビュー待ち） | [detailed-design.md](detailed-design.md) | 総合＋BE＋FE |
| 全体構成・境界 | [architecture](architecture/README.md) | 総合＋BE |
| DB・台帳 | [database](database/README.md) | BE-1＋BE-2 |
| API契約（共通・照会の下書きを作成中） | [api](api/README.md) | API：natuki53、レビュー：BE＋利用するFE |
| 画面・導線 | [ui](ui/README.md) | FE-1＋FE-2 |
| 業務状態・競合 | [flows](flows/README.md) | 各担当＋BE |

APIの仕様本文は [api/openapi.yaml](api/openapi.yaml) を正本候補とし、説明文でリクエスト定義を重複管理しません。現在は残高・取引照会・SSEの部分契約案で、金銭更新や管理系の契約は未作成です。
DBの論理設計と将来のマイグレーションの対応を記録し、UI・API・DBで同じ要件IDを参照します。
