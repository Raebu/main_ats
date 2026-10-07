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
if [ -n "${PUBLIC_BASE_URL:-}" ]; then
  api_domain=$(python3 - <<'PY'
import os
from urllib.parse import urlparse

value = os.environ["PUBLIC_BASE_URL"].strip()
parsed = urlparse(value if "://" in value else f"https://{value}")
if not parsed.hostname:
    raise SystemExit("PUBLIC_BASE_URL does not contain a valid hostname")
print(parsed.hostname)
PY
)
  sed -i '/^API_DOMAIN=/d' "$tmp_env"
  printf 'API_DOMAIN=%s\n' "$api_domain" >> "$tmp_env"
fi
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

echo "Preparing runtime memory headroom..."
"${SSH[@]}" 'set -e
  total_kb=$(grep "^MemTotal:" /proc/meminfo | tr -s " " | cut -d" " -f2)
  swap_kb=$(grep "^SwapTotal:" /proc/meminfo | tr -s " " | cut -d" " -f2)
  avail_kb=$(grep "^MemAvailable:" /proc/meminfo | tr -s " " | cut -d" " -f2)
  echo "Runtime memory before deploy: total=$((total_kb/1024))MiB available=$((avail_kb/1024))MiB swap=$((swap_kb/1024))MiB"

  if [ "$swap_kb" -lt 2097152 ]; then
    swapfile=/swapfile
    target_mb=8192
    free_mb=$(df -Pm / | tail -1 | tr -s " " | cut -d" " -f4)
    if [ "$free_mb" -lt 12288 ]; then
      echo "Insufficient disk headroom to create protective swap: ${free_mb}MiB free."
      exit 1
    fi
    if swapon --show=NAME --noheadings | grep -Fxq "$swapfile"; then
      swapoff "$swapfile"
    fi
    rm -f "$swapfile"
    if command -v fallocate >/dev/null 2>&1; then
      fallocate -l "${target_mb}M" "$swapfile"
    else
      dd if=/dev/zero of="$swapfile" bs=1M count="$target_mb" status=none
    fi
    chmod 600 "$swapfile"
    mkswap "$swapfile" >/dev/null
    swapon "$swapfile"
    grep -qE "^/swapfile[[:space:]]" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
    sysctl -w vm.swappiness=10 >/dev/null
    mkdir -p /etc/sysctl.d
    sed -i "/^vm.swappiness=/d" /etc/sysctl.d/99-raeburn-talent.conf 2>/dev/null || true
    echo "vm.swappiness=10" >> /etc/sysctl.d/99-raeburn-talent.conf
  fi

  free -m
  df -h /'
if [ -n "${NATS_URL_OVERRIDE:-}" ]; then
  read -r nats_host nats_port < <(python3 - <<'PY'
import os
from urllib.parse import urlparse

u = urlparse(os.environ["NATS_URL_OVERRIDE"])
if not u.hostname:
    raise SystemExit("NATS_URL_OVERRIDE does not contain a hostname")
print(u.hostname, u.port or 4222)
PY
  )
  echo "Checking private NATS connectivity at ${nats_host}:${nats_port}..."
  nats_ready=false
  for attempt in $(seq 1 24); do
    if timeout 6s "${SSH[@]}" "timeout 3 bash -lc '</dev/tcp/${nats_host}/${nats_port}'" >/dev/null 2>&1; then
      nats_ready=true
      echo "Private NATS endpoint is reachable."
      break
    fi
    echo "Waiting for private NATS endpoint (attempt ${attempt}/24)..."
    sleep 5
  done
  if [ "$nats_ready" != "true" ]; then
    echo "Private NATS endpoint ${nats_host}:${nats_port} is not reachable from the runtime VPC."
    exit 1
  fi
fi
echo "Quiescing existing ATS application containers before image delivery..."
"${SSH[@]}" 'set -e
  cd /opt/raeburn-talent
  if ! timeout --signal=TERM --kill-after=5s 15s docker info >/dev/null 2>&1; then
    echo "Docker daemon is not responding after memory preflight; restarting Docker service."
    systemctl restart docker
    recovered=false
    for attempt in $(seq 1 12); do
      if timeout --signal=TERM --kill-after=5s 10s docker info >/dev/null 2>&1; then
        recovered=true
        break
      fi
      sleep 5
    done
    if [ "$recovered" != "true" ]; then
      echo "Docker daemon did not recover after restart."
      exit 1
    fi
  fi
  test -f .release.current
  set -a
  . ./.release.current
  set +a
  timeout --signal=TERM --kill-after=10s 90s docker compose -f docker-compose.production.yml stop edge-api recruitment-core selection experience platform-control intelligence-data malware-scanner caddy
  echo "Runtime memory after quiescing existing stack:"
  free -m
