# SSE更新通知

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / natuki53 / 未割当 |
| 更新日 | 2026-10-09 |
| 関連要件ID / 受入試験ID | TX-04/05、NET-02/04、ROL-03/06、PWA-01/02 / AT-021、036～038、058～060、062 |
| 関連Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) / 未作成 |

## 接続・通知

[OpenAPI](openapi.yaml)のN01で接続する。Cookieで認証し、Origin・event所属・本人対象または現在の業務照会権限を確認する。接続中も各通知の送信前に現在の許可範囲を確認する。停止・権限失効で配信資格を失った場合は接続を終了し、再接続でも再認可する。業務の新規処理停止だけなら、許可された既取引の確認通知は継続できる。

金銭・注文・在庫のTx内でOutboxを書き、コミット後に通知する。通知失敗で金銭成立を取り消さない。at-least-onceを前提とし、重複通知はidで排除する。残高・金額・氏名・メール・QR/招待トークン・冪等キーをdataへ含めない。型の正本はOpenAPIのResourceChanged/ResyncNotice。

| event | data・扱い |
| --- | --- |
| resource.changed（具体名の提案） | resource_type/resource_id/version。本人wallet、許可されたtransaction/payment_request/orderを案内 |
| resync | reason。保持範囲外・カーソル不明・安全な再開不可時に現在値を再取得 |

resource.changedの`id:`にはOutbox UUIDを用いる。UUID自体を配信順として比較しない。versionはリソースごとの正の整数文字列案で、変更可能リソースにはversionを必須とする。追記のみのtransactionでは省略可。他リソース・別イベントのversionを比較しない。旧版/重複通知で表示状態を巻き戻さず、通知を受けたら現在の正本APIを再取得する。

heartbeatは20秒のコメント行という詳細設計の補完案を維持する。HTTP応答開始前のエラーは共通JSON、開始後は接続終了と再接続で回復する。応答はtext/event-stream、Cache-Control: no-store。通知の受信は支払成功の証明ではなく、取引照会のSUCCEEDEDだけで確定表示する。

## 再接続・再取得

初回接続と再接続後は、残高・結果確認中の要求・表示中の注文などを正本から再取得する。EventSourceのLast-Event-IDから再開できる場合は許可対象だけを再送する。ネイティブEventSourceで任意ヘッダーを指定することは前提にせず、ページ再読込/新端末では新規接続＋正本再取得とする。

未知のUUID、他イベント/権限外のID、保持範囲外は対象の存在を明かさない共通reason CURSOR_UNAVAILABLEでresyncを送る。カーソルIDから権限を推定せず、保持中の通知も現在の認可で絞る。resyncは業務変更を行わない制御通知で、偽のOutbox UUIDを付けない。

再取得中の通知取りこぼしを防ぐため、先にstreamを接続して通知を受け付け、正本再取得が完了した後に受信済みの変更対象をもう一度取得する。切断中も結果不明要求は[共通規約](conventions.md)の頻度で照会する。画面バックグラウンド時の不要な接続/ポーリングを停止し、復帰時に現在値を取り直す。

## DB担当との確認・検証

Outbox UUIDと配信再開位置の対応、コミット/配送が前後した場合に未配送行を飛ばさない走査方法、保持期間、複数worker間の順序、停止/認可変更の通知方式は未決。再開位置の安全性を保証できない場合はresyncへ倒す。Outbox時刻やUUIDの大小だけで欠落なしと判断しない。

AT-036/037でコミット直後の切断・重複・遅延を注入し、通知なしでも正本結果へ復帰できること、AT-058/ROL-06で他event/権限解除後の再配信がないことを検証する。2秒/5秒の画面反映目標は未測定。承認者・日付・PR：未記入。
