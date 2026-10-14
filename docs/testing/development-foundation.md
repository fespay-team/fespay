# 開発基盤の検証記録

実施日：2026-10-13。対象：Issue #11、development-foundationの実装（PR #15時点の検証記録）。運用DB・実利用者データは使用しない。

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

[CI run 38375832365](https://github.com/fespay-team/fespay/actions/runs/38375832365)はce9bf809a9762ad55323ee0968bf36887bec98e7で全4job成功。最終head 3cbd03cの[run 38376441902](https://github.com/fespay-team/fespay/actions/runs/38376441902)も全4job成功し、KawataKenshirouの承認後にPR #15を2026-10-14に375b56dへマージ済み。Linux/macOS/Windowsで型/build/基本試験、Linuxで設計/DB/auth統合を実行する。ワークフロー作成をCI成功の証拠にしない。

PR #15時点では実メール/Google/TOTP・FesPayのCSRF/業務MFAアダプター・金銭/注文/在庫handler・実ブラウザー/性能/復旧/運用migrationは未実施だった。後続PR #19/#23で[session/CSRF](auth-session-adapter.md)と[認証手段一覧](auth-identity-list.md)の部分統合を実証済み。担当割当#12は完了、残る実装/受入は#13/#14。現在の通常8件/統合34件を、本報告の当時の4件/11件やAT全体の合格へ読み替えない。
