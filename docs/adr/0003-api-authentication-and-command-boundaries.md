# ADR-0003：認証入口と業務コマンドの境界

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 提案 / natuki53 / FE・BE・DB担当（未割当） |
| 日付 | 2026-10-09 |
| 関連要件 / 受入試験 | ACC-01～06、SEC-01～03/07/10、TX-01～06、INV-01～04、ORD-01～05、EXP-01～03 / AT-001～007、025～040、048～053、059 |
| Issue / PR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) |

## 背景

[基本設計](../design/basic-design.md)のAPI一覧は論理パスで、認証基盤のHTTP仕様、QRの消費と会計確定、イベント作成の再送等は未具体化。[詳細設計](../design/detailed-design.md)はBetter Authを基盤とするが、業務MFA・残高保有退会・暗黙連携禁止はアプリ側で守る必要がある。[OpenAPI](../design/api/openapi.yaml)を全領域のレビュー用契約として揃えるため、次を提案する。承認済みの要件変更ではない。

## 提案

1. `/v1/auth`はFesPayのアダプター契約とする。Cookie名を`__Host-fespay.session`、Secure/HttpOnly/SameSite=Lax/Path=/、Domainなしとする。同一Originで配信し、GET auth/contextからセッションに束縛した同期CSRFトークンを発行。匿名入口は別の事前認証Cookieに束縛する。更新時はCSRFヘッダーとOriginを両方検証。OAuth callbackは保存したstateと文脈で検証する。
2. Googleは認可コードフローを用い、LOGIN/REAUTHENTICATE/LINKを開始時に区別する。state/nonce・PKCE S256を採用する案。本人・intent・戻り画面をサーバーで固定し、連携は検証済みフローの単回参照と既存側再認証を経て明示確定する。メール一致の自動統合を無効化する。
3. 通常ログインと業務MFAを別状態にする。メール方式の登録済み因子によるログインchallengeを202で返せる契約を追加。業務MFAはGoogle経由でも業務APIが検証する。信頼端末Cookieは業務MFAの代用にしない。
4. TOTP登録/管理はGoogleのみの利用者にも対応する。PW identityがある場合は基盤APIに必要なcurrent_passwordを、その要求で検証・転送後に破棄する。最近の再認証を理由にPW原文を保存しない。Googleのみは最近のGoogle再認証とpasswordless設定で処理する案。因子紛失時には単回回復コードも使える。
5. 秘密を発行するQR/招待/受取コードと認証操作は、金銭コマンドの長期冪等記録から分ける。秘密を再表示する結果キャッシュを持たず、再発行・単回消費・自然一意を使う。招待秘密はURL fragment→POST本文、受取秘密の生成はPOST。基盤の設定/実挙動は統合で検証する。
6. 金銭確定T02はチャージ完了、支払要求承認、譲渡、払戻し、購入返金、訂正、期限到来失効へ分解する。操作種別・任意宛先・額で残高を書き換える汎用POSTは設けない。Q02とO01は同じfinalizePaymentと支払要求の自然一意制約を使い、異なる経路/キーでも二重引落しを防ぐ。
7. イベント内コマンドのキーscopeはactor/event/operation/keyを維持。イベント作成、サービス制御、公開ゲート記録はGLOBAL scopeと専用の本人結果照会を追加する。金銭/在庫に加え管理の版付き更新も元キーへ復帰できる。結果は元対象の参照と現在状態を返し、認可を毎回再検証する。
8. 論理案からのHTTP具体化として、更新/解除は200で現状態を返す経路も採用する。CSV受付/失効バッチは202でjobを返す。照合の差異は200のbalanced=falseで表し、安全停止/案件処理を別記録とする。金銭成立はCOMMIT後にだけ返す。

## 追加の具体値

| 値 | 根拠・位置付け |
| --- | --- |
| メール確認24h、PW再設定30min、通常session7日/30日、TOTP30s/±1周期 | 詳細設計の既存補完を継承 |
| 最近の本人再認証5min、OAuth検証フロー5min、ログインchallenge10min、TOTP登録準備10min | API案。業務MFA8h/無操作30min・特権5minの要件を変更しない |
| QR乱数256bit、受取QR300s、回復コード10個、カーソル30min | API案。受付/B60s・A300s・譲渡300s・承認/予約180sは現行要件から継承 |
| 画像5MB＝5,000,000bytes、再エンコード長辺2048px | 詳細設計の画像条件を具体化する案。デコード資源上限の実値はBE検証対象 |
| 状態/取引enum・公開UUID・GLOBAL結果記録 | HTTP DTOの案。物理enum/型/保持実装はDB担当のレビュー対象 |

## 影響とレビュー条件

FEはauth/context、未完了ログインchallenge、明示再発行、元キー照会、領域状態を使う。BEはBetter Authの具体版・SDK・DB adapterを固定し、上記契約へ変換する。基盤の連携・削除HTTP経路は許可したFesPayの認可処理を通す。DB担当はGLOBALキー、単回消費、支払要求の自然一意、削除と法定保存の分離を確認する。

自動失効workerについて、主催者が設定した条件と特権MFA承認をどう保存/再確認して起動するかはBEレビューを要する。公開APIの失効実行は現主催者の特権MFA必須とし、API案だけで自動実行の認証方式を承認済みにしない。

採用版の認証基盤でGoogleのみのTOTP登録/解除、PW必須経路、Cookie、OAuth challenge、再認証・失効を実証し、FE・BE・DBのレビューを得て決定する。DDL・アプリ実装・性能達成をこのADRで宣言しない。

## 参照

Better Authは[Cookie名/属性のカスタマイズ](https://better-auth.com/docs/concepts/cookies)を提供する。[2FAの公式資料](https://better-auth.com/docs/plugins/2fa)はpasswordless登録の明示設定と、OAuthログインが既定ではcredentialログインと同じ2FA制限を受けないことを説明している。このため業務側のMFA検証を必須にする。Googleの[OpenID Connect資料](https://developers.google.com/identity/openid-connect/openid-connect)に従いsubを識別子に用い、署名/iss/aud/exp/nonce等を検証する。これらは2026-10-09確認で、具体版を固定した統合試験は未実施。

承認者・日付・PR：未記入。
