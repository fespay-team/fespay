# ローカル開発と検証

開発基盤はPR #15で承認・マージ済み。Node.js 24、npm 11、Python 3.13+、Docker/Composeが必要。WindowsはDocker DesktopのLinux containerを使う。担当natuki53。Issue #16の認証文脈・本人session APIはPR #19でマージ済みで、[公開範囲と検証](../testing/auth-session-adapter.md)を参照する。Issue #21の[認証手段一覧](../testing/auth-identity-list.md)と追記migrationは実装レビュー対象。

## 初回

リポジトリルートで実行する。

```sh
npm ci
npm run setup:dev
docker compose up -d --wait db
npm run db:migrate:dev
npm run db:status:dev
npm run dev
```

setup:devは32byte乱数から`.env`を作り、既存ファイルは上書きしない。admin・app・認証secretは別の値。秘密は画面へ表示せずGitへ含めない。`.env.example`はキー一覧で、空欄のまま起動しない。ポートはFE 5173 / API 3000 / DB 54329、loopbackのみ。FEから/v1と/healthはVite proxyを通す。現在の画面は準備表示のみ、業務API/ログイン画面はIssue #13/14で実装する。

`http://localhost:5173/health/live`はプロセス、`/health/ready`は通常appのDB接続と業務/認証表を確認する。DB不通・未適用なら503。Better Authの生handlerは内部用。公開APIは認証文脈・本人sessionの照会/一覧/失効と本人認証手段一覧の5経路。未認証のcontext以外は、確認済み認証ユーザーと業務アカウントの対応付けが必要で、公開の登録/ログインは未実装。Secure cookieの実ブラウザー確認はHTTPS環境で行う。

## 検証

```sh
npm run typecheck
npm test
npm run build
python3 -m venv .venv
.venv/bin/python -m pip install -r docs/design/api/validation/requirements.txt
PYTHON=.venv/bin/python npm run test:integration
PYTHON=.venv/bin/python npm run check:design
.venv/bin/python docs/design/database/validation/verify_schema.py --image postgres@sha256:0780ef0827baebe99b75a7feb7d97110d6ec1e4df3e5c4ec5b9a5143ef90ac3a --output /tmp/fespay-db-results.json
```

Windows PowerShellではPythonを `py -3 -m venv .venv`、`.venv/Scripts/python.exe -m pip install -r docs/design/api/validation/requirements.txt` で用意し、`$env:PYTHON='.venv/Scripts/python.exe'; npm run check:design` を使う。DB制約試験もこのpythonで実行する。DB imageが未取得ならCompose upまたは同じdigestのdocker pullを先に行う。

test:integrationは新規tmpfs DB・loopbackの自動port・乱数資格情報を使い、finallyで専用containerを削除する。ComposeのDB/volumeや既存データに触れない。基盤のmigration/権限/認証試験に加え、セッションAPIのCSRF・本人分離・並行失効・期限・rollback・実応答のOpenAPI照合、認証手段一覧の本人分離/秘密非公開/公開UUID、旧schemaへの追記migrationと既存認証データの保持を確認する。配送URLはfixtureのメモリに保持し外部へメールを送らない。PythonはPYTHON指定、macOS/Linuxの.venv/bin/python、python3の順に探す。Windowsは上記のPYTHONをtest:integrationにも指定する。実メール/Google/TOTP再利用・業務MFA成立・実ブラウザーはIssue #13に残る。

GitHub ActionsはLinux/macOS/Windowsの型/build/基本試験、Linuxの設計/API/DB/認証統合を同じlockfileで実行する。ワークフローを追加したことだけでは成功と呼ばず、対象headの実行結果をPRへ記録する。

## 終了・再開

devはCtrl+C、DBは `docker compose stop db`。再開は `docker compose up -d --wait db`。データを残す場合はstopを使う。ローカルデータの破棄が必要なときだけ明示してvolumeを削除する。共有/本番の資格情報や運用DBには開発migrationを使わない。

## Dockerだけで起動する場合

チームの各PCでFE/API/DB/HTTPSを揃える方法と共有ステージングの配置手順は、[各PC用Dockerと共有ステージング](docker-environments.md)を参照してください。
