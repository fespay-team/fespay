# ADR：意思決定記録

構成・技術選定の理由、比較案、影響を残します。
[テンプレート](../templates/adr.md)をコピーし、`0002-short-title.md` のように連番で追加します。
承認済みの判断を変更する場合は新しいADRから旧ADRを参照し、置き換え先を記録します。

| ID | 内容 | 状態 |
| --- | --- | --- |
| [0001](0001-repository-structure.md) | 単一リポジトリとドキュメント配置 | 初期構成に適用、チームレビュー未実施 |
| [0002](0002-refund-api-workflows.md) | 現金払戻しの本人承認と購入返金申出の永続化を分離 | 提案、FE・BE・DBレビュー前 |
| [0003](0003-api-authentication-and-command-boundaries.md) | 認証入口、短命秘密と業務MFA、決済共通化、キーscopeの具体化 | 提案、FE・BE・DBレビュー前 |
| [0004](0004-api-client-recovery-and-wire-contracts.md) | DBに依存しないHTTP入力・互換性・画面復帰・CSV契約 | 提案、FE・BEレビュー前、DB接点は別調整 |
