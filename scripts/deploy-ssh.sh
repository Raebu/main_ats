#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_HOST:?DEPLOY_HOST required}"
: "${DEPLOY_USER:?DEPLOY_USER required}"
: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY required}"
: "${PRODUCTION_ENV_FILE:?PRODUCTION_ENV_FILE required}"
: "${UNIT_IMAGE_REF:?UNIT_IMAGE_REF required}"
: "${SCANNER_IMAGE_REF:?SCANNER_IMAGE_REF required}"

install -m 600 /dev/null /tmp/raeburn-deploy-key
printf '%s' "$DEPLOY_SSH_KEY" > /tmp/raeburn-deploy-key
SSH=(ssh -o StrictHostKeyChecking=accept-new -i /tmp/raeburn-deploy-key "${DEPLOY_USER}@${DEPLOY_HOST}")
SCP=(scp -o StrictHostKeyChecking=accept-new -i /tmp/raeburn-deploy-key)

"${SSH[@]}" 'sudo mkdir -p /opt/raeburn-talent && sudo chown "$USER":"$USER" /opt/raeburn-talent'
"${SCP[@]}" infrastructure/production/docker-compose.production.yml infrastructure/production/Caddyfile "${DEPLOY_USER}@${DEPLOY_HOST}:/opt/raeburn-talent/"
printf '%s' "$PRODUCTION_ENV_FILE" | "${SSH[@]}" 'umask 077; cat > /opt/raeburn-talent/.env.production'
"${SSH[@]}" "cd /opt/raeburn-talent && printf '%s\n' '${GHCR_TOKEN}' | docker login ghcr.io -u '${GHCR_USER}' --password-stdin && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml pull && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml up -d --remove-orphans && docker compose -f docker-compose.production.yml ps"
rm -f /tmp/raeburn-deploy-key
