#!/bin/bash
# ══════════════════════════════════════════════════════
# 滇界 V4 · 生产 DB 备份脚本
# 每次 deploy 前自动调用；保留近 30 天 dump
# ══════════════════════════════════════════════════════
set -euo pipefail

SERVER="root@116.62.32.162"
RDS_HOST="pgm-bp14m7g69y66165r.pg.rds.aliyuncs.com"
RDS_DB="dianjie_v4"
RDS_USER="dianjie_v4"
# 密码从环境变量取，避免硬编码到 git
: "${V4_SSH_PASSWORD:?需先 export V4_SSH_PASSWORD=... 或用 SSH key 免密}"
: "${V4_DB_PASSWORD:?需先 export V4_DB_PASSWORD=...}"

TS=$(date +%Y%m%d-%H%M%S)
REMOTE_FILE="/app/backups/dianjie_v4-deploy-bak-${TS}.dump"

echo "==> 生产 DB → ${REMOTE_FILE}"

sshpass -p "$V4_SSH_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER" bash <<EOF
set -e
mkdir -p /app/backups
PGPASSWORD='$V4_DB_PASSWORD' pg_dump \\
  -h '$RDS_HOST' -U '$RDS_USER' -d '$RDS_DB' \\
  --no-owner --no-acl --format=custom \\
  -f '$REMOTE_FILE'
ls -lh '$REMOTE_FILE'
# 留 30 天 dump
find /app/backups -name 'dianjie_v4-deploy-bak-*.dump' -mtime +30 -delete
echo "现存 deploy 备份："
ls -lh /app/backups/dianjie_v4-deploy-bak-*.dump 2>/dev/null | tail -10
EOF

echo "✅ 备份完成: ${REMOTE_FILE}"
echo "   恢复命令: pg_restore -h \$RDS_HOST -U \$RDS_USER -d \$RDS_DB --clean --no-owner ${REMOTE_FILE}"
