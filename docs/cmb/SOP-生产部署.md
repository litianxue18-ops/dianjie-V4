# 招行免前置（dianjie-v4-cmb）· 生产部署 SOP

> **适用阶段**：本地 P0/P1/P2 改造完成 → 生产首次上线 / 后续密钥轮换
> **基准文档**：[2026-05-13-招行BB1PAY-报文规范.md](./2026-05-13-招行BB1PAY-报文规范.md)
> **触发条件**：用户明确说"上线 cmb" / "deploy cmb" 才执行；默认禁止

---

## 0. 上线前预检（一项不满足就不上）

```
[ ] feat/cmb-bb1pay-fix 分支已合 main
[ ] 本地 cdctest 网关跑通同行 + 跨行 + 查询 3 个场景（4/15 报告同款 0.01 试拨）
[ ] docs/cmb/2026-05-13-招行BB1PAY-报文规范.md 跟代码一致（无字段漂移）
[ ] 已联系招商银行分行人员，确认我方提交联调测试报告 + 生产上线申请
[ ] 银行已确认生产环境对我方 ECS 出口 IP 开通白名单（注意：测试白名单 116.62.32.162 不自动延续）
[ ] 云洱密钥.txt 里的生产 SM2 + SM4 密钥已确认是"生产专用、与测试隔离"
[ ] 服务器已准备 /app/dianjie-v4/apps/cmb/ 目录（deploy.sh rsync 会处理）
[ ] 服务器已装 Python 3.10+ + pip + gmssl + flask + requests
```

---

## 1. 生产 .env 注入（**手工，禁止入 git**）

ssh 到生产服务器，在 `/app/dianjie-v4/.env` 文件**末尾追加**：

```env
# ══════════════════════════════════════
# 招商银行新直联 · 生产凭证（云洱密钥.txt 注入）
# ⚠️ 严禁回写 git；这些值仅服务器 root 可读
# ══════════════════════════════════════
CMB_USE_PROD=true
CMB_URL=https://cdc.cmbchina.com/cdcserver/api/v2

CMB_UID=<生产 UID — 招行分行下发>
CMB_ACCOUNT=<生产结算户号 — 招行分行下发>

CMB_PRIVATE_KEY=<云洱密钥.txt "用户私钥" 值, 形如 mq54p0NThrSLW3AEMS5ad/r5L...>
CMB_PUBLIC_KEY=<云洱密钥.txt "用户公钥" 值, 形如 BB0zaaW3QHiLWcCVzk0SBOYEUz...>
CMB_BANK_PUBLIC_KEY=<云洱密钥.txt "银行公钥" 值, 形如 BEynMEZOjNpwZIiD9jXtZSGr3...>
CMB_SYM_KEY=<云洱密钥.txt "用户对称密钥" 值, 16 字节 ASCII, 形如 4vdiY14k4dAOfrFu>

CMB_BUSMOD=S100B
CMB_BUSCOD=N02030
CMB_CCY_NBR=10
CMB_SERVICE_PORT=5001
CMB_SERVICE_URL=http://localhost:5001
```

**操作后**：
```bash
chmod 600 /app/dianjie-v4/.env    # 仅 root 可读
grep -c "CMB_" /app/dianjie-v4/.env   # 应输出 ≥ 12 行
```

---

## 2. 装 Python 依赖（首次部署）

```bash
ssh root@116.62.32.162
cd /app/dianjie-v4/apps/cmb
pip3 install -r requirements.txt
python3 -c "import flask, gmssl, requests; print('OK')"
```

预期输出：`OK`，不报模块缺失。

---

## 3. 部署 + 拉起进程

由 `scripts/deploy.sh` 自动完成（**用户说"上线 cmb"时才跑**）：

```bash
# 本地
cd ~/Desktop/dianjie-V4/dianjie-V4
./scripts/deploy.sh --dry-run         # 看一遍要做啥
./scripts/deploy.sh                   # 真跑（含 rsync apps/cmb/ + pm2 reload）
```

