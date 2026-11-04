#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy to the Hetzner server.
# Run it yourself, once, from the repo folder on a Mac that can already
# reach the server and is signed in with the GitHub CLI (`gh auth status`):
#
#   bash deploy/setup-github-deploy.sh
#
# It: makes ~/.ssh/cleva_farm_deploy if missing, checks the server's host key,
# lets that key log in as deploy@ the server, stores the four DEPLOY_* secrets
# on GitHub, and tests that the key works. Safe to run again.
set -euo pipefail

HOST="178.105.103.228"
USER_NAME="deploy"
HOST_FINGERPRINT="SHA256:j2Nua58nkwtm5BGEHdbSBsGrroWn6PC5Hz4yX99D4js"
KEY="${HOME}/.ssh/cleva_farm_deploy"
GH="$(command -v gh || echo /opt/homebrew/bin/gh)"

step() { printf '\n==> %s\n' "$*"; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

step "Checking the GitHub CLI sign-in"
"${GH}" auth status >/dev/null 2>&1 || die "Run: gh auth login -s workflow"

step "Deploy key"
if [[ ! -f "${KEY}" ]]; then
  ssh-keygen -t ed25519 -N "" -C "github-actions-farm-deploy" -f "${KEY}" -q
fi
ssh-keygen -lf "${KEY}.pub"

step "Checking the server is really ${HOST}"
KNOWN_HOSTS="$(ssh-keyscan -T 10 -t ed25519 "${HOST}" 2>/dev/null)"
[[ -n "${KNOWN_HOSTS}" ]] || die "Could not reach ${HOST}."
printf '%s\n' "${KNOWN_HOSTS}" | ssh-keygen -lf - | grep -q "${HOST_FINGERPRINT}" \
  || die "The server's key is not the expected one. Do not continue; ask for help."
echo "  host key matches ${HOST_FINGERPRINT}"

step "Letting the deploy key log in to ${USER_NAME}@${HOST}"
PUB="$(cat "${KEY}.pub")"
ssh -o BatchMode=yes "${USER_NAME}@${HOST}" \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && (grep -qxF '${PUB}' ~/.ssh/authorized_keys || echo '${PUB}' >> ~/.ssh/authorized_keys) && echo '  key is in authorized_keys'"

step "Testing the deploy key on its own"
ssh -o BatchMode=yes -o IdentitiesOnly=yes -i "${KEY}" "${USER_NAME}@${HOST}" \
  'echo "  logged in as $(whoami) on $(hostname)"; docker ps --format "{{.Names}}" | grep -c clevafarm | sed "s/^/  clevafarm containers seen: /"'

step "Storing the four secrets on GitHub"
"${GH}" secret set DEPLOY_HOST --body "${HOST}"
"${GH}" secret set DEPLOY_USER --body "${USER_NAME}"
printf '%s\n' "${KNOWN_HOSTS}" | "${GH}" secret set DEPLOY_KNOWN_HOSTS
"${GH}" secret set DEPLOY_SSH_KEY <"${KEY}"
"${GH}" secret list

step "Done. GitHub > Actions > Deploy is ready to use."