'
if [ -n "${NATS_URL_OVERRIDE:-}" ] && [ -n "${RUNTIME_PRIVATE_IP:-}" ]; then
  read -r nats_host nats_port < <(python3 - <<'PY'
import os
from urllib.parse import urlparse
u=urlparse(os.environ["NATS_URL_OVERRIDE"])
print(u.hostname, u.port or 4222)
PY
  )
  echo "Preparing Docker-to-VPC NATS routing..."
  "${SSH[@]}" "set -e
    cd /opt/raeburn-talent
    docker network inspect raeburn-talent_talent >/dev/null 2>&1 || docker network create raeburn-talent_talent >/dev/null
    subnet=\$(docker network inspect raeburn-talent_talent --format '{{(index .IPAM.Config 0).Subnet}}')
    test -n \"\$subnet\"
    iptables -t nat -C POSTROUTING -s \"\$subnet\" -d '${nats_host}/32' -j SNAT --to-source '${RUNTIME_PRIVATE_IP}' 2>/dev/null || iptables -t nat -A POSTROUTING -s \"\$subnet\" -d '${nats_host}/32' -j SNAT --to-source '${RUNTIME_PRIVATE_IP}'
    echo \"Docker subnet \$subnet routed to NATS through '${RUNTIME_PRIVATE_IP}'.\"
  "
fi

if [ "${ROLLBACK:-false}" != "true" ]; then
  images_ready=false

  if timeout 20s "${SSH[@]}" "docker image inspect '${UNIT_IMAGE_REF}' '${SCANNER_IMAGE_REF}' >/dev/null 2>&1"; then
    echo "Deployment images already exist on the runtime host."
    images_ready=true
  fi

  if [ "$images_ready" != "true" ] && [ -n "${GHCR_TOKEN:-}" ] && [ -n "${GHCR_USER:-}" ]; then
    remote_docker_config="/tmp/raeburn-docker-auth-${DEPLOY_RELEASE_ID}"
    "${SSH[@]}" "rm -rf '${remote_docker_config}' && install -d -m 700 '${remote_docker_config}'"

    if printf '%s' "$GHCR_TOKEN" | timeout 30s "${SSH[@]}" "DOCKER_CONFIG='${remote_docker_config}' docker login ghcr.io -u '${GHCR_USER}' --password-stdin >/dev/null 2>&1"; then
      echo "Trying direct GHCR image pull before archive fallback..."
      if "${SSH[@]}" "DOCKER_CONFIG='${remote_docker_config}' timeout --signal=TERM --kill-after=15s 600s docker pull '${UNIT_IMAGE_REF}'" &&
         "${SSH[@]}" "DOCKER_CONFIG='${remote_docker_config}' timeout --signal=TERM --kill-after=15s 300s docker pull '${SCANNER_IMAGE_REF}'"; then
        images_ready=true
        echo "Deployment images pulled directly from GHCR."
      else
        echo "Direct GHCR pull did not complete quickly enough; using archive fallback."
      fi
    else
      echo "GHCR login did not complete; using archive fallback."
    fi

    timeout 30s "${SSH[@]}" "rm -rf '${remote_docker_config}'" || true
  fi

  if [ "$images_ready" != "true" ]; then
    : "${IMAGE_ARCHIVE:?IMAGE_ARCHIVE required for archive fallback}"
    test -s "$IMAGE_ARCHIVE"

    echo "Preparing runtime host for archive import..."
    timeout 180s "${SSH[@]}" 'set -e
      cd /opt/raeburn-talent

      if ! timeout --signal=TERM --kill-after=5s 15s docker info >/dev/null 2>&1; then
        echo "Docker daemon is not responding; restarting Docker service."
        systemctl restart docker
        recovered=false
        for attempt in $(seq 1 12); do
          if timeout --signal=TERM --kill-after=5s 10s docker info >/dev/null 2>&1; then
            recovered=true
            break
          fi
          sleep 5
        done
        if [ "$recovered" != "true" ]; then
          echo "Docker daemon did not recover after restart."
          exit 1
        fi
      fi

      keep_file=$(mktemp)
      trap "rm -f $keep_file" EXIT
      for f in .release.current .release.previous; do
        if [ -f "$f" ]; then
          sed -n "s/^[A-Z_]*IMAGE_REF=//p" "$f"
        fi
      done | sort -u > "$keep_file"

      echo "Disk usage before image cleanup:"
      df -h / /var/lib/docker 2>/dev/null || df -h /
      timeout --signal=TERM --kill-after=5s 15s docker system df || true

      for repo in ghcr.io/raebu/raeburn-talent-unit ghcr.io/raebu/raeburn-talent-malware-scanner; do
        refs=$(timeout --signal=TERM --kill-after=5s 20s docker image ls "$repo" --format "{{.Repository}}:{{.Tag}}" || true)
        printf "%s\n" "$refs" | while IFS= read -r ref; do
          [ -n "$ref" ] || continue
          [ "$ref" = "$repo:<none>" ] && continue
          if ! grep -Fxq "$ref" "$keep_file"; then
            timeout --signal=TERM --kill-after=5s 20s docker image rm "$ref" >/dev/null 2>&1 || true
          fi
        done
      done
      timeout --signal=TERM --kill-after=5s 30s docker image prune -f >/dev/null 2>&1 || true

      echo "Disk usage after image cleanup:"
      df -h / /var/lib/docker 2>/dev/null || df -h /
      timeout --signal=TERM --kill-after=5s 15s docker system df || true'

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

    echo "Archive transfer complete; verifying and importing deployment images..."
    timeout 720s "${SSH[@]}" "set -e; cd '${INCOMING_DIR}'; remote_sha=\$(cat part-* | sha256sum | cut -d' ' -f1); test \"\$remote_sha\" = '${archive_sha}'; timeout --signal=TERM --kill-after=20s 600s sh -c 'cat part-* | gzip -dc | docker load'; cd /opt/raeburn-talent; rm -rf '${INCOMING_DIR}'"
    rm -rf "$chunk_dir"
  fi
