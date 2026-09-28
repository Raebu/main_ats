#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_HOST:?DEPLOY_HOST required}"
DEPLOY_USER="${DEPLOY_USER:-root}"
: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY required}"
: "${RUNTIME_ENV_FILE:?RUNTIME_ENV_FILE required}"
: "${UNIT_IMAGE_REF:?UNIT_IMAGE_REF required}"
: "${SCANNER_IMAGE_REF:?SCANNER_IMAGE_REF required}"

install -m 600 /dev/null /tmp/raeburn-deploy-key
printf '%s' "$DEPLOY_SSH_KEY" > /tmp/raeburn-deploy-key
SSH=(ssh -o StrictHostKeyChecking=accept-new -i /tmp/raeburn-deploy-key "${DEPLOY_USER}@${DEPLOY_HOST}")
SCP=(scp -o StrictHostKeyChecking=accept-new -i /tmp/raeburn-deploy-key)

"${SSH[@]}" 'sudo mkdir -p /opt/raeburn-talent && sudo chown "$USER":"$USER" /opt/raeburn-talent'
"${SCP[@]}" infrastructure/production/docker-compose.production.yml infrastructure/production/Caddyfile "${DEPLOY_USER}@${DEPLOY_HOST}:/opt/raeburn-talent/"
tmp_env=$(mktemp)
printf '%s\n' "$RUNTIME_ENV_FILE" > "$tmp_env"
if [ -n "${DATABASE_BASE_URL_OVERRIDE:-}" ]; then printf 'DATABASE_BASE_URL=%s\n' "$DATABASE_BASE_URL_OVERRIDE" >> "$tmp_env"; fi
if [ -n "${NATS_URL_OVERRIDE:-}" ]; then printf 'NATS_URL=%s\n' "$NATS_URL_OVERRIDE" >> "$tmp_env"; fi
cat "$tmp_env" | "${SSH[@]}" 'umask 077; cat > /opt/raeburn-talent/.env.production'
rm -f "$tmp_env"

if [ "${ROLLBACK:-false}" = "true" ]; then
  "${SSH[@]}" 'cd /opt/raeburn-talent && test -f .release.previous && cp .release.previous .release.current'
  refs=$("${SSH[@]}" 'cat /opt/raeburn-talent/.release.current')
  UNIT_IMAGE_REF=$(printf '%s
' "$refs" | sed -n 's/^UNIT_IMAGE_REF=//p')
  SCANNER_IMAGE_REF=$(printf '%s
' "$refs" | sed -n 's/^SCANNER_IMAGE_REF=//p')
else
  "${SSH[@]}" 'cd /opt/raeburn-talent && if [ -f .release.current ]; then cp .release.current .release.previous; fi'
  printf 'UNIT_IMAGE_REF=%s
SCANNER_IMAGE_REF=%s
' "$UNIT_IMAGE_REF" "$SCANNER_IMAGE_REF" | "${SSH[@]}" 'cat > /opt/raeburn-talent/.release.current'
fi

"${SSH[@]}" "cd /opt/raeburn-talent && printf '%s\n' '${GHCR_TOKEN}' | docker login ghcr.io -u '${GHCR_USER}' --password-stdin && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml pull && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml up -d --remove-orphans && docker compose -f docker-compose.production.yml ps"
rm -f /tmp/raeburn-deploy-key
