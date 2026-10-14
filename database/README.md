# 開発用migration

状態：Issue #11 / PR #15で採択済みの開発専用migration。PR #23で認証手段の公開UUIDを追記。運用DBには適用しない。

`migrations/manifest.json`は採択済みの業務設計SQLと、固定版Better Authの生成SQLの参照・SHA-256を保持する。業務SQLのコピーを作らない。0002は初期の認証設定から生成したSQL。初期生成スクリプト `apps/api/tools/generate-auth-schema.ts` は0002-auth.sqlを直接上書きするため、適用済みの作業checkoutで再実行しない。新しい設定の差分確認が必要な場合は隔離checkoutで生成し、追記migrationとしてレビューする。追加fieldの差分は0003へ追記済み。既存の適用済みmigrationの内容/順序/IDは変更せず、差分は次のmigrationへ追加する。

`npm run db:migrate:dev`は明示development flag、非production、loopback接続、fespay_dev/fespay_test_* DB名だけを受け付ける。URLの追加接続optionは受け付けない。source checksumと適用済みchecksumを照合し、advisory lockとmigration単位のTxで初回・再実行・並行適用を制御する。`npm run db:status:dev`は適用前もpendingを返す。

通常appはpublic/authのDMLだけを持ち、public/authのDDLやfespay_metaの履歴操作はできない。migration用資格情報はAPIプロセスへ渡さない。設計SQLの外側BEGIN/COMMITはrunnerが管理するTxに置き換える。認証schemaは業務accounts/account_profilesを複製しない。

将来の運用migrationでは認証アダプター/本人認可、移行対象・backup・段階適用、WAL/PITR復旧、金銭不変条件/排他/負荷、保持/削除再適用、通常app権限を実証してから昇格する。成立履歴を削除/書換えするdown SQLは提供しない。ローカルDB再作成は運用rollbackではない。

起動は[開発手順](../docs/operations/development.md)、未実証と担当は[開発計画](../docs/project/development-plan.md)。
