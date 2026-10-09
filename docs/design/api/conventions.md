# API共通規約

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / natuki53 / 未割当 |
| 更新日 | 2026-10-09 |
| 関連要件ID | API-01～05、MNY-01/02、WAL-01～03、TX-01～06、ROL-02/03/06、CFG-03/04、PWA-01/02 |
| 受入試験ID | AT-021～024、026～027、034～038、042、047、058～060、062 |
| 関連Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) / [ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)（提案） |

## 基準・HTTP

[現行要件](../../requirements/event_payment_requirements.md)第22章を基準とする。型と各パスは[OpenAPI](openapi.yaml)を参照する。本文の具体化はレビュー前の設計案。[OpenAPI 3.1.0仕様](https://spec.openapis.org/oas/v3.1.0.html)に従い記述する。

HTTPS、UTF-8 JSON、`/v1`を使用する。業務フィールドは既存詳細設計のJSON案に合わせsnake_case、operationIdはcamelCase。未知の入力フィールド/クエリを422で拒否する。成功はGET/版付き更新/解除200、作成201、非同期受付202を基本とする。認証callbackは302。各操作のOpenAPI応答を優先し、削除/解除でも現在状態を返す案とした。詳細設計の一般的なPOST201/削除204からの具体化はADR-0003に記録する。

個人・認証・残高・取引・注文の応答はエラーも含め`Cache-Control: no-store`。Service Workerはnetwork-onlyとし、古い応答で成立を否定しない。GETは金銭確定・秘密発行を行わない。期限切れ予約の正本再評価/内部解放は業務Txで直列化し、金銭成立と競合させない。公開APIも現案はno-storeとし、将来の公開キャッシュ採用時も掲載解除の最大60秒を守る。

## 認証・認可

[認証設計](authentication.md)とADR-0003の案に従い、Cookieを`__Host-fespay.session`、Secure/HttpOnly/SameSite=Lax/Path=/、Domainなしとする。GET `/v1/auth/context`でセッション束縛の同期CSRFトークンを取得し、更新へ`X-CSRF-Token`を送る。匿名入口は`__Host-fespay.preauth`の別文脈を使う。Origin許可リストも検証しCORSは同一Originを基本とする。ログイン/失効で文脈を交換。OAuth callbackは保存state/nonce/セッション束縛で検証する。採用版のBetter Auth/DB adapterとの統合は未実施。
認証主体はサーバーで取得する。本人残高・本人履歴へ任意のaccount_idを入力させない。イベント、必要な店舗、対象の本人所有または現在の業務照会権限を要求ごとに検証する。業務で処理した事実やキーを知っていることは照会権限にならない。権限解除後の担当者に業務結果を返さず、現在の権限者が取引IDで照会する。兼務者も本人操作と業務操作を区別する。

scope省略時はMINE。SHOPはshop_id必須、MINE/EVENTではshop_id拒否。SHOP/EVENTは現在の専用業務照会grantを確認し、通常レジにイベント全件を返さない。取引ID照会は本人の取引、または現在の関連業務権限で許可された取引のみ。イベント/店舗を越えるID、存在を秘匿すべき対象は同じ404とする。新規処理の緊急停止だけを理由に既取引照会を止めない。アカウント・セッション停止や権限解除による照会拒否は別に判定する。

## 金額・ID・時刻

金額は10進文字列。入力取引額は正数1～30桁、残高は0を許可し30桁まで。符号、空白、小数、指数、カンマ、先頭ゼロは拒否する。JSON number/浮動小数点へ変換せず、FEの表示・BEの計算で精度を保つ。途中の桁あふれは全体拒否で、分割・丸め・部分成立を行わない。AggregateAmount/AggregateCountは桁を限定せず、SignedAggregateAmountは負数を許す。金額形式は厳密な10進表現で、1取引の30桁制限を合計へ流用しない。

残高3区分は同じ正本時点から取得する。available_amountだけが支払い・譲渡に使え、held_amountとrefund_only_amountを加算して使用可能額にしない。checked_atはサーバーがその応答の正本状態を確認した時刻。wallet versionはbigintの精度を失わない正の整数文字列とする案。

公開IDはUUID案を維持するが、生成方式とDB内部IDとの一致はDB担当と確認する。IDは認可に使う秘密ではない。サーバー応答日時はRFC3339のUTC（Z）、UIはAsia/Tokyo。端末時刻を受付・QR・承認・予約の期限判定に使わない。期限は必要なロック取得後のサーバー実時刻で`checked_at < expires_at`、等しい時刻は拒否する。

## 冪等性・結果照会

金銭/在庫確定の更新は`Idempotency-Key`必須。1～128文字のASCII可視文字（空白を除く）は詳細設計の補完案を引き継ぐ。クライアントは送信前にevent・operation・キー・承認内容を保存し、応答不明でも同じ組を維持する。未送信要求を自動実行キューに保存しない。

一意の論理scopeは`(actor_account_id, event_id, operation, key)`。operationはOpenAPIのoperationIdと対応し、EVENT更新をtransaction-resultsのenumへ含める。イベント作成/サービス制御/公開ゲート記録はactor/GLOBAL/operation/keyとし、`/v1/operation-results`で照会する。GLOBALとEVENTを同じキー空間に混ぜない。同一内容は同じ効果/ID、同キー異内容は409 IDEMPOTENCY_CONFLICT。キーや認証秘密を通常ログへ記録しない。要求hashはmethod/event/operationId/パスの対象ID/検証済み本文を含め、別対象への同キー流用も409とする。hash入力は形式検証済みの元要求にmethod・scope・operation・パスIDを加えたUTF-8 JSONとする案。オブジェクトキーはASCII昇順、空白なし、配列順/文字列/省略とnullを維持、整数は10進。金額/版を数値化せず、SHA-256を保存する。サーバーの可変な商品価格や消費後token状態をhashへ入れず、同キー再送を先に認可/hash照合してから元対象へ復帰する。元bodyとtoken原文を長期保存しない。

版付き更新の同キー成功済み再送は、現在の照会認可と内容hash照合の後に元の効果/IDを返す。古いexpected_versionの再検証で既成立を拒否しない。応答には現在のresource状態を返し、過去のPREPARED/HELDを現在の状態として巻き戻さない。新規キーの更新では現在の版・操作権限/MFA・停止/受付を必ず検証する。

取引ID未受信でも照会できるよう、GETのキー照会を提案する。キーはURLへ含めずヘッダーで渡し、eventはパス、operationはクエリで指定する。認証主体と現在の対象照会権限を確認後、正本の永続結果だけを読む。自分が発行した業務要求でも権限解除後は返さない。

| 照会状態 | 意味・次の操作 |
| --- | --- |
| SUCCEEDED | 元コマンドの効果が永続成立。transaction、または現在の払戻し/購入返金resourceまたは元対象のCommandReferenceを返す |
| REJECTED | 永続的な最終拒否が確認済み。理由を表示し、必要なら権限を持つ操作者が新要求へ進む |
| PENDING | 処理中の記録あり。同じキーで照会を続ける |
| UNKNOWN | 記録未検出等で成立/未成立を断定できない。新キーの自動再処理をしない |

これらはコマンド照会応答の状態で、DB取引状態や支払要求の状態を置き換えない。SUCCEEDEDにはtransaction/resourceのどちらか一方、REJECTEDには最終拒否理由を必須とし、PENDING/UNKNOWNには成功リソースを含めない。prepare成功のPREPAREDや返金申出保存成功のREQUESTEDは金銭返還完了ではない。現金交付はresource.status=PAID、購入返金はresource.status=SUCCEEDEDと対応する取引IDを確認する。キー未検出の404を未成立証明にしない。DB障害で正本を確認できなければ503を返し、UNKNOWNやREJECTEDを捏造しない。

10秒応答なしは「結果確認中」。最初の30秒は2秒間隔、その後5秒間隔、2分後は手動照会も提示し未確認一覧へ保持する。バックグラウンドでは不要なポーリングを停止する。同キー再送時も現在の認可を再確認し、DB内部再試行は同じキーで最大3回。HTTPエラー・端末タイムアウトだけで未成立としない。

## ページング・エラー

一般一覧は標準20件、その他一覧は標準50件、最大100件、サーバーの`occurred_at DESC, transaction_id DESC`順。カーソルは不透明とし、actorまたはPUBLIC/event/scope/フィルター/並び順に束縛する。次ページでも現在の権限を再検証する。カーソルはbase64urlで包んだHMAC検証付きペイロード、期限30minを提案する。サーバー内部の最終ソート値・条件hash・scope・期限だけを持ち、FEは復号/生成しない。改ざん/期限/条件差替えは422、再取得へ。署名鍵の配布/ローテーションはBE環境設計で確認する。通常一覧はページごとの現在値で、CSVの固定snapshotとは区別する。金額や残高の正本確認を一覧の有無だけで行わない。

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

code/message/request_id/retryableと任意のcurrent_state_or_queryを共通型とする。retryableはその要求を再試行できる意味で、新キーによる金銭処理の許可ではない。キー付きコマンドは処理中・結果不明202 Error、業務競合409とし現在資格内の照会先を返す。CSV/失効run申込の202はjobまたはErrorのoneOfで区別し、受付済みjobを金銭処理中のエラーにしない。内部SQL/stack/資格情報を返さない。

## 秘密の発行と自然一意

認証操作、QR/招待/受取秘密の発行、画像は金銭コマンドの長期キー記録を使わない。認証フローと用途別tokenの単回消費、招待の再発行失効、画像版を使う。秘密を失ったら明示再発行し、保存済み結果から秘密を取り出さない。招待受諾は同じ宛先本人の並行受諾を同じgrantへ復帰させる。

キー付き操作にも自然一意制約を追加する。1支払要求1決済/注文、1チャージ準備1付与、1受取token1譲渡、1原払戻し1誤記録訂正、wallet/条件版/期限1失効、返金累計/数量・在庫戻し累計。異なるキーや経路を使ってもこれらを迂回できない。保存済み金銭/在庫キーは台帳と同じ7年間保持し、非金銭管理キーの保持方式はDBレビュー対象。

## 領域別エラー

| 場面 | code候補・扱い |
| --- | --- |
| 追加認証/再認証不足 | MFA_REQUIRED / MFA_EXPIRED / AUTH_REAUTH_REQUIRED（403）。再認証後も元キーで照会 |
| identity競合/最終手段 | IDENTITY_ALREADY_LINKED / LAST_IDENTITY（409）。暗黙統合や最後の手段解除をしない |
| 版/内容/状態 | VERSION_CONFLICT / CONTENT_VERSION_MISMATCH / INVALID_STATE / REQUEST_IN_PROGRESS（409/202） |
| 参加/設定 | TERMS_VERSION_MISMATCH / PASSWORD_INVALID / PROTECTED_POLICY_CHANGE / FEATURE_DEPENDENCY（409/403/422） |
| チャージ/現金 | CASH_FACT_UNRESOLVED / CASH_NOT_RECEIVED / CORRECTION_LIMIT_EXCEEDED（409）、案件へ |
| 返金/在庫戻し | REFUND_LIMIT_EXCEEDED / REFUND_QUANTITY_EXCEEDED / STOCK_RESTORE_LIMIT_EXCEEDED（409） |
| 完了/退出/削除 | EVENT_NOT_SETTLED / PARTICIPATION_NOT_SETTLED / ACCOUNT_NOT_SETTLED（409）、権限内のblockers |
| 受取 | RECEIPT_INVALID（422）/ RECEIPT_VERIFICATION_HELD（409）、本人画面再確認 |
| CSV/画像 | EXPORT_CONCURRENCY_LIMIT（409）/ EXPORT_EXPIRED（404）/ IMAGE_TOO_LARGE（413）/ IMAGE_UNSUPPORTED（415） |

codeは将来追加を許す文字列だが、実装は上表と各operationの条件で固定しFEは未対応codeも安全に表示する。入力不正をREJECTED保存結果と混同しない。存在秘匿は一貫して404、tokenを含むメッセージを返さない。

## 検証・承認

全論理API ID/全operationと参照の静的確認は[検証手順](validation/README.md)を参照。AT-023/024の金額形式・30桁・安全整数超過、AT-026/027/037/038の同キー復帰、AT-021/058の停止・親子所属、ROL-06の権限解除を優先確認する。アプリ・DBでの試験は未実施。承認者・日付・PR：未記入。
