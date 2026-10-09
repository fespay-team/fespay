# API共通規約

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / natuki53 / 未割当 |
| 更新日 | 2026-10-09 |
| 関連要件ID | API-01～05、MNY-01/02、WAL-01～03、TX-01～06、ROL-02/03/06、CFG-03/04、PWA-01/02 |
| 受入試験ID | AT-021～024、026～027、034～038、042、047、058～060、062 |
| 関連Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / PR作成後に記録 / 未作成 |

## 基準・HTTP

[現行要件](../../requirements/event_payment_requirements.md)第22章を基準とする。型と各パスは[OpenAPI](openapi.yaml)を参照する。本文の具体化はレビュー前の設計案。[OpenAPI 3.1.0仕様](https://spec.openapis.org/oas/v3.1.0.html)に従い記述する。

HTTPS、UTF-8 JSON、`/v1`を使用する。業務フィールドは既存詳細設計のJSON案に合わせsnake_case、operationIdはcamelCase。未知の入力フィールド/クエリを422で拒否する。成功はGET 200、作成201、非同期受付202、本文なし204を基準とし、更新系の具体応答は各操作を設計する際に定義する。

個人・認証・残高・取引・注文の応答はエラーも含め`Cache-Control: no-store`。Service Workerはnetwork-onlyとし、古い応答で成立を否定しない。今回の読取APIは業務更新を行わない。

## 認証・認可

Better AuthのセッションCookieを用いる。Cookie実名・属性の具体値、OAuthのコールバック、CSRFトークン発行/検証方式は認証設計と同時に決める。OpenAPIの`__SESSION_COOKIE_TBD__`は仮置きであり、本番設定名ではない。CookieはHttpOnly/Secure/SameSiteを適用し、更新系にはCSRF・Origin検証、CORSは許可Originのみを適用する。

認証主体はサーバーで取得する。本人残高・本人履歴へ任意のaccount_idを入力させない。イベント、必要な店舗、対象の本人所有または現在の業務照会権限を要求ごとに検証する。業務で処理した事実やキーを知っていることは照会権限にならない。権限解除後の担当者に業務結果を返さず、現在の権限者が取引IDで照会する。兼務者も本人操作と業務操作を区別する。

今回の一覧は本人分のみ。取引ID照会は本人の取引、または現在の関連業務権限で許可された取引のみ。イベント/店舗を越えるID、存在を秘匿すべき対象は同じ404とする。新規処理の緊急停止だけを理由に既取引照会を止めない。アカウント・セッション停止や権限解除による照会拒否は別に判定する。

## 金額・ID・時刻

金額は10進文字列。入力取引額は正数1～30桁、残高は0を許可し30桁まで。符号、空白、小数、指数、カンマ、先頭ゼロは拒否する。JSON number/浮動小数点へ変換せず、FEの表示・BEの計算で精度を保つ。途中の桁あふれは全体拒否で、分割・丸め・部分成立を行わない。集計額の桁数は別途設計し、1取引の30桁制限を流用しない。

残高3区分は同じ正本時点から取得する。available_amountだけが支払い・譲渡に使え、held_amountとrefund_only_amountを加算して使用可能額にしない。checked_atはサーバーがその応答の正本状態を確認した時刻。wallet versionはbigintの精度を失わない正の整数文字列とする案。

公開IDはUUID案を維持するが、生成方式とDB内部IDとの一致はDB担当と確認する。IDは認可に使う秘密ではない。サーバー応答日時はRFC3339のUTC（Z）、UIはAsia/Tokyo。端末時刻を受付・QR・承認・予約の期限判定に使わない。期限は必要なロック取得後のサーバー実時刻で`checked_at < expires_at`、等しい時刻は拒否する。

## 冪等性・結果照会

金銭/在庫確定の更新は`Idempotency-Key`必須。1～128文字のASCII可視文字（空白を除く）は詳細設計の補完案を引き継ぐ。クライアントは送信前にevent・operation・キー・承認内容を保存し、応答不明でも同じ組を維持する。未送信要求を自動実行キューに保存しない。

一意の論理scopeは`(actor_account_id, event_id, operation, key)`。同一内容は同じ結果、同キー異内容は409 IDEMPOTENCY_CONFLICT。操作名は将来の金銭更新operationIdと対応させる案で、正式語彙は更新契約と同時に固定する。キーや認証秘密を通常ログへ記録しない。canonical JSONの対象・正規化は更新APIとDB設計で決め、同じ本文でも別の操作・親リソースを誤って同一視しない。

取引ID未受信でも照会できるよう、GETのキー照会を提案する。キーはURLへ含めずヘッダーで渡し、eventはパス、operationはクエリで指定する。認証主体と現在の対象照会権限を確認後、正本の永続結果だけを読む。自分が発行した業務要求でも権限解除後は返さない。

| 照会状態 | 意味・次の操作 |
| --- | --- |
| SUCCEEDED | 永続成立を確認。同じ取引ID・額・時刻を表示 |
| REJECTED | 永続的な最終拒否が確認済み。理由を表示し、必要なら本人が新要求へ進む |
| PENDING | 処理中の記録あり。同じキーで照会を続ける |
| UNKNOWN | 記録未検出等で成立/未成立を断定できない。新キーの自動再処理をしない |

これらは照会応答の状態で、DB取引状態や支払要求の状態を置き換えない。SUCCEEDEDには成立取引を、REJECTEDには最終拒否理由を必須とし、PENDING/UNKNOWNには成立取引を含めない。キー未検出の404を未成立証明にしない。DB障害で正本を確認できなければ503を返し、UNKNOWNやREJECTEDを捏造しない。

10秒応答なしは「結果確認中」。最初の30秒は2秒間隔、その後5秒間隔、2分後は手動照会も提示し未確認一覧へ保持する。バックグラウンドでは不要なポーリングを停止する。同キー再送時も現在の認可を再確認し、DB内部再試行は同じキーで最大3回。HTTPエラー・端末タイムアウトだけで未成立としない。

## ページング・エラー

本人履歴は標準50件、最大100件、サーバーの`occurred_at DESC, transaction_id DESC`順。カーソルは不透明とし、本人/event/フィルター/並び順に束縛する。次ページでも現在の権限を再検証する。カーソルの符号化・改ざん検出・有効期間は未決。今回の履歴はページごとの現在値で、CSVの固定snapshotとは区別する。金額や残高の正本確認を一覧の有無だけで行わない。

| HTTP | 主なcode・対応 |
| --- | --- |
| 401 | AUTH_REQUIRED / AUTH_INVALID：再ログイン後、元のキーで照会 |
| 403 | FORBIDDEN：現在の権限を確認 |
| 404 | RESOURCE_NOT_FOUND：不存在または秘匿。未成立の証明ではない |
| 409 | INVALID_STATE / VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / INSUFFICIENT_BALANCE / INSUFFICIENT_STOCK / TOKEN_EXPIRED / TOKEN_CONSUMED：業務更新契約で個別に定義 |
| 422 | VALIDATION_ERROR：形式・範囲・未対応操作・カーソルの入力拒否 |
| 429 | RATE_LIMITED：Retry-Afterの秒数後に照会。会場共用IPだけで通常利用者を一括拒否しない |
| 503 | DEPENDENCY_UNAVAILABLE / DB_UNAVAILABLE：正本へ接続回復後に同じキーで照会 |
| 500 | INTERNAL_ERROR：request_idで調査。成立/未成立を断定しない |

code/message/request_id/retryableと任意のcurrent_state_or_queryを共通型とする。retryableはその要求を再試行できる意味で、新キーによる金銭処理の許可ではない。処理中応答の202/409と業務更新の最終HTTPマッピングは後続契約で決める。内部SQL/stack/資格情報を返さない。

## 検証・承認

AT-023/024の金額形式・30桁・安全整数超過、AT-026/027/037/038の同キー復帰、AT-021/058の停止・親子所属、ROL-06の権限解除を優先確認する。アプリ・DBでの試験は未実施。承認者・日付・PR：未記入。
