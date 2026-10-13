# 認証・通信断・画面更新の復帰

状態：API設計案、FE/BEレビュー前。担当：natuki53。更新日：2026-10-09。
要件：ACC-01～05、SEC-01～03、TX-03～05、NET-02/04、PWA-01/02。受入：AT-001～007、036～038、059/060/062。
[Issue #7](https://github.com/fespay-team/fespay/issues/7) / [ADR-0004](../../adr/0004-api-client-recovery-and-wire-contracts.md)。

## 認証の復帰

auth/contextはauthentication_stageとauthenticatedを一致させる。ANONYMOUSは未ログイン、LOGIN_CHALLENGEは通常session未発行、AUTHENTICATEDだけ本人APIへ進める。LOGIN_CHALLENGEは同じ事前認証Cookieに束縛したchallenge_id/methods/expires_atを返す。メールloginの202が失われても復帰でき、PW/コードを保存して再送しない。

Google開始応答の公開flow_id・intent・許可return_pathだけをタブ内に保存する。authorization_url/state/code/nonce/PKCE/アクセストークンをログ/解析/長期保存しない。サーバー生成のGoogle認可URLへブラウザーを遷移させる。

| intent | callbackと戻り画面 |
| --- | --- |
| LOGIN | state/事前文脈を単回検証。通常ログインならsession、基盤がchallengeを要求する場合は事前文脈だけを保存して302。戻り画面context→必要時challenge完了→getMySession。通常sessionと業務MFAを区別 |
| LINK | 開始本人session・既存側再認証に束縛。短命検証フローを保存して302。GET flows/{開始flow_id}のverified_flow_id（同じ公開ID）で本人確認→linkMyIdentity confirmed=true。メール一致の統合なし |
| REAUTHENTICATE | 開始本人/intent/既存identityに束縛。同じflow_idを照会し、reauthenticateGoogleで単回消費。他identity/actorへ流用しない |

codeとerrorは片方だけ、state必須。欠落/両方/重複は422 OAUTH_RESPONSE_INVALID。未検証state/不一致Cookieから任意return_pathへ遷移せず、callback画面で秘密を含まないエラーを案内し新フローへ。検証済み拒否もstate再使用不可。

[OAuth 2.0の認可応答](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1.2)に合わせ、この外部callbackだけは未知の拡張queryを32項目以内・1値2,048文字以内で無視する。scope等を本人/権限/issuer/戻り先の根拠にしない。queryは通常ログに残さず、同名重複はマップ化前に拒否する。業務APIの未知query拒否は維持する。

開始タブ/IDを失ったLOGINはcontextから本人状態へ復帰できる。LINK/REAUTHENTICATEは本人一致を推測・フロー列挙せず新しく開始する。検証済み5分の期限後は404、消費の繰返しで連携/再認証時刻を更新しない。再ログイン後はCSRFも取り直す。

return_pathは英数/underscore/hyphen/slashだけでquery/fragment/percent/backslash/controlを拒否し、最終OriginとFEルート許可リストもサーバー確認する。秘密を戻りURLへ継承しない。Better Auth固定版でGoogleのみTOTP・OAuth challenge・Cookie失効を接続する方法はBE統合に残す。Googleにも追加ログインchallengeを強制する製品方針はレビューで決定し、既定挙動を理由に業務MFAを省略しない。

## 通知と正本

SSE接続世代と対象GET世代をFE内で管理する。event/actor切替・再ログイン・権限解除・通信切替時は世代を交換し、古い通知/GETを適用しない。UUIDを順序比較せず、同一対象versionは精度を失わない整数比較にする。

1. stream接続→通知受入→初回正本GETの順に開始する。
2. 取得中の通知を対象別dirty集合へまとめる。取得終了後、dirty対象をもう一度GETする。
3. 後から開始したGETの値を、遅い古いGETで上書きしない。同一対象versionも確認する。
4. 初回/再接続/resync/前面復帰では、表示中リソース・未確認一覧も取得する。

resyncだけで正常値受信とせず、GET成功までchecked_atと更新中/通信不可を表示する。未知event/typeを金銭成功にせず、接続作直しと許可された正本取得へ。[events.md](events.md)の送信前/再配信時の現在認可を維持する。

| 状態 | FE動作 |
| --- | --- |
| 正常 | heartbeat20秒案。残高/結果2秒・注文5秒目標は性能試験対象 |
| EventSource error | statusを推測しない。閉じてオンライン時にcontext/現在event資格をGET確認して再接続 |
| 匿名/資格拒否 | 業務stream/ポーリング停止、再ログイン/担当変更へ。reasonに他者情報なし |
| 断/503 | 再接続1→2→5→10→30秒、最大30秒＋0～1秒jitter案。429のRetry-After以上待つ |
| SSE不可 | 前面だけ正本ポーリング。残高/未確認は2秒→5秒規約、注文5秒、1対象1GETでまとめる |
| background/offline | 新規金銭/通知/不要な照会停止、未送信POSTキューなし。復帰時に世代交換→接続→正本取得 |

ネイティブEventSourceは同一オブジェクトの再接続でLast-Event-IDを扱う。閉じて新しく作る時に過去UUID/秘密をURLへ入れず、新規接続＋正本取得に戻る。保持期間/配送位置はDB・BE調整で、保証できなければresync。HTTP開始後にJSONエラーをSSEへ混ぜない。

## 結果不明と画面更新

送信前にactor/event/operation/key/対象IDを未確認記録へ保存する。本文・QR/認証秘密は永続保存しない。再読込後は元キーGETから復帰し、再送は同じ入力を本人が再確認できる場合だけ。失った秘密を推測してPOSTしない。ログアウト時に個人表示を消し、記録を別actorへ流用しない。

| 更新時の状態 | 動作 |
| --- | --- |
| 未送信/通常閲覧 | 下書き喪失を案内し利用者操作で更新。自動送信なし |
| POST中/10秒未応答/PENDING/UNKNOWN | 自動reloadなし。元キー照会と復帰情報保存を維持 |
| 現金受領/交付中/交付不明 | 自動reloadなし。RECOVERYで完了/調査/引継ぎ、正本と物理受渡しを確認 |
| CLIENT_UPDATE_REQUIRED | 新規CURRENT停止、GET/RECOVERYを継続。未確認/現金が解消してから利用者操作で更新 |
| SUCCEEDED/最終REJECTED確認後 | 元対象IDを保持して更新し同じ正本へ。受取待ち注文とPOST送信中を混同しない |

HTTPタイムアウト/SSE/更新案内は成立証明ではない。prepare/申出/job受付と最終金銭完了を区別し、[HTTP互換性](http-contract.md)の旧版許可も認可/MFA/状態を省略しない。

根拠：[Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect)、[EventSource仕様](https://html.spec.whatwg.org/multipage/server-sent-events.html)。実ブラウザー/認証基盤試験は未実施。
