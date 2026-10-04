#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOY_HOST:?DEPLOY_HOST required}"
DEPLOY_USER="${DEPLOY_USER:-root}"
: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY required}"
: "${RUNTIME_ENV_FILE:?RUNTIME_ENV_FILE required}"
: "${UNIT_IMAGE_REF:?UNIT_IMAGE_REF required}"
: "${SCANNER_IMAGE_REF:?SCANNER_IMAGE_REF required}"
DEPLOY_RELEASE_ID="${DEPLOY_RELEASE_ID:-current}"
if [[ ! "$DEPLOY_RELEASE_ID" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "DEPLOY_RELEASE_ID contains unsupported characters."
  exit 2
fi
INCOMING_DIR="/opt/raeburn-talent/.incoming-images-$DEPLOY_RELEASE_ID"

KEY_FILE=/tmp/raeburn-deploy-key
PUB_FILE=/tmp/raeburn-deploy-key.pub
ERR_FILE=/tmp/raeburn-deploy-key.err
CONTROL_PATH="/tmp/rt-ssh-${BASHPID}.sock"
TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

cleanup() {
  if [ -S "$CONTROL_PATH" ]; then
    ssh -S "$CONTROL_PATH" -O exit "$TARGET" >/dev/null 2>&1 || true
  fi
  rm -f "$CONTROL_PATH" "$KEY_FILE" "$PUB_FILE" "$ERR_FILE"
}
trap cleanup EXIT

python3 - "$KEY_FILE" <<'PY'
import base64
import os
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
raw = os.environ["DEPLOY_SSH_KEY"]
raw = raw.replace("\r\n", "\n").replace("\r", "\n").strip()

# GitHub secrets sometimes arrive with literal backslash-n sequences after copy/paste.
if "\\n" in raw and "\n" not in raw:
    raw = raw.replace("\\n", "\n")

# Also tolerate a whole private key that was stored base64-encoded.
if not raw.startswith("-----BEGIN "):
    try:
        decoded = base64.b64decode("".join(raw.split()), validate=True).decode("utf-8")
        if decoded.lstrip().startswith("-----BEGIN "):
            raw = decoded.strip()
    except Exception:
        pass

if not raw.startswith("-----BEGIN OPENSSH PRIVATE KEY-----"):
    raise SystemExit("DEPLOY_SSH_KEY does not contain an OpenSSH private key header")

path.write_text(raw.rstrip("\n") + "\n", encoding="utf-8")
path.chmod(0o600)
PY

if ! ssh-keygen -y -f "$KEY_FILE" > "$PUB_FILE" 2> "$ERR_FILE"; then
  echo "DEPLOY_SSH_KEY could not be parsed by ssh-keygen after newline normalization."
  echo "Re-save the complete OpenSSH private key in the GitHub environment secret DEPLOY_SSH_KEY."
  exit 2
fi

fingerprint=$(ssh-keygen -E md5 -lf "$PUB_FILE" | awk '{print $2}')
echo "Validated deploy SSH key fingerprint: $fingerprint"
if [ -n "${DEPLOY_SSH_FINGERPRINT:-}" ] && [ "$fingerprint" != "$DEPLOY_SSH_FINGERPRINT" ]; then
  echo "DEPLOY_SSH_KEY fingerprint does not match the deployment key installed on the DigitalOcean droplet."
  exit 2
fi

master_ready=false
for attempt in $(seq 1 18); do
  rm -f "$CONTROL_PATH"
  if ssh -MNf \
      -o StrictHostKeyChecking=accept-new \
      -o IdentitiesOnly=yes \
      -o BatchMode=yes \
      -o ConnectTimeout=8 \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=10 \
      -o ControlMaster=yes \
      -o ControlPersist=600 \
      -o ControlPath="$CONTROL_PATH" \
      -i "$KEY_FILE" "$TARGET" &&
     ssh -S "$CONTROL_PATH" -O check "$TARGET" >/dev/null 2>&1; then
    master_ready=true
    break
  fi
  echo "Waiting for persistent deployment SSH transport (attempt $attempt/18)..."
  sleep 5
done
if [ "$master_ready" != "true" ]; then
  echo "Persistent deployment SSH transport did not become ready after firewall access was opened."
  exit 1
fi

SSH=(ssh -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o BatchMode=yes -o ControlMaster=auto -o ControlPersist=600 -o ControlPath="$CONTROL_PATH" -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -i "$KEY_FILE" "$TARGET")
SCP=(scp -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o BatchMode=yes -o ControlMaster=auto -o ControlPersist=600 -o ControlPath="$CONTROL_PATH" -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -i "$KEY_FILE")

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

if [ "${ROLLBACK:-false}" != "true" ]; then
  : "${IMAGE_ARCHIVE:?IMAGE_ARCHIVE required for deployment}"
  test -s "$IMAGE_ARCHIVE"

  archive_sha=$(sha256sum "$IMAGE_ARCHIVE" | awk '{print $1}')
  chunk_dir=$(mktemp -d)
  split -b 32M -d -a 4 "$IMAGE_ARCHIVE" "$chunk_dir/part-"
  "${SSH[@]}" "rm -rf '${INCOMING_DIR}' && mkdir -p '${INCOMING_DIR}'"

  transfer_chunk() {
    local part="$1"
    local name bytes attempt
    name=$(basename "$part")
    bytes=$(stat -c %s "$part")
    for attempt in 1 2 3; do
      echo "Transferring image chunk $name (attempt $attempt/3)..."
      if timeout 180s "${SCP[@]}" "$part" "${DEPLOY_USER}@${DEPLOY_HOST}:${INCOMING_DIR}/${name}.tmp" &&
         timeout 45s "${SSH[@]}" "test \$(stat -c %s '${INCOMING_DIR}/${name}.tmp') -eq '${bytes}' && mv '${INCOMING_DIR}/${name}.tmp' '${INCOMING_DIR}/${name}'"; then
        echo "Transferred image chunk $name."
        return 0
      fi
      echo "Image chunk $name attempt $attempt failed."
      timeout 30s "${SSH[@]}" "rm -f '${INCOMING_DIR}/${name}.tmp'" || true
      sleep $((attempt * 3))
    done
    echo "Failed to transfer image chunk $name after 3 attempts."
    return 1
  }

  pids=()
  transfer_failed=false
  for part in "$chunk_dir"/part-*; do
    transfer_chunk "$part" &
    pids+=("$!")
    if [ "${#pids[@]}" -ge 4 ]; then
      for pid in "${pids[@]}"; do
        if ! wait "$pid"; then transfer_failed=true; fi
      done
      if [ "$transfer_failed" = "true" ]; then
        rm -rf "$chunk_dir"
        exit 1
      fi
      pids=()
    fi
  done
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then transfer_failed=true; fi
  done
  if [ "$transfer_failed" = "true" ]; then
    rm -rf "$chunk_dir"
    exit 1
  fi

  timeout 900s "${SSH[@]}" "cd ${INCOMING_DIR} && remote_sha=\$(cat part-* | sha256sum | cut -d' ' -f1) && test \"\$remote_sha\" = '${archive_sha}' && cat part-* | gunzip -c | docker load && cd /opt/raeburn-talent && rm -rf '${INCOMING_DIR}'"
  rm -rf "$chunk_dir"
fi

"${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml up -d --remove-orphans && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml ps"
