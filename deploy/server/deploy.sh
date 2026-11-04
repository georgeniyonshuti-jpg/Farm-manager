#!/usr/bin/env bash
# Deploy one release of Cleva Farm Manager (API + web) on the Hetzner host.
#
# GitHub Actions uploads the release to ~/apps/farm-manager/releases/<sha>
# and runs this script from inside it:
#
#   bash ~/apps/farm-manager/releases/<sha>/deploy/server/deploy.sh <sha>
#
# Steps: build both images (nothing live changes yet), back up the farm
# database, keep the running images as :previous, switch to the new images,
# wait for both to be healthy, and put :previous back if they are not.
#
# Only farm-api and farm-web restart. Postgres, ERPNext, mail and the rest
# of ~/gitops/clevafarm.yaml are left alone. Secrets stay in ~/gitops.
#
# The API applies new database/migrations/*.sql when it starts. A rollback
# puts the old images back but does not undo a migration; the backup taken
# here is how to do that.
set -euo pipefail

SHA="${1:?usage: deploy.sh <git sha>}"
SHORT="${SHA:0:12}"

APP_DIR="${APP_DIR:-$HOME/apps/farm-manager}"
RELEASE="${APP_DIR}/releases/${SHA}"
GITOPS_DIR="${GITOPS_DIR:-$HOME/gitops}"
COMPOSE_FILE="${GITOPS_DIR}/clevafarm.yaml"
ENV_FILE="${GITOPS_DIR}/clevafarm.env"
PROJECT="${COMPOSE_PROJECT:-clevafarm}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/farm}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
API_IMAGE="cleva-farm-api"
WEB_IMAGE="cleva-farm-web"
API_URL="${FARM_API_URL:-https://farmapi.cleva.rw}"
CHECK_URLS=("${API_URL}/health" "https://farm.cleva.rw/" "https://market.cleva.rw/")
DB_CONTAINER="${PROJECT}-farm-postgres-1"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

compose() {
  local args=(--project-name "${PROJECT}" -f "${COMPOSE_FILE}")
  [[ -f "${ENV_FILE}" ]] && args+=(--env-file "${ENV_FILE}")
  docker compose "${args[@]}" "$@"
}

# One deploy at a time. A second one waits up to 10 minutes, then gives up.
mkdir -p "${APP_DIR}"
exec 9>"${APP_DIR}/deploy.lock"
flock -w 600 9 || die "Another deploy or rollback is still running."

[[ -d "${RELEASE}" ]] || die "Release folder ${RELEASE} is missing."
[[ -f "${COMPOSE_FILE}" ]] || die "${COMPOSE_FILE} is missing."
cd "${RELEASE}"

health() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "${PROJECT}-$1-1" 2>/dev/null || echo "missing"
}

# Wait for both containers to report healthy, then check the public URLs.
wait_healthy() {
  local deadline=$((SECONDS + 240)) api web
  while ((SECONDS < deadline)); do
    api="$(health farm-api)"
    web="$(health farm-web)"
    if [[ "${api}" == "healthy" && "${web}" == "healthy" ]]; then
      local url
      for url in "${CHECK_URLS[@]}"; do
        curl -fsS -o /dev/null --max-time 15 "${url}" || { echo "  ${url} did not answer"; return 1; }
        echo "  OK ${url}"
      done
      return 0
    fi
    echo "  farm-api: ${api}, farm-web: ${web}"
    sleep 10
  done
  return 1
}

switch_to() {
  docker tag "${API_IMAGE}:$1" "${API_IMAGE}:latest"
  docker tag "${WEB_IMAGE}:$1" "${WEB_IMAGE}:latest"
  compose up -d --no-deps farm-api farm-web
}

log "Release ${SHORT}"

log "Building ${API_IMAGE}:${SHORT} (live site not touched yet)"
docker build -f deploy/api.Dockerfile -t "${API_IMAGE}:${SHORT}" .

log "Building ${WEB_IMAGE}:${SHORT}"
docker build -f deploy/web.Dockerfile \
  --build-arg "VITE_API_URL=${API_URL}" \
  --build-arg "VITE_APP_VERSION=${SHORT}" \
  -t "${WEB_IMAGE}:${SHORT}" .

log "Backing up the farm database"
mkdir -p "${BACKUP_DIR}"
BACKUP="${BACKUP_DIR}/farm-$(date -u +%Y%m%dT%H%M%SZ)-${SHORT}.dump"
docker exec "${DB_CONTAINER}" pg_dump -U clevafarm -d clevafarm -Fc >"${BACKUP}.part"
[[ -s "${BACKUP}.part" ]] || die "Backup is empty; nothing deployed."
mv "${BACKUP}.part" "${BACKUP}"
echo "  ${BACKUP} ($(du -h "${BACKUP}" | cut -f1))"

log "Keeping the running images as :previous"
docker tag "${API_IMAGE}:latest" "${API_IMAGE}:previous"
docker tag "${WEB_IMAGE}:latest" "${WEB_IMAGE}:previous"

log "Switching to ${SHORT}"
switch_to "${SHORT}"

log "Waiting for farm-api and farm-web"
if ! wait_healthy; then
  log "New release is not healthy. Putting :previous back."
  compose logs --tail 60 farm-api || true
  switch_to previous
  wait_healthy || echo "WARNING: :previous is not healthy either. Check the server now."
  echo "Database backup from before this deploy: ${BACKUP}"
  exit 1
fi

echo "${SHA}" >"${APP_DIR}/current"
printf '%s %s %s\n' "$(date -u +%FT%TZ)" "${SHA}" "${BACKUP}" >>"${APP_DIR}/deploys.log"

log "Tidying old releases, images and backups"
# Release folders and sha-tagged images: keep the newest few.
ls -1t "${APP_DIR}/releases" | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  rm -rf "${APP_DIR}/releases/${old}"
done
for image in "${API_IMAGE}" "${WEB_IMAGE}"; do
  docker images "${image}" --format '{{.Tag}} {{.CreatedAt}}' \
    | grep -E '^[0-9a-f]{12} ' | sort -k2 -r | tail -n +$((KEEP_RELEASES + 1)) | cut -d' ' -f1 \
    | while read -r tag; do docker rmi "${image}:${tag}" >/dev/null 2>&1 || true; done
done
ls -1t "${BACKUP_DIR}"/farm-*.dump 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

log "Deployed ${SHORT}"