`pm2 reload` 时，因为 `ecosystem.config.cjs` 已含 `dianjie-v4-cmb` 进程定义，PM2 会自动拉起 Flask。验证：

```bash
ssh root@116.62.32.162 'pm2 list | grep dianjie-v4'
# 期望: dianjie-v4-api / dianjie-v4-web / dianjie-v4-cmb 三个均 online

ssh root@116.62.32.162 'curl -s http://localhost:5001/health'
# 期望: {"status":"ok","env":"prod","url":"https://cdc.cmbchina.com/...","uid":"<生产UID>", ...}
```

---

## 4. 生产首笔试拨（**强烈建议人工触发，禁止自动 cron**）

```bash
ssh root@116.62.32.162
BIZNO="PROD-FIRST-$(date +%Y%m%d%H%M%S)"
curl -s -X POST http://localhost:5001/transfer \
  -H 'Content-Type: application/json' \
  -d "{
    \"toAccount\": \"<事先约定的财务人员账号>\",
    \"toName\":    \"<对应户名>\",
    \"amount\":    \"0.01\",
    \"bizNo\":     \"$BIZNO\",
    \"remark\":    \"生产首拨 0.01 验证\"
  }"
```

**预期返回**：
```json
{
  "success": true,
  "resultCode": "SUC0000",
  "txNo": "BAK...",            // 银行 bakAppNbr
  "raw": { ... "reqSts": "BNK" ... }
}
```

**异常处理**：
- `resultCode != SUC0000` → **立即记录全部 raw + 联系招行分行**，不要重试
- 网络超时 → 等 30 秒，**用同样 bizNo** 调 `/query` 查重；银行有记录就成功了，没记录才同 bizNo 重试
- 切勿用新 bizNo 重发（违反 yurRef 防重协议，可能重复扣款）

---

## 5. 上线后 7 天监控点

```
[ ] 每天看 /app/.../dianjie-v4-cmb.err.log 是否有 5xx / 异常
[ ] paymentSchedule 自动付款流首次触发后, 检查 RevenueTransaction / PaymentSchedule
    .bankTxNo 是否填了 bakAppNbr
[ ] pm2 list 看 cmb 进程内存 / restart 计数
[ ] 招行后台对账 — 我方 yurRef + bakAppNbr 是否能对得上银行流水
```

---

## 6. 回滚预案（cmb 出事不影响 api/web）

```
情况 1 · cmb 进程崩溃 / 高错误率
  pm2 stop dianjie-v4-cmb
  → executeBankPayment 的 cmbHealthCheck() 返 false
  → 自动付款流前置检查时抛"招行微服务不可用"，账期保持 PENDING
  → 不会扣款；后续修好再 pm2 start

情况 2 · 误把生产 URL 用了测试密钥
  立即 pm2 stop dianjie-v4-cmb
  改 .env 把 CMB_* 全清掉
  联系招行分行说明，避免触发风控
  → 重新走 §1

情况 3 · 单笔付款异常（资金没到 / 重复扣）
  立即调 /query 拿到银行实际状态
  如确认重复 → 联系招行做反向冲销（cmb 微服务无此能力，必须银行后台）
```

---

## 7. 密钥轮换（建议每 6 个月）

1. 招行后台生成新 SM2 密钥对，下发对称密钥
2. 更新 `~/Desktop/免前置Demo/云洱密钥.txt`（本地档案，禁止入 git）
3. SSH 服务器修 `/app/dianjie-v4/.env` 替换 `CMB_PRIVATE_KEY` / `CMB_PUBLIC_KEY` / `CMB_SYM_KEY`
4. `pm2 restart dianjie-v4-cmb`
5. 调一次 `/health` + `BB1PAYQR` 查空日期 → 看是否 SUC0000；失败说明新密钥未生效
