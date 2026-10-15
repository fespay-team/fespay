# 各PC用Dockerと共有ステージング

関連要件：DEV-02、ARC-02/03。準備担当：natuki53。
状態：Docker構成を実装し、2026-10-14にIntel自宅サーバーへ共有ステージングを配置済み。mainへの取り込みは作者以外のPRレビュー対象。

各PCの開発環境と、チーム共通の検証環境を分ける。FE・API・PostgreSQL・HTTPS入口をDocker Composeで起動し、PC間でDBや秘密値を共有しない。既存のホストNode用 `compose.yaml` と [開発手順](development.md) も利用できる。

## 各PCで起動

Docker Desktop（LinuxはDocker Engine）とCompose v2の `--wait` 対応版、Gitを用意する。Node.js/npmをホストへ入れずに起動できる。イメージの取得にはネット接続とディスク容量が必要。

macOS/Linuxではリポジトリのルートで実行する。

```bash
./scripts/docker-env.sh local up
./scripts/docker-env.sh local certificate
```

WindowsではDocker DesktopをLinuxコンテナーで起動し、PowerShellで実行する。

```powershell
./scripts/docker-env.ps1 -Mode local -Action up
./scripts/docker-env.ps1 -Mode local -Action certificate
```

初回は `.env.docker.local` に独立した秘密値を生成し、DBが応答してから3件の採択済みmigrationを適用する。続いてAPI/Web/入口の正常起動を待つ。既存のenvを上書きせず、再実行時はmigrationのIDとchecksumを照合する。

URLは `https://localhost:8443`。APIも同じoriginの `/v1/*`、状態確認は `/health/live` と `/health/ready`。FE/APIのソース変更はコンテナーへ反映する。依存やDockerfileを変更した場合は `local up` を再実行してbuildする。

### ローカルHTTPSの信頼

`certificate` は `.tmp/fespay-local-root.crt` にそのPCの公開CA証明書を取り出す。初回は利用者自身が以下で確認・登録し、ブラウザーを再起動する。

- macOS：キーチェーンアクセスへインポートし、対象証明書のSSL信頼を設定する。
- Windows：証明書管理の「現在のユーザー／信頼されたルート証明機関」へインポートする。
- Linux：利用するOS/ブラウザーの証明書管理へインポートする。

OSの信頼設定は起動スクリプトから変更しない。秘密CAはDocker volume内に保持し、チームへ配布しない。各PCの公開CAも異なるため、別PCのCAを代用しない。入口volumeを作り直した場合は古い証明書を削除し、新しい証明書を確認する。8443の使用中エラーは `.env.docker.local` の `FESPAY_HTTPS_PORT` と `APP_ORIGIN` を同じ新ポートへ合わせてから再起動する。

## 共有ステージングの配置

URLは `https://fespay-staging.mu-natuki.com`。2026-10-14はIntel機のCPU負荷、空きメモリ・ディスク、Dockerと既存ポートを確認して配置した。Ryzen機のSSHは未疎通で、比較結果には数えない。配置先と公開疎通の実績はこの構成のローカル試験と分けて記録する。

サーバー上に専用checkoutを用意し、レビューしたcommitを固定する。既存サービスのディレクトリやCompose projectを流用しない。既定projectは `fespay-staging`、DB名は `fespay_staging`。同じホスト上の各PC用projectと分離される。複数checkoutで同じproject名を同時起動しない。

### 既存HTTPS入口／Cloudflare Tunnelを利用

自宅サーバーでは既存の入口を利用する構成を既定にする。

```bash
./scripts/docker-env.sh staging setup https://fespay-staging.mu-natuki.com
./scripts/docker-env.sh staging up
./scripts/docker-env.sh staging status
```

`compose.docker.yaml` と `compose.tunnel.yaml` を使用し、公開するコンテナーポートは **そのサーバーの `127.0.0.1:18080`** のみ。DB/APIをホストへ公開しない。Cloudflare Tunnel/既存HTTPSリバースプロキシの新しいhostルートをこの入口へ向ける。Tunnelが別コンテナーなら `localhost` はそのコンテナー自身を指すため、この設定へ直接接続できない。サーバー上のプロセスとして入口に接続するか、別途専用ネットワークを設計する。

