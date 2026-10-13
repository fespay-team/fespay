# 開発基盤の検証記録

実施日：2026-10-13。対象：Issue #11、development-foundationの準備案。運用DB・実利用者データは使用しない。

## ローカル実施結果

macOS arm64、Node.js 24.7.0 / npm 11.5.1、PostgreSQL 16.12、Better Auth 1.7.7で実施。

- npm install / audit：high以上を含め報告脆弱性0。lockfileを保存。
- 型検査・API/FE build：合格。
- 基本試験4件：開発migration対象の制限、設定の秘密/HTTPS条件、DB障害時503と非反射、未実装/生認証routeの非公開を確認。
- DB/auth統合：runnerの11件合格（親test1件と確認項目10件）。初回pending、適用/並行再実行、checksum不一致、appのDDL/meta拒否、固定版schema、未確認メール、Cookie/パスワード、外部Origin、session削除、sign-outを確認。
- API：schema378件、wire69件、171操作/58論理ID/62キー操作の静的照合、lint0エラー/警告/無視。故意に壊した13件も検出。
- DB設計：通常app権限の104ケースと2接続競合合格。更新した[証跡](../design/database/validation/review-evidence.json)の対象hashを保存。
- Composeによる初回migration→再実行→status、FEのHTML応答、/health/live・readyの200、DB停止時ready503/live200、再開時ready200、API/FE終了と専用検証DBの片付けを確認。

基盤試験でBetter Authの自動__Secure-と明示__Host-が重なる問題を確認し、名前の自動prefixだけを止めて全CookieのSecure属性を明示した。契約名・HttpOnly・SameSite=Lax・Path=/・Domainなしを実応答で再検証した。

## CIと受入境界

GitHub Actionsの対象headの結果はPRへ記録する。Linux/macOS/Windowsで型/build/基本試験、Linuxで設計/DB/auth統合を実行する。ワークフロー作成をCI成功の証拠にしない。

実メール配送・Google本人認証・TOTPの再利用/試行制限/回復コード、FesPayのCSRF・業務MFAアダプター、金銭/注文/在庫handler、実ブラウザー・実機/性能/復旧・運用migrationは未実施。Issue #12～14へ引き継ぎ、受入管理表を合格へ変更しない。
