# 验证：拨测、测试门禁、smoke、回滚

## 1. 永不缓存清单（硬规则）

以下**禁止**进入 Cache API、CDN 规则、或被 `_headers` 改成可缓存：

- 限额 / 计数：如 `/api/play-limit`
- 对局中：`/api/sessions*`、`/api/rounds*`、`/play/*`
- 个人：`/api/players/me`、一切依赖 cookie 判断"是否本人"的响应体
- `/api/analytics`（若有）
- **所有 POST / PUT / PATCH / DELETE**

smoke 必须断言：这些路径不能出现 `cf-cache-status: HIT`；最好 `Cache-Control: no-store`。

---

## 2. Globalping 标准流程

### 参数
| 项 | 建议 |
|---|---|
| 地点 | ~40（脚本默认覆盖北美/南美/欧洲/中东/非洲/东亚/东南亚南亚/大洋洲） |
| 每路径轮数 | 3（需要判双峰时可 6–8） |
| 路径 | 首页 `/`；至少 1 个动态页（result/share 或等价）；`static=auto` 参照组 |
| 探针集 | 首次记下 measurement id；之后一律 `--reuse` |
| 冷窗口 | deploy 后约 **3 分钟内** |
| 热窗口 | deploy 后约 **10 分钟**（或持续有流量后） |
| Token | `$GLOBALPING_TOKEN` 可选；429 时脚本会 sleep 重试 |

### 命令
```bash
python3 scripts/gp_probe.py --host "$HOST" --label after-B \
  --path home=/ --path share=/share/<id> --path result=/result/<id> \
  --path static=auto --rounds 3 --reuse "$PROBE_SET_ID" --out ./probes
python3 scripts/analyze.py ./probes/after-B ./probes/baseline
```

### 怎么读结果
- 主看 **TTFB p50/p90**（firstByte）；total 作参考。
- 分区表：北美 / 南美 / 欧洲 / 中东 / 非洲 / 东亚 / 东南亚南亚 / 大洋洲 / 全球。
- 静态参照组若也慢：先修 CDN/_headers，再谈 HTML。
- **双峰**（同区有时 70、有时 350）：冷实例；对比 rollback 版本，相同则非回归。冷/热两轮都要写进报告。
- 单轮噪声：欧亚单点偶发升高，看全球 p50 + 多轮，不要因一轮 EU 抖动回滚。

---

## 3. 每个 PR 上线前的门禁

```
typecheck + lint
    → 单测（含本步新增：batch 对照、edge-cache TTL/版本/开关、replica 回退）
    → 本地全量 E2E（去掉真实模型 key，例如 env -u OPENAI_API_KEY）
    → 记 wrangler deployments list 当前 version = ROLLBACK_ID
    → deploy
    → smoke.sh
    → （可选）只读线上 E2E
    → （本步若动写入路径）最小写入脚本
    → 冷拨测 + 热拨测
    → 写进度日志；确认有收益再开下一步 PR
```

### E2E flake 处理
- 失败后对该 spec **连跑 3 次**；全过且本 PR 未改相关 UI → 记为 flake，报告里点名，不掩盖。
- 可选：`opennextjs-cloudflare preview` + 本地 D1 在 workerd 跑关键路径；**main 用同一 harness 对照**，避免把 harness 问题算到新代码上。

### 单测最低要求（按步骤）
| 步骤 | 必测 |
|---|---|
| C | 新旧 getResult 输出一致；非本人 /result 200 + canonical |
| D | TTL 过期；BUILD_ID 换 key；`EDGE_CACHE=off`；null 不入缓存 |
| CF-2 | 空副本 → 回退主库；fresh 只主库；写入不经副本；`D1_REPLICA=off` |

---

## 4. smoke 清单（`scripts/smoke.sh`）

用环境变量配置，勿写死域名：