外側の入口にはDNS、対象hostnameの有効なHTTPS証明書、WebSocket転送が必要。外側で使う `Authorization` ヘッダーを削除・上書きすると、この構成のBasic認証へ到達できない。外部からHTTPだけで公開しない。公開APIのoriginは `.env.docker.staging` の `APP_ORIGIN` と一致させる。

検証用Basic認証のユーザーは `fespay-team`。初回生成したパスワードはサーバーの `secrets/staging-viewer-password.txt` にのみ保存し、envにはbcrypt hashを保存する。パスワードはチームの承認済み秘密共有経路を使い、Issue/PR/チャット本文へ貼らない。Basic認証はステージング入口の保護であり、業務accountのログインや権限を代行しない。

専用のCloudflare Tunnelを新設する場合は、`compose.cloudflare.yaml` を追加できる。専用TunnelのJSON資格情報を `secrets/cloudflared.json`、[設定例](../../infra/docker/cloudflared.yml.example)を埋めた設定を `secrets/cloudflared.yml` に配置する。Linuxサーバーでは `.env.docker.staging` に `FESPAY_TUNNEL_UID` / `FESPAY_TUNNEL_GID` としてそのファイルの所有者の `id -u` / `id -g` を指定する。秘密ファイルは600、ディレクトリは700を維持し、connectorも同じ非root UID/GIDで実行する。対象hostnameのDNSを専用Tunnelへ向け、次を実行する。

```bash
docker compose --env-file .env.docker.staging -f compose.docker.yaml -f compose.tunnel.yaml -f compose.cloudflare.yaml up -d --wait tunnel
```

専用connectorはCompose内部の `gateway:8080` に接続する。設定が置かれた後は起動スクリプトもこの3ファイルを利用し、`staging up/down/logs/status` で専用connectorを含めて管理する。既存Tunnel/サービスを再起動しない。

### サーバーで直接HTTPSを終端する場合

既存入口を使わず、そのサーバーが80/443を利用でき、対象DNSが到達可能な場合に限り `compose.staging.yaml` を使う。

```bash
docker compose --env-file .env.docker.staging -f compose.docker.yaml -f compose.staging.yaml build api web migrate
docker compose --env-file .env.docker.staging -f compose.docker.yaml -f compose.staging.yaml up -d --wait db
# 更新時は下記バックアップ手順を先に行う
docker compose --env-file .env.docker.staging -f compose.docker.yaml -f compose.staging.yaml run --rm migrate
docker compose --env-file .env.docker.staging -f compose.docker.yaml -f compose.staging.yaml up -d --wait api web gateway
```

Caddyが対象hostの証明書を取得する。DNS/外部ポート/TLSは実際の配置先で確認する。既存の80/443利用サービスを停止して置き換えない。既定の `staging` スクリプトはTunnel用なので、この直接公開方式と混用しない。

## 更新・停止・復旧

通常の更新はレビュー済みcommitへ更新して `staging up`。新しいイメージをbuildした後、DBを確認し、migrationの**前**に `secrets/staging-backups/<UTC日時>.sql` へ `pg_dump` を保存する。バックアップに失敗すると適用を止める。DB owner資格情報でバックアップし、APIには権限を限定した `fespay_app` の接続先だけを渡す。

`local down` / `staging down` はコンテナーとネットワークを停止・削除し、DBとCAのvolumeは保持する。スクリプトは `down -v` を実行しない。envを削除して別の秘密値を生成すると既存DBのowner passwordと一致しなくなるため、envとvolumeはセットで保管する。設定とバックアップはGit/build contextへ含めない。サーバー外へのバックアップ保管・定期取得・保持期限は配置後の運用として決める。

復旧時は新しいDB/専用projectへ検証用dumpをrestoreし、migration状態、API readiness、データを照合する。旧SQLと新アプリの互換性を確認せずにvolumeを上書きしない。自動的な本番rollbackや本番migrationには使用しない。

