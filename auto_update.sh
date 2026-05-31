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

echo "[$(date)] ===== system update start =====" >> "$LOG"
git remote set-url origin https://github.com/wocao123456/kamism-er-gai.git >/dev/null 2>&1 || true

echo "[$(date)] [1/6] fetch remote..." >> "$LOG"
git fetch origin main >> "$LOG" 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
echo "[$(date)] local=$LOCAL remote=$REMOTE" >> "$LOG"

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date)] [2/6] update found, reset to origin/main..." >> "$LOG"
  git reset --hard origin/main >> "$LOG" 2>&1

  echo "[$(date)] [3/6] ensure .evn..." >> "$LOG"
  ./ensure_evn.sh >> "$LOG" 2>&1 || true

  echo "[$(date)] [4/6] rebuild app/web..." >> "$LOG"
  run_compose build app web >> "$LOG" 2>&1

  echo "[$(date)] [5/6] restart app/web..." >> "$LOG"
  run_compose up -d app web >> "$LOG" 2>&1

  VERSION_TEXT=$(awk '/^## \[/{print; exit}' CHANGELOG.md | tr -d '\r')
  COMMIT_HASH=$(git rev-parse --short HEAD)
  COMMIT_MSG=$(git log -1 --pretty=%s | tr -d '\r' | sed "s/'/''/g")
  VERSION_SQL=$(printf "%s" "$VERSION_TEXT" | sed "s/'/''/g")

  if [ -n "${DATABASE_URL:-}" ]; then
    echo "[$(date)] [6/6] write installed version to database..." >> "$LOG"
    psql "$DATABASE_URL" -c "
      INSERT INTO system_versions (id, version_text, commit_hash, commit_message, updated_at)
      VALUES (1, '$VERSION_SQL', '$COMMIT_HASH', '$COMMIT_MSG', NOW())
      ON CONFLICT (id) DO UPDATE SET
        version_text = EXCLUDED.version_text,
        commit_hash = EXCLUDED.commit_hash,
        commit_message = EXCLUDED.commit_message,
        updated_at = NOW();
    " >> "$LOG" 2>&1
  else
    echo "[$(date)] DATABASE_URL not found, skip writing installed version" >> "$LOG"
  fi

  echo "[$(date)] done" >> "$LOG"
else
  echo "[$(date)] up-to-date" >> "$LOG"
fi

echo "[$(date)] ===== system update end =====" >> "$LOG"