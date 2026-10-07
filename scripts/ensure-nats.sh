#!/usr/bin/env bash
set -euo pipefail

: "${NATS_DEPLOY_HOST:?NATS_DEPLOY_HOST required}"
: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY required}"

KEY_FILE=/tmp/raeburn-nats-deploy-key
PUB_FILE=/tmp/raeburn-nats-deploy-key.pub
ERR_FILE=/tmp/raeburn-nats-deploy-key.err
TARGET="root@${NATS_DEPLOY_HOST}"

cleanup() {
  rm -f "$KEY_FILE" "$PUB_FILE" "$ERR_FILE"
}
trap cleanup EXIT

python3 - "$KEY_FILE" <<'PY'
import base64, os, pathlib, sys
path = pathlib.Path(sys.argv[1])
raw = os.environ["DEPLOY_SSH_KEY"].replace("\r\n","\n").replace("\r","\n").strip()
if "\\n" in raw and "\n" not in raw:
    raw = raw.replace("\\n","\n")
if not raw.startswith("-----BEGIN "):
    try:
        decoded = base64.b64decode("".join(raw.split()), validate=True).decode()
        if decoded.lstrip().startswith("-----BEGIN "):
            raw = decoded.strip()
    except Exception:
        pass
if not raw.startswith("-----BEGIN OPENSSH PRIVATE KEY-----"):
    raise SystemExit("DEPLOY_SSH_KEY is not an OpenSSH private key")
path.write_text(raw.rstrip("\n")+"\n")
path.chmod(0o600)
PY

ssh-keygen -y -f "$KEY_FILE" > "$PUB_FILE" 2> "$ERR_FILE"
fingerprint=$(ssh-keygen -E md5 -lf "$PUB_FILE" | awk '{print $2}')
if [ -n "${DEPLOY_SSH_FINGERPRINT:-}" ] && [ "$fingerprint" != "$DEPLOY_SSH_FINGERPRINT" ]; then
  echo "DEPLOY_SSH_KEY fingerprint mismatch for NATS repair."
  exit 2
fi

SSH=(ssh -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=20 -o ServerAliveCountMax=6 -i "$KEY_FILE" "$TARGET")

ready=false
for attempt in $(seq 1 18); do
  if "${SSH[@]}" 'true' >/dev/null 2>&1; then
    ready=true
    break
  fi
  echo "Waiting for NATS repair SSH (attempt $attempt/18)..."
  sleep 5
done
if [ "$ready" != "true" ]; then
  echo "NATS droplet SSH did not become ready."
  exit 1
fi

"${SSH[@]}" 'set -e
  systemctl enable --now docker
  mkdir -p /var/lib/nats
  if docker inspect nats >/dev/null 2>&1; then
    if [ "$(docker inspect -f "{{.State.Running}}" nats)" != "true" ]; then
      docker start nats
    fi
  else
    docker run -d --restart=always --name nats -p 4222:4222 -p 8222:8222 -v /var/lib/nats:/data nats:2-alpine -js -sd /data -m 8222
  fi

  nats_ready=false
  for attempt in $(seq 1 18); do
    if timeout 3 bash -lc "</dev/tcp/127.0.0.1/4222" >/dev/null 2>&1; then
      nats_ready=true
      break
    fi
    sleep 2
  done
  if [ "$nats_ready" != "true" ]; then
    echo "NATS is not listening on localhost:4222."
    docker ps -a --filter name=^/nats$
    docker logs --tail=100 nats || true
    exit 1
  fi
  echo "NATS service is listening on port 4222."
'
