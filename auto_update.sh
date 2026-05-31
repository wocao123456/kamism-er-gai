#!/bin/bash
set -euo pipefail
cd /root/kamism
./ensure_evn.sh || true
LOG=/root/kamism/.auto_update_cron.log
RUNNING=/root/kamism/.auto_update_running

if [ -f "$RUNNING" ]; then
  old_pid=$(cat "$RUNNING" 2>/dev/null || true)
  if [ -n "${old_pid:-}" ] && kill -0 "$old_pid" 2>/dev/null; then
    echo "[$(date)] update already running: $old_pid" >> "$LOG"
    exit 0
  fi
fi
echo $$ > "$RUNNING"
trap 'rm -f "$RUNNING"' EXIT

run_compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "docker compose/docker-compose not found" >&2
    return 127
  fi
}

echo "[$(date)] start" >> "$LOG"
git remote set-url origin https://github.com/wocao123456/kamism-er-gai.git >/dev/null 2>&1 || true
git fetch origin main >> "$LOG" 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
echo "[$(date)] local=$LOCAL remote=$REMOTE" >> "$LOG"
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date)] update found" >> "$LOG"
  git reset --hard origin/main >> "$LOG" 2>&1
  run_compose build app web >> "$LOG" 2>&1
  run_compose up -d app web >> "$LOG" 2>&1
  echo "[$(date)] done" >> "$LOG"
else
  echo "[$(date)] up-to-date" >> "$LOG"
fi