```bash
export BASE=https://example.com
export SEO_PATHS="/ /faq /about /pricing"          # 自指 canonical + 打印 cache 头
export NOINDEX_PATHS="/result/<id> /play/<id>"     # meta robots noindex
export XROBOTS_PATHS="/games"                      # X-Robots-Tag: noindex
export REDIRECTS="https://www.example.com/faq https://app.workers.dev/faq"
export NOCACHE_PATHS="/api/play-limit?pk=smoke-$RANDOM /api/sessions/does-not-exist"
export SITEMAP_MIN=10
export SITEMAP_EXCLUDE="/games"
bash scripts/smoke.sh
```

### 逐步额外断言（建议写进进度日志）
| 步骤 | 额外检查 |
|---|---|
| A | `_next/static` → `immutable` |
| B | SEO 页 `x-opennext-cache: HIT`；HIT 时 `X-Robots-Tag` 仍在 |
| C | `/result` 非本人 **无 307**（`-D -` 看首跳）；canonical → `/share/...` |
| D | OG `Cache-Control: public, max-age=86400`；限额非 HIT |
| E | 无效 body 仍返回原错误码（如 400 invalid_request） |
| CF-1 | 动态响应不再误导性带 `cf-placement: remote-*`（按你的目标） |
| CF-2 | 打完立刻读本人结果 200；第 N+1 局限额生效 |

本机快速 A/B（不能代替全球拨测）：
```bash
bash scripts/box_ttfb.sh "https://$HOST/share/<id>" 15
```

---

## 5. 线上：只读 vs 最小写入

**只读**：SEO pages、meta、icons、i18n 路由等 Playwright 项目；`baseURL` 指向生产；**不要**带会创建对局的 bypass header。

**最小写入脚本**（动到 C/D/CF-2 时）：
1. 随机 `playerKey`，连续完成 N 局（N=日限额）。
2. 每局结束后立刻：本人结果页、结果 API、陌生人分享页 —— 均应 200 且数据正确。
3. 第 N+1 局应被拒（429 / 业务错误码）。
4. 报告写明：留下几条匿名榜进行、等级多少；必要时事后清理（需单独批准）。

---

## 6. 进度日志模板

```markdown
### PR-X <标题> — DONE
- PR <url>（squash <sha>）。Unit N pass；E2E N passed（时长）；flake：…
- Deploy version <new>；rollback → <prev>。Startup N ms；upload N KiB / gzip N KiB。
- 开关：EDGE_CACHE=…；D1_REPLICA=…；placement=off/on。
- Smoke：全部 PASS（贴关键头摘要）。
- Probe after-X（reuse <id>）：
  - 冷（T+3m）：home/result/share/static p50/p90 = …
  - 热（T+10m）：… → 相对 baseline 变化 %
- 偏差 / 决策：例如 Early Hints 无效已关；Placement A/B 全球变差保持关。
- 回滚演练：（可选）确认 rollback 后 placement 状态。
```

---

## 7. 回滚程序

1. **代码**：`npx wrangler rollback <ROLLBACK_ID>`（秒级）。
2. **确认 placement**：`curl -sI` 看 `cf-placement`；若不对，用正确 `wrangler` **再 deploy 一次**（rollback 不够）。
3. **功能开关**（不回滚代码）：`EDGE_CACHE=off`、`D1_REPLICA=off`、`RESULT_BUNDLE=off`。
4. **D1 副本**：`read_replication.mode=disabled`。
5. **Zone**：Tiered / Topology / 0rtt / early_hints 逐项 PATCH 回原值（见 cloudflare-settings.md）。
6. **验证**：smoke + 热拨测抽样，确认回到预期基线带。

---

## 8. 报告给用户时最少包含

- 各步 PR 链接与最终 version / rollback id
- 全球及分区 before/after 表（热）；冷测一句说明
- 测试：单测数、E2E 结果、flake 说明、smoke、线上写入检查副作用
- 明确**未做**的事（未轮换密钥、未改 DNS/Email、未开付费 Argo 等）
