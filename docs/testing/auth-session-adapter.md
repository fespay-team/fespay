# 認証文脈と本人セッションAPIの実装・検証

状態：Issue [#16](https://github.com/fespay-team/fespay/issues/16)はPR #19で承認・マージ済み（2026-10-14、popoten0630-dev、309703c）。親Issue [#13](https://github.com/fespay-team/fespay/issues/13)の一部。担当natuki53。
基準はPR #8のOpenAPIとPR #9の業務schema、PR #15で固定したBetter Auth 1.7.7。PR #19ではAPI/DB設計原文とmigrationを変更していない。後続の[認証手段一覧](auth-identity-list.md)は別の実装・追記migrationとして管理する。

## 公開範囲

| operationId | 経路 | 今回の実装 |
| --- | --- | --- |
| getAuthContext | GET /v1/auth/context | 匿名のpreauth Cookieと同期CSRF、認証済みセッションに束縛したCSRF |
| getMySession | GET /v1/auth/session | 現在のアカウント・公開session UUID・通常/業務MFAの期限 |
| listMySessions | GET /v1/auth/sessions | 本人の有効セッションのみ、公開UUID、署名付きカーソルによるページ送り |
| revokeMySessions | POST /v1/auth/sessions/revoke | CURRENT / OTHERS / ALL、失効と監査を同一Txで確定 |

Better Authの生handlerは内部用のまま。公開の登録・ログイン・メール確認・Google・LOGIN_CHALLENGEは未実装。この段階で認証機能一式やAT-001～007の合格とは扱わない。ログイン画面とHTTPS実ブラウザー検証も親Issueに残る。

既存の `auth.user` と `accounts.auth_user_ref`、`account_profiles` の一致が前提。GETで業務アカウントを暗黙作成しない。対応付けがない、メールやプロフィールが公開契約と不整合なら503。公開の登録アダプターでの原子的な作成は後続作業。

## 保証する境界

- Better AuthでCookieの署名とDBセッションを確認し、Cookie cacheと自動refreshを使わない。業務Tx内でセッション・本人・アカウント状態を再確認する。
- 通常セッションは無操作7日・作成から30日をDBの現在時刻で判定し、期限切れを失効する。通常利用で更新するのは通常セッションの期限のみ。Cookieの有効期間も絶対期限以内にする。
- `auth_contexts.id` を公開UUIDへ変換し、認証基盤のuser/session IDや秘密をDTOへ出さない。bigintのアカウントversionは10進文字列を維持する。
- 業務MFAは保存済み時刻から最大8時間・無操作30分を計算する。今回のGETではMFA成立や業務活動を更新しない。TOTP・特権MFAの成立処理と業務権限チェックは後続実装。
- 停止中アカウントはLOCKEDとして本人セッションの確認・失効を許可する。DELETEDは401。これを金銭・注文の操作権限に読み替えない。
- preauthは通常ログイン資格に使えない。CSRFには用途を分離したHMACと期限を付け、匿名Cookieまたは現在セッションへ束縛する。失効要求は同一Originを必須とし、他セッションのCSRFを拒否する。
- 失効操作はRECOVERYなのでclient revisionの未指定/0を許可する。未知のscope/余剰フィールド/不正revisionは422。JSONのUTF-8・重複キー・数値・サイズ/深さ/要素数はHTTP契約に従う。
- 全操作でアカウント行→セッション行の順にロックする。同一人物の複数端末が互いのセッションを先に保持するデッドロックを避ける。失効と秘密を含まない監査記録を同一Txへ入れ、COMMIT後に応答する。
- セッション一覧は本人だけに限定し、カーソルの署名をアカウントへ束縛する。DBのマイクロ秒精度と公開UUIDを保持して同時刻の行をページ送りする。
- 成功/失敗ともno-storeと契約revisionヘッダーを返す。内部SQL・接続URL・例外をErrorへ反映しない。認証確認時のDB障害を匿名成功へ置き換えない。

## 再実行と証跡

[ローカル手順](../operations/development.md)のPython依存を用意し、リポジトリルートで実行する。

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

通常試験8件。統合試験は基盤11件と今回の13件、計24件（親testも含む）。Docker上の隔離PostgreSQLと通常app権限、実Better Authで実行する。テスト用ユーザーの登録/確認/ログインは内部handlerだけを使い、配送URL・Cookie・CSRFはメモリ内に保持する。

今回の試験は匿名文脈、Cookie属性/交換、公開DTO、MFA時刻の非更新、時刻が同じ行のページ送り、他人/改ざん/期限切れカーソル、Origin/CSRFのセッション束縛、3種の失効、2端末の同時ALL、7日/30日境界、停止/削除/未確認/未対応アカウント、監査失敗時のrollback、DB障害を含む。実handlerの応答をメモリ内で採択済みOpenAPIのschema・エラーコード・ヘッダーへ照合する。

CIは通常試験をLinux/macOS/Windows、DB統合をLinuxで実施する。対象headのCI結果と人のレビューはPRに記録する。実メール・Google・実ブラウザー・負荷・復旧・公開環境はこの試験の証跡に含まない。
