# 本人の認証手段一覧API

状態：Issue [#21](https://github.com/fespay-team/fespay/issues/21)は[PR #23](https://github.com/fespay-team/fespay/pull/23)で承認・マージ済み（2026-10-14、marron46、対象aef930d、main 17a2186）。担当natuki53。親Issue #13の一部で、採択済みOpenAPIの `listMyIdentities` に対応する。

## 実装範囲

`GET /v1/auth/identities` は現在のセッションと業務アカウントを確認し、本人のEMAIL_PASSWORD / GOOGLE、公開identity UUID、連携日時、checked_atだけを返す。queryで別人のaccount_idを指定できない。通常期限・停止/削除状態・no-store・共通ErrorはPR #19のセッションアダプターと共通。停止中の本人は認証手段を確認でき、DELETEDは401。

認証手段はBetter Auth 1.7.7の `auth.account` が正本。既存のuserId索引で本人へ限定し、3行まで取得して契約の1～2件・provider各1件を確認する。PW hashやOAuth tokenはSQLの取得列に含めない。内部IDやGoogle subjectは応答しない。未対応provider、空の手段、欠損credential、重複providerは503で停止し、GETで認証手段を補修・作成しない。

公開IDはBetter Authのaccount追加フィールド `fespayIdentityId` に保存する。入力と基盤JSONへの返却を禁止し、追加時のdefaultValueでUUID v4を生成する。`0003-identity-public-id.sql` は既存行にも別の公開UUIDを補完し、NOT NULL・一意・UUID形式をDBで保証する。IDを署名secretから導出しないため、secret交換や並行GETで変化しない。

## 開発DBの更新

```sh
npm run db:status:dev
npm run db:migrate:dev
npm run db:status:dev
```

既存の `0001-business` と `0002-auth` は書き換えず、checksum manifestへ0003を追記する。旧2件適用済みDBでは0003だけを適用する。認証基盤は起動時にschemaを確認するため、更新後に開発APIを再起動する。共有/本番のDBへ開発runnerを使わない。

公開UUID列は追加後の認証設定が必要とするので、列を削除するだけのrollbackは行わない。問題時はAPIを止め、コード/schemaの整合を保つ修正migrationをレビューする。本番での昇格/復旧手順はIssue #14の別工程であり、この追加を本番適用済みとは扱わない。

## 検証

[ローカル手順](../operations/development.md)のPython依存を用意し、`npm run typecheck`、`npm test`、`npm run build`、`npm run test:integration` を実行する。

通常8件、統合34件（既存24件＋今回10件、親testを含む）。今回の隔離PostgreSQL試験は旧schema/履歴の再現とUUID補完、既存user/session/hash/OAuth情報の保存、再実行/並行migration、UUID制約、実Better Authメール認証での本人一覧、Googleのみ/2手段のDTO、他者分離、並行GETとsecret交換後のID安定、匿名/失効/停止/削除/入力/不整合/DB障害を確認する。実応答21件は採択OpenAPIのIdentityList/Error・エラーコード・ヘッダーへ照合する（既存session分62件と合わせ83件）。

Google行はDB fixtureであり、実OAuth、本人による追加/解除、state/nonce/PKCE、最後の手段を解除できないことの実証は含まない。公開登録/login、MFA、退会、実ブラウザー等も親Issue #13に残す。AT-003全体の合格へ読み替えない。
