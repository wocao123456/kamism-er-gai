#!/bin/bash
cd /root/kamism
LOG=/var/log/kamism_auto_update.log
echo "[$(date)] 开始自动更新" >> $LOG
git fetch origin main >> $LOG 2>&1
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date)] 发现新版本，开始更新" >> $LOG
  git pull origin main --rebase >> $LOG 2>&1
  docker compose up -d --build >> $LOG 2>&1
  echo "[$(date)] 更新完成" >> $LOG
else
  echo "[$(date)] 已是最新版本" >> $LOG
fi
