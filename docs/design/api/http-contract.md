# HTTP入力・エラー・互換性

状態：API設計案、FE/BEレビュー前。担当：natuki53。更新日：2026-10-09。
要件：API-01～05、SEC-07～10、NET-02、PWA-02。受入：AT-037/038、058～062。
[Issue #7](https://github.com/fespay-team/fespay/issues/7) / [ADR-0004](../../adr/0004-api-client-recovery-and-wire-contracts.md)。

正本候補は[OpenAPI](openapi.yaml)。上限はx-http-policy、コード対応はx-error-catalog、操作の互換性はx-client-revision-policy。物理DBと実装済み動作を宣言する文書ではない。

## 入力

| 対象 | 契約 |
| --- | --- |
| JSON | application/json、UTF-8、圧縮なし。262,144 bytes以下、入れ子32段以下、値/コンテナ計10,000ノード以下。Content-Lengthだけを信用せず受信中も制限 |
| 構文 | 不正UTF-8、壊れたJSON、重複キー、非有限数・孤立サロゲートは400 MALFORMED_REQUEST。空本文/型/必須/組合せ不正は422 VALIDATION_ERROR |
| 本文/クエリ | 未定義フィールド・重複単一クエリ・未定義enumは422。schemaで明示したnullだけ許可。省略/null/空文字を置換しない |
| 数値 | 金額と版は文字列のまま。query整数はASCII10進、符号/小数/指数/先頭ゼロを拒否。PWはtrim/Unicode正規化しない |
| Content-Type/Encoding | 非対応は415 UNSUPPORTED_MEDIA_TYPE。JSON charsetを指定する場合はutf-8のみ。未知HTTPヘッダーは一括拒否せず、用途別単一ヘッダーの曖昧な重複を拒否 |
| multipart | 全体5,100,000 bytes以下、fileは1個・5,000,000 bytes以下、expected_versionは1個。未知/重複partは422、byte超過は413 |
| 画像実体 | JPEG/PNG/WebP・1フレーム。各辺8,192px/総33,554,432画素以内。複数フレーム415 IMAGE_UNSUPPORTED、寸法超過413 IMAGE_DIMENSIONS_EXCEEDED。実デコードも検査し、EXIF除去・長辺2,048px以下へ再エンコード |

数値はAPI資源保護案で、金額の業務上限ではない。巨大本文は認証前にも受信段階で拒否する。デコーダCPU/メモリ/実行時間/worker数、プロキシ設定はBE/環境担当の実測対象。壊れた画像実体は422。既存の1店舗1,000枚を超える場合は409 IMAGE_COUNT_LIMITと整理案内。

現在の認証/Origin/CSRF/対象認可、形式検証、既存キー内容照合、新規の版/期限/MFA/状態を検証する。秘匿対象の存在を入力エラーで先に漏らさず404を優先する。どの順でも拒否前に業務更新しない。

## エラー

Errorはcode/message/request_id/retryableと必要時のcurrent_state_or_query、field_errors、update_hint。field_errorsは位置・フィールド名/JSON Pointer・理由のみ、最大50件。入力値・秘密を反射せず、messageをHTMLとして描画しない。SQL/stack/内部URLを返さない。

| 応答 | 次の動作 |
| --- | --- |
| 400/413/415/422 | 入力修正。送信済み金銭要求は別に元キーを照会。形式拒否と永続REJECTEDを混同しない |
| 401 | 再ログインして同じactor/event/operation/keyを照会。別actorへ流用しない |
| 403 | CSRFならcontext再取得、MFA/再認証なら該当フロー。権限解除なら業務stream/ポーリング停止。POST自動再送なし |
| 404 | 不存在・秘匿・失効を安全に案内。未成立/現金未交付の証明にしない |
| 409 | 正本の版/状態を再確認。最終拒否/明示取消等の確認後だけ新要求へ。CLIENT_UPDATE_REQUIREDは更新待ち |
| 429 | Retry-After秒数以上待つ。不正/欠落時は5秒の案。元キーを維持し通知で待機を短縮しない |
| 500/503/通信断 | 成立を推定せず結果確認中と元キー照会。retryable=trueでも新キーで自動処理しない |
| 202 | Error、LoginChallenge、CSV/失効jobを型で区別。受付/challengeを金銭完了と表示しない |

既知コードのHTTP/retryable/画面動作はx-error-catalog。未知コードはHTTP分類で案内し、自動で新規金銭POSTしない。コード追加で/v1既存フィールドの意味を変えない。

外部Google callbackだけはOAuth応答の未知拡張queryを制限内で無視する。[画面復帰](client-flows.md)とx-query-schemaが例外を定義し、同名重複・code/error/stateの曖昧さは拒否する。

## 旧画面と更新

GET `/v1/client-policy`はDB不要の公開配信設定。初期current_revision/minimum_write_revision=1、recovery_revision=1。OpenAPI文書版とは別の整数で、minimum_write<=currentを配信検証する。各応答のX-FesPay-Contract-Revision/X-FesPay-Min-Write-Revisionは同じ設定。FEは起動/前面復帰/更新案内時にpolicyを再取得する。取得失敗は新規更新を止め、金銭結果を変えない。

| 分類 | 旧画面の扱い |
| --- | --- |
| READ | 現在認可を満たす既存/v1のGET照会を維持。OAuth callbackのGETは開始時の検証済み文脈へ戻るブラウザー専用例外 |
| RECOVERY | 操作別許可リストにあるログイン・追加認証・session失効、開始済み現金の完了/引継ぎ/未交付取消/未成立返却等。初版入力を維持し、現在認可/MFA/版/現金事実を省略しない |
| CURRENT | 新規金銭/在庫/管理/秘密発行等。未指定を0とするX-FesPay-Client-Revisionがminimum_write未満なら副作用前に409 CLIENT_UPDATE_REQUIREDとupdate_hint |

既成立の同キー・同内容再送は現在の照会認可/hash照合後に元効果へ復帰し、リビジョン不足で成功を失敗へ変えない。未知キーは新規処理として止める。リビジョンを要求hashへ含めず、更新後も元キーへ復帰できる。ヘッダーは認可の代用ではなく、上限以上でも入力・金額・版を必ず検証する。

払戻し受渡しの開始はCURRENT、開始済みcompleteCashRefundはRECOVERY。新しいprepareChargeはCURRENT、受領済みcompleteChargeはRECOVERY。準備/本人承認/現金事実を旧版で迂回しない。照会・RECOVERY・既成立キーの解釈を維持する互換層を同じ配信で用意し、維持できない破壊的変更は/v2等へ分離する。reloadの条件は[画面復帰](client-flows.md)。

根拠：[HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)、現行API/NET/PWA要件。実HTTP/プロキシ/ブラウザー試験は未実施。
