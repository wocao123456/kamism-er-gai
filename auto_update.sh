#!/bin/bash
set -euo pipefail
cd /root/kamism
LOG=/root/kamism/.auto_update_cron.log
echo "[$(date)] start" >> "$LOG"
git remote set-url origin https://github.com/wocao123456/kamism-er-gai.git >/dev/null 2>&1 || true
git fetch origin main >> "$LOG" 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date)] update found" >> "$LOG"
  git pull origin main --rebase >> "$LOG" 2>&1
  docker compose up -d --build >> "$LOG" 2>&1
  echo "[$(date)] done" >> "$LOG"
else
  echo "[$(date)] up-to-date" >> "$LOG"
fi