Docker migrationはDBのnetwork namespaceを共有し、`127.0.0.1:5432`、owner、local/stagingのDB名、明示フラグを検査する。既存のホスト開発migrationのloopback制限は維持する。変更済みchecksum、不明migration、本番名、リモート接続を拒否する。

### Windowsでmigrationがchecksum不一致になる場合

SQLをCRLFでチェックアウトすると、manifestに記録されたLFのSHA-256と一致せず、DB接続前にmigrationが終了する。Dockerのbuildはホスト上のSQLをそのままコピーするため、コンテナー内でも不一致になる。`.gitattributes` の `*.sql text eol=lf` でSQLの改行を固定する。

以前のチェックアウトでSQLがCRLFのまま残っている場合は、エディターで `docs/design/database/sql/initial-schema-draft.sql` と `database/migrations/*.sql` をLFで保存し、`./scripts/docker-env.ps1 -Mode local -Action up` を再実行する。イメージが再buildされてmigrationが再実行される。manifestのchecksumやDB volumeを変更・削除する必要はない。

## 検証範囲

```bash
npm run test:docker
```

生成した一時project/volumeだけでlocalとstagingを試験し、最後にその試験資源だけを削除する。HTTPS CAを試験プロセスにのみ読み込み、OSの信頼ストアは変更しない。チェックは次の範囲。

- DB/APIの未公開、入口のloopback限定、APIへ管理者資格情報を渡さないこと。
- migrationの初回・反復適用、3件の履歴、API/Webの起動とAPI再起動後の復帰。
- FE表示、readiness、匿名認証文脈、Secure/HttpOnly/SameSite Cookie、異origin拒否。
- staging入口のBasic認証：資格情報なし401、資格情報あり200。

GitHub ActionsではLinuxのDocker試験、Linux/macOS/Windowsのworkspace検証、WindowsのPowerShell構文を確認する。各OSのDocker Desktop操作、手動のCA登録、自宅DNS/外部TLS/停電復旧/バックアップrestoreは別途検証する。固定digestのNode/Caddy/PostgreSQLイメージはamd64/arm64対応のmanifestを参照する。

現時点のWebは開発基盤画面、APIは部分実装。公開メール登録・Google OAuth・業務MFA・金銭機能の受入完了を示す構成ではない。実利用者・実金銭・本番DBを投入しない。

## 初回配置の記録（2026-10-14）

関連：[Issue #33](https://github.com/fespay-team/fespay/issues/33)。準備・管理窓口：natuki53。

| 項目 | 結果 |
| --- | --- |
| 配置先 | Intel自宅サーバーの専用ディレクトリ `~/services/fespay-staging` |
| 実装commit | `60c7d55`。以後の文書・CI更新は同じ実装へ記録を追加 |
| 構成 | 専用project `fespay-staging`、DB/API/Web/入口/専用Tunnelの5サービス |
| 公開経路 | 専用Tunnelへ新しいサブドメインを追加。既存Tunnelと80/443サービスは変更しない |
| データ分離 | 共有DBのvolume、app/owner/認証secretとBasic認証を各PCから独立して生成 |
| 公開確認 | 有効なHTTPS証明書、認証なし401、Basic認証後のFE/live/ready/contextが200、匿名文脈とSecure/HttpOnly/SameSite Cookie |
| DNS | Cloudflare/Googleの公開DNSで名前解決を確認。作成前のNXDOMAINが残る端末では反映待ちになり、公開確認では現在の公開DNS回答を使用 |
| 復元確認 | 配置直後のdumpを一時DBへ復元し、業務/認証60表とmigration履歴3件を照合。一時DBだけを削除 |
| 更新確認 | `staging up` の再実行、適用前バックアップ、migration反復、専用connectorを含む正常起動 |
| 各PC側 | macOS上でlocal/staging隔離Docker試験、非rootの秘密生成と再生成拒否、PowerShellランチャーのlocal起動・公開CA取出しが成功 |

Dockerサービスの自動起動が有効で、各サービスの再起動設定を付けた。実際のホスト再起動・停電・遠隔バックアップ保管・実データ復旧は未検証。Windows実機のDocker Desktop/CA登録も未検証。基盤の試験を業務受入試験の合格へ転記しない。
