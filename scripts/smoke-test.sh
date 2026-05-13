#!/bin/bash
# ══════════════════════════════════════════════════════
# 滇界 V4 · 烟雾测试（复用现有 e2e + ui-smoke）
# 用法:
#   ./scripts/smoke-test.sh                          # 测生产 https://app.dianjie.cc
#   ./scripts/smoke-test.sh http://localhost:4444    # 测本地（搭配本地 web :3200）
# ══════════════════════════════════════════════════════
set -euo pipefail

BASE="${1:-https://app.dianjie.cc}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Target: $BASE"
echo ""

# 1. /api/health
echo "==> 1. health check"
HEALTH=$(curl -sf "$BASE/api/health" || echo "FAIL")
if [[ "$HEALTH" == FAIL* ]]; then
  echo "❌ /api/health 失败"; exit 1
fi
echo "$HEALTH" | head -3
echo ""

# 2. e2e (API 全角色链路)
echo "==> 2. e2e API roundtrip"
if [ -f "$SCRIPT_DIR/e2e-full-flow.js" ]; then
  node "$SCRIPT_DIR/e2e-full-flow.js" --base "$BASE" || {
    echo "⚠️  e2e 有 step 失败，详见输出（不阻塞部署，但需人工确认）"
  }
else
  echo "(skip - e2e-full-flow.js 不存在)"
fi
echo ""

# 3. UI smoke (Playwright headless)
echo "==> 3. UI smoke (headless 浏览器跑 6 角色登录)"
if [ -f "$SCRIPT_DIR/ui-smoke.js" ]; then
  node "$SCRIPT_DIR/ui-smoke.js" --base "$BASE" || {
    echo "⚠️  UI smoke 有失败，详见输出"
  }
else
  echo "(skip - ui-smoke.js 不存在)"
fi
echo ""

echo "✅ Smoke test 完成: $BASE"
