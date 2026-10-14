# 認証・追加認証API

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 設計採択済み / natuki53 / marron46（PR #8） |
| 更新日 / API ID | 2026-10-14 / A01、A02、A03、A04 |
| 関連要件ID | ACC-01、ACC-02、ACC-03、ACC-04、ACC-05、ACC-06、PRV-03、PRV-05、SEC-01、SEC-02、SEC-03 |
| 受入試験ID | AT-001、AT-002、AT-003、AT-004、AT-005、AT-006、AT-007、AT-063 |
| Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [PR #8（承認・マージ済み）](https://github.com/fespay-team/fespay/pull/8) / [ADR-0003](../../../adr/0003-api-authentication-and-command-boundaries.md)（採択済み） |

型・パス・必須値は[OpenAPI](../openapi.yaml)、再送/エラーは[共通規約](../common/conventions.md)を正本とする。Better Authの内蔵HTTP仕様をそのままFEへ公開する前提ではなく、FesPayのアダプター設計である。画面復帰は[クライアントフロー](../flows/client-flows.md)を参照する。

## 認証と追加認証

匿名画面もauth/contextを取得し、事前認証CookieとCSRF/Originで登録・ログイン・再設定を保護する。ログイン成功でsession Cookieを設定しCSRF文脈を交換する。確認/再設定メールはアカウント存在有無で同じ受付応答。PWは15〜128文字、trimやUnicode正規化をしない。秘密の本文・Cookie・tokenを監査の差分や冪等結果へ保存しない。

Googleの開始時にLOGIN/LINK/REAUTHENTICATEを指定し、公開flow_idを返す。callbackでは保存state/nonceと同じ文脈に束縛し、検証済みsubから本人を特定する。LINK/REAUTHENTICATEは5minの検証済みフローだけを生成し、開始時と同じ公開IDで照会して別の本人操作で単回消費する。メール一致だけの統合は拒否。本人の認証手段一覧にproviderと連携日時を返し、最後の有効手段を解除できない。

callbackのGETはブラウザー遷移用。成功時は302と必須Location（同一Originの許可ReturnPath）、Cache-Control: no-storeを返す。LOGINが通常認証を完了した場合だけsession Cookieを設定し、基盤がログインchallengeを要求する場合は事前文脈を維持する。戻り画面はauth/contextのANONYMOUS/LOGIN_CHALLENGE/AUTHENTICATED、または本人用Googleフロー照会から状態を取得する。メールログインの202を失っても同じ事前Cookieのcontextからchallengeへ復帰できる。具体的な順序・callback入力例外・戻り先の制限は[画面復帰](../flows/client-flows.md)。[静的検証](../validation/README.md)では、このGETの302契約を通常APIの2xx契約とともに確認する。HTTPクライアントやSDKでcallbackのJSON成功本文を待たない。

通常sessionは無操作7日/絶対30日。メール方式で登録済み因子のchallengeが発生したら、ログインAPIは202 LoginChallengeを返す。challenge完了前の文脈は金銭APIへアクセスできない。Googleログイン済みでも、チャージ/現金払戻し/購入返金は業務MFAを別に検証する。最大8h/無操作30min、特権操作はMFA確認から5min以内。TOTP30s/±1周期・再利用禁止、5失敗/5min後15min停止。回復コードは単回ハッシュで、再発行で旧コード全失効。

GoogleのみのTOTP登録をPW設定の強制に依存させない。PW identityがある時はcurrent_passwordを必要な登録/管理要求だけで検証し、基盤へ即時転送後破棄する。Googleのみの利用者には最近のGoogle再認証を要求する。これらのアダプター動作は採用版で検証する。因子と回復コードを両方失った場合のサポート手順は未決。

設計の採択記録・検証範囲は[API契約の索引](../README.md#設計段階と検証)、現在の実装担当は[担当表](../../../team/ownership.md)を参照する。設計採択と実装・受入の完了を区別する。
