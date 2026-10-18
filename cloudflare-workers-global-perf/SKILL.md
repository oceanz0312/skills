---
name: cloudflare-workers-global-perf
description: >-
  给跑在 Cloudflare Workers 上的站点（尤其 Next.js + OpenNext + D1）做全球提速：先用 Globalping
  多地区拨测量出各区域 TTFB，再按"静态资源缓存 → SEO 页走静态缓存 → 查询合并 → 边缘缓存 →
  瘦身 → zone 配置 → D1 读副本"逐个 PR 上线、复测、记回滚点。用户说"网站在某些地区打开很慢"
  "全球拨测一下""Workers/OpenNext/D1 提速""TTFB 太高"时使用。
---
# Cloudflare Workers 全球提速

适用：Worker 在用户附近的机房运行，但页面每次都重新渲染，或者要跨洋查单区域的 D1，导致欧洲、亚洲、南美 TTFB 达到 0.5–2 s。非 Next 的 Worker 也适用：第 3–8 步都是通用的。

## 原则
1. **先测量，再动手。** 用 Globalping 在约 40 个地点各跑 3 轮，覆盖首页、动态页和一个静态 JS（作参照组），按区域出 TTFB p50/p90，并且要区分冷和热。如果建连（DNS+TCP+TLS）只占 15–60 ms，说明时间都花在服务器端。
2. **读响应头定位原因。** 看 `x-nextjs-cache` / `x-opennext-cache`、`cf-cache-status`、`cf-placement`、`cache-control`。代码层面要找出：每次都 SSR 的静态页、串行查询、重复查询，以及 307 跳转链。
3. **先写方案，批准后再改。** 每项写清现状、改法、预期收益、风险和回滚方式。改 zone 配置要单独批准。
4. **一个 PR 只做一步。** 每一步都按这个顺序走：单测 → 全量 E2E → 记下当前版本号（作为回滚点）→ deploy → smoke → 复测拨测 → 写进进度日志。确认有收益再做下一步。
5. 不打印 token，Cloudflare 和 Globalping 的 token 都从环境变量读。

## 步骤（按收益和风险排序，细节见 references/playbook.md）
| # | 步骤 | 典型收益 |
|---|---|---|
| A | `public/_headers`：`/_next/static/*` 设为 immutable，图片和图标给合理 TTL | 静态资源 p50 降约 40–55% |
| B | OpenNext `staticAssetsIncrementalCache` + `enableCacheInterception`，SSG/SEO 页直接从 assets 返回 | 首页 p50 降约 40%，冷启动的影响也小很多 |
| C | D1 `db.batch()` 把串行查询合成 1 次往返；React `cache()` 去掉 metadata 和页面之间的重复查询；去掉 307 跳转链 | 动态页 p50 降约 50% |
| D | Cache API 边缘缓存：按数据的可变性分别设 TTL，key 里带 BUILD_ID，带 kill switch，本人请求或 fresh 请求绕过缓存 | 分享类页面再降约 60% |
| E | 瘦身 bundle（去掉重复打包的库、zod→zod/mini、dev-only 依赖换成空模块） | 收益小，startup 已经低于 25 ms 时不必深挖 |
| CF-1 | 评估 Smart Placement（低流量、全球用户的站点往往关掉更好）；打开 Tiered Cache + Smart Topology 和 0-RTT；Early Hints 只在响应带 `Link: rel=preload` 时才有用 | 小，主要作用是去掉误导性配置 |
| CF-2 | D1 read replication + Sessions API：只让能容忍复制延迟的公开读走副本；写入、限额和本人刚产生的结果读主库；副本未命中时回退主库；加 kill switch | 动态页再降一截 |

zone 和 D1 的 API 调用、Smart Placement 的坑见 references/cloudflare-settings.md。

## 验证（细节见 references/verification.md）
- 永不缓存清单：限额和计数接口、对局或 session 接口、`/me` 类接口、所有 POST、所有读 cookie 的个性化结果。
- 每次 deploy 后跑 smoke：canonical、noindex 和 `X-Robots-Tag`、robots/sitemap、www 和 workers.dev 的 301、`_next/static` 是否 immutable、SEO 页是否 cache HIT、限额接口是否没有被缓存。
- 线上只做只读检查，加一个最小写入流程脚本（建 1 个用户跑完流程，立即读结果，并验证限额）。
- **冷实例**：低流量 Worker 的拨测结果会呈双峰（约 70 ms 和约 350 ms）。部署后马上测是冷的，隔约 10 分钟再测一轮才是热的，两轮都要报告。

## 脚本
- `scripts/gp_probe.py`：Globalping 拨测，多路径 × N 轮，可以复用同一批探针做前后对比。
- `scripts/analyze.py`：按区域出 p50/p90 表，可以和基线目录对比。
- `scripts/smoke.sh`：只读线上冒烟模板，用环境变量和参数指定 URL 列表。
- `scripts/box_ttfb.sh`：在本机 curl N 次，给出 TTFB 中位数，用于快速 A/B。

实战案例（全球首页 p50 432→68 ms）见 references/worked-example.md。
