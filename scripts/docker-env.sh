#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mode="${1:-local}"
action="${2:-up}"
case "$mode" in local|staging) ;; *) echo 'Usage: docker-env.sh local|staging setup|up|down|logs|status|certificate [origin]'; exit 2;; esac
case "$action" in setup|up|down|logs|status|certificate) ;; *) echo 'Unknown action'; exit 2;; esac
env_file=".env.docker.$mode"
if [[ "$action" == setup || ( "$action" == up && ! -f "$env_file" ) ]]; then
  docker build --quiet -f infra/docker/Dockerfile.setup -t fespay-setup:local . >/dev/null
  setup_args=("$mode")
  if [[ -n "${3:-}" ]]; then setup_args+=(--origin "$3"); fi
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" fespay-setup:local "${setup_args[@]}"
  if [[ "$action" == setup ]]; then exit; fi
fi
if [[ "$mode" == local ]]; then override=compose.local.yaml; else override=compose.tunnel.yaml; fi
compose=(docker compose --env-file "$env_file" -f compose.docker.yaml -f "$override")
services=(api web gateway)
if [[ "$mode" == staging && -f secrets/cloudflared.yml ]]; then
  [[ -f secrets/cloudflared.json ]] || { echo 'Dedicated tunnel credentials are missing'; exit 2; }
  compose+=(-f compose.cloudflare.yaml)
  services+=(tunnel)
fi
case "$action" in
  up)
    "${compose[@]}" build api web migrate
    "${compose[@]}" up -d --wait db
    if [[ "$mode" == staging ]]; then
      mkdir -p secrets/staging-backups
      "${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "secrets/staging-backups/$(date -u +%Y%m%dT%H%M%SZ).sql"
    fi
    "${compose[@]}" run --rm migrate
    "${compose[@]}" up -d --wait "${services[@]}"
    ;;
  down) "${compose[@]}" down;;
  logs) "${compose[@]}" logs --tail 100 "${services[@]}";;
  status) "${compose[@]}" ps;;
  certificate)
    [[ "$mode" == local ]] || { echo 'Local certificate only'; exit 2; }
    mkdir -p .tmp
    "${compose[@]}" cp gateway:/data/caddy/pki/authorities/local/root.crt .tmp/fespay-local-root.crt
    echo '.tmp/fespay-local-root.crt に公開CA証明書を保存しました。OSの信頼ストアへの登録は手順書を参照してください。'
    ;;
esac
