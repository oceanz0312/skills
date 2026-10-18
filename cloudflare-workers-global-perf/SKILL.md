---
name: cloudflare-workers-global-perf
description: 给跑在 Cloudflare Workers 上的站点（尤其 Next.js + OpenNext + D1）做全球提速：先用 Globalping 多地区拨测量出各区域 TTFB，再按"静态资源缓存 → SEO 页走静态缓存 → 查询合并 → 边缘缓存 → 瘦身 → zone 配置 → D1 读副本"逐个 PR 上线、复测、记回滚点。用户说"网站在某些地区打开很慢""全球拨测一下""Workers/OpenNext/D1 提速""TTFB 太高"时使用。也覆盖其他框架/平台的对照映射。
---
# Cloudflare Workers 全球提速

适用：Worker 在用户附近的机房运行，但页面每次都重新渲染，或者要跨洋查**单区域**的 D1，导致欧洲、亚洲、南美 TTFB 达到 0.5–2 s。非 Next 的 Worker、以及 Vercel / Netlify / Node / Fastly 等平台，也能对照 references/other-stacks.md 做等价改动。

## 先搞清栈在干什么（详见 references/background.md）
请求大致经过：浏览器 → Cloudflare 边缘（DNS / TLS / 0-RTT / Tiered Cache）→ Workers Static Assets（`_headers` 管的 JS/CSS/图）或 Worker 运行时（OpenNext 把 Next.js App Router 编成一个大 `handler.mjs`）→ 需要数据时再跨洋打单区域 D1。

Worker 跑在用户旁边，**仍然可以很慢**，常见原因：
1. 纯静态 SEO 页每次都 SSR（OpenNext 没配 incremental cache）
2. 动态页对 D1 串行查 3–4 次，欧洲/亚洲每次 100–250 ms
3. 低流量机房的冷实例（handler 几 MB，冷启动几百 ms）
4. `_next/static` 没有 `immutable`，回访每个文件都验证一遍
5. `307` 跳转链（先查库再跳，再查一遍）

名词速查：Next.js App Router / OpenNext / Workers / D1 / Cache API / Tiered Cache / Smart Topology / Smart Placement / 0-RTT / Early Hints —— 见 background.md。

## 原则
1. **先测量，再动手。** Globalping 约 40 地点 × 3 轮；覆盖首页、动态页、一个静态 JS（参照组）；出各区域 TTFB p50/p90；**冷/热各测一轮**。建连（DNS+TCP+TLS）若只占 15–60 ms，时间几乎全在服务器端。
2. **读响应头定位。** `x-nextjs-cache` / `x-opennext-cache`、`cf-cache-status`、`cf-placement`、`cache-control`。代码侧画出查询瀑布、重复查询、跳转链。
3. **先写方案，批准后再改。** 每项写清现状、改法、预期、风险、回滚。改 zone 配置要单独批准。
4. **一个 PR 只做一步。** 单测 → 全量 E2E → 记当前版本号（回滚点）→ deploy → smoke → 复测拨测 → 写进度日志。有收益再做下一步。
5. Token（`$CLOUDFLARE_API_TOKEN`、`$GLOBALPING_TOKEN`）只从环境变量读，永不打印、不入库。

## 步骤（细节 + 可粘贴配置：references/playbook.md；zone/D1 API：references/cloudflare-settings.md）
| # | 步骤 | 典型收益 |
|---|---|---|
| A | `public/_headers`：`/_next/static/*` → `immutable`；图片/图标合理 TTL | 静态 p50 ↓40–55% |
| B | OpenNext `staticAssetsIncrementalCache` + `enableCacheInterception` | 首页 p50 ↓~40%，冷启动影响大降 |
| C | D1 `db.batch()` + React `cache()`；去掉 307；SSR 带 initialData | 动态页 p50 ↓~50% |
| D | Cache API：按可变性拆 TTL，key 带 BUILD_ID，kill switch，fresh/本人绕过 | 分享页再 ↓~60% |
| E | 瘦身（zod→zod/mini、去重复 chunk、dev-only 空模块） | 小；startup <25 ms 不必深挖 |
| CF-1 | Smart Placement A/B（低流量全球站常关）；Tiered Cache + Smart Topology + 0-RTT 开；Early Hints 仅有 `Link: preload` 时有用 | 小，去误导配置 |
| CF-2 | D1 read replication + Sessions API；写入/限额/本人结果读主库；副本 miss → 回退主库；kill switch | 动态页再降一截 |

## 验证（详尽清单：references/verification.md）
- 永不缓存：限额、session/round、`/me`、analytics、所有 POST、读 cookie 的个性化输出。
- 每步前后对照响应头（playbook 每节末尾有"验证"）。
- deploy 后：smoke（canonical / noindex / robots / sitemap / 301 / immutable / cache HIT / 限额未缓存）→ 只读线上 E2E → 最小写入脚本 → 冷+热拨测。
- **冷实例双峰**（~70 vs ~350 ms）不是回归；部署后 ~3 min 与 ~10 min 都要报。
- **`wrangler rollback` 不恢复 Smart Placement**（script 级设置，见 cloudflare-settings.md）。

## 其他框架 / 平台
7 步如何映射到 Vercel / Netlify / Node、Remix·SvelteKit·Nuxt、纯 Workers/Pages、CloudFront / Fastly / Bunny —— 见 **references/other-stacks.md**。哪些能力不迁移也写在那里。

## 脚本
- `scripts/gp_probe.py` — Globalping；`--reuse` 固定探针集；token 走 `$GLOBALPING_TOKEN`
- `scripts/analyze.py` — 按区域 p50/p90，可对比基线目录
- `scripts/smoke.sh` — 只读冒烟模板（环境变量配 URL 列表）
- `scripts/box_ttfb.sh` — 本机 curl N 次的 TTFB 中位数（快速 A/B）

实战数字（全球首页 p50 432→68 ms）：references/worked-example.md。
