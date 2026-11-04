#!/usr/bin/env bash
# Put the farm images from before the last deploy back, or a named release.
#
#   bash rollback.sh            # back to :previous
#   bash rollback.sh 1a2b3c4d5e6f   # back to that release's images, if still kept
#
# This changes the code only. It does not undo database migrations; restore
# a backup from ~/backups/farm for that, by hand, after reading it.
set -euo pipefail

TARGET="${1:-previous}"
APP_DIR="${APP_DIR:-$HOME/apps/farm-manager}"
GITOPS_DIR="${GITOPS_DIR:-$HOME/gitops}"
COMPOSE_FILE="${GITOPS_DIR}/clevafarm.yaml"
ENV_FILE="${GITOPS_DIR}/clevafarm.env"
PROJECT="${COMPOSE_PROJECT:-clevafarm}"
API_IMAGE="cleva-farm-api"
WEB_IMAGE="cleva-farm-web"

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

compose() {
  local args=(--project-name "${PROJECT}" -f "${COMPOSE_FILE}")
  [[ -f "${ENV_FILE}" ]] && args+=(--env-file "${ENV_FILE}")
  docker compose "${args[@]}" "$@"
}

mkdir -p "${APP_DIR}"
exec 9>"${APP_DIR}/deploy.lock"
flock -w 600 9 || die "Another deploy or rollback is still running."

TARGET="${TARGET:0:12}"
docker image inspect "${API_IMAGE}:${TARGET}" >/dev/null 2>&1 || die "No ${API_IMAGE}:${TARGET} image on this server."
docker image inspect "${WEB_IMAGE}:${TARGET}" >/dev/null 2>&1 || die "No ${WEB_IMAGE}:${TARGET} image on this server."

echo "==> Switching farm-api and farm-web to :${TARGET}"
docker tag "${API_IMAGE}:${TARGET}" "${API_IMAGE}:latest"
docker tag "${WEB_IMAGE}:${TARGET}" "${WEB_IMAGE}:latest"
compose up -d --no-deps farm-api farm-web

for _ in $(seq 1 24); do
  api="$(docker inspect --format '{{.State.Health.Status}}' "${PROJECT}-farm-api-1" 2>/dev/null || echo missing)"
  web="$(docker inspect --format '{{.State.Health.Status}}' "${PROJECT}-farm-web-1" 2>/dev/null || echo missing)"
  echo "  farm-api: ${api}, farm-web: ${web}"
  if [[ "${api}" == "healthy" && "${web}" == "healthy" ]]; then
    printf '%s rollback %s\n' "$(date -u +%FT%TZ)" "${TARGET}" >>"${APP_DIR}/deploys.log"
    echo "==> Rolled back to :${TARGET}"
    exit 0
  fi
  sleep 10
done
die "Containers did not become healthy after rollback. Check the server now."