fi

if [ -n "${NATS_URL_OVERRIDE:-}" ]; then
  echo "Verifying NATS from inside the ATS Docker network..."
  container_nats_ready=false
  for attempt in $(seq 1 12); do
    if timeout 12s "${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker run --rm --network raeburn-talent_talent --env-file .env.production '${UNIT_IMAGE_REF}' node -e 'const net=require("node:net");const u=new URL(process.env.NATS_URL);const s=net.createConnection({host:u.hostname,port:Number(u.port||4222)});const t=setTimeout(()=>{s.destroy();process.exit(1)},3000);s.once("connect",()=>{clearTimeout(t);s.end();process.exit(0)});s.once("error",()=>{clearTimeout(t);process.exit(1)})'" >/dev/null 2>&1; then
      container_nats_ready=true
      echo "NATS is reachable from the ATS Docker network."
      break
    fi
    echo "Waiting for Docker-to-NATS connectivity (attempt ${attempt}/12)..."
    sleep 3
  done
  if [ "$container_nats_ready" != "true" ]; then
    echo "NATS is not reachable from the ATS Docker network."
    exit 1
  fi
fi

"${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml up -d --remove-orphans"
"${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate caddy"

runtime_ready=false
for attempt in $(seq 1 60); do
  if timeout 15s "${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml exec -T edge-api node -e 'Promise.all([\"/health\",\"/v1/jobs/public\"].map(p=>fetch(\"http://127.0.0.1:4100\"+p,{headers:{\"x-tenant-id\":\"tenant_raeburn_group\"},signal:AbortSignal.timeout(3000)}))).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))'" >/dev/null 2>&1; then
    runtime_ready=true
    echo "Runtime API health and public-jobs endpoints are internally ready."
    break
  fi
  echo "Waiting for staging runtime API readiness (attempt $attempt/60)..."
  sleep 5
done

if [ "$runtime_ready" != "true" ]; then
  echo "Runtime API did not become ready within 5 minutes."
  "${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml ps" || true
  "${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml logs --tail=200 edge-api recruitment-core platform-control intelligence-data" || true
  exit 1
fi

"${SSH[@]}" "cd /opt/raeburn-talent && UNIT_IMAGE_REF='${UNIT_IMAGE_REF}' SCANNER_IMAGE_REF='${SCANNER_IMAGE_REF}' docker compose -f docker-compose.production.yml ps"
