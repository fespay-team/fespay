# ADR-0005：ローカル開発と検証の基盤

- 状態：実装準備案。新しいPRでレビューする。
- 日付：2026-10-13
- 担当：natuki53（ユーザー指定）
- 関連：DEV-01/02、ARC、ACC/SEC、LED/DAT / [Issue #11](https://github.com/fespay-team/fespay/issues/11)

## 判断と理由

採択済みの単一repoとReact + Vite / Hono + Node.js / Better Auth / PostgreSQLを使う。npm workspaces（apps/web、apps/api）、Node.js 24 LTS、npm 11.5.1、exact依存とpackage-lock.jsonでnpm ciを再現する。

初期候補：React 19.3.0、Vite 8.3.4、Hono 4.13.13 / node-server 2.1.5、Better Auth 1.7.7、pg 8.23.1 / Kysely 0.29.6、TypeScript 7.0.2。PostgreSQLは設計検証と同じ16.12 image digest。根拠：[Node LTS](https://nodejs.org/en/about/previous-releases)、[Hono Node](https://hono.dev/docs/getting-started/nodejs)。

開発DBはloopbackだけ公開し、admin/migrationと通常appの資格情報を分ける。認証はauth schema、業務はpublic、migration履歴はmeta schemaへ分離する。[Better AuthのPostgreSQL接続](https://better-auth.com/docs/adapters/postgresql)に従い、固定版から認証SQLを生成する。業務SQLは採択資料をmanifest参照し、二重コピーしない。

開発migrationは明示development flag、loopback、fespay_dev / fespay_test_* DBに限定する。checksum、advisory lock、migrationごとのTxで再実行・並行適用を制御する。通常appにDDL/meta更新権限を与えない。金銭履歴を消すdown migrationを作らず、開発DB再作成と運用rollbackを分ける。

認証は内部factoryと隔離DB検証に限定する。FesPayの/v1/authへ生handlerを公開しない。session CookieはSecure/HttpOnly/SameSite=Lax/Path=/、Domainなし。Cookie cacheを使わず失効を毎回確認し、メール一致の暗黙連携を禁止する。[Cookie設定](https://better-auth.com/docs/concepts/cookies)、[アカウント連携](https://better-auth.com/docs/concepts/users-accounts)、[2FA](https://better-auth.com/docs/plugins/2fa)を参照。Googleのみの因子操作は最近の本人再認証を行う業務アダプターとセットで検証する。

## 比較・検証・残件

別package managerよりNode同梱npmの小さなworkspaceを選ぶ。全サービスのDocker化より、ホストNode + DB Composeで編集時の待ち時間を抑える。CIは同じlockfile、型/build、設計/DB/認証試験を実行する。

このADRは新しい準備案でPR #8/#9の承認を流用しない。実メール/Google、TOTP再利用/回復コード/試行制限、業務MFA/CSRF/Origin、運用migration/rollback、性能/復旧は#13/#14へ引き継ぐ。
