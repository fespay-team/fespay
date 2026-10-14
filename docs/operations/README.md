# 運用資料

[ローカル開発と検証](development.md)はPR #15で採択済み。開発専用migration・3OS CI・隔離DBの基盤/認証検証があります。環境構築全般を未実施とは扱いません。運用DB適用、ステージング/本番の構成・復旧・実金銭公開は未完了です。現行運用窓口natuki53、必要な判断・証跡は[決定管理表](../team/decisions.md)とIssue #14。

| 状態 / 資料 | 内容 | 関連要件 |
| --- | --- | --- |
| 採択済み [development.md](development.md) | ローカル開発環境・migration・再実行/検証 | DEV-02 |
| 未作成 environments.md | 環境URL・責任者・費用・秘密保管場所の参照 | ARC-02/03 |
| 未作成 release.md | リリース判定・復旧手順 | REL-01、G1～G5 |
| 未作成 incident-response.md | 安全停止・結果照会・引継ぎ | OPS-01～06 |
| 未作成 backup-restore.md | backup/復元・再照合・証跡 | OPS-03～05 |

環境台帳には鍵・token・接続PWの実値を記録しません。公開前ゲートは[工程表](../project/README.md#公開前ゲート)、現在の完了/残件は[採択・進捗記録](../project/design-status.md)を参照します。
