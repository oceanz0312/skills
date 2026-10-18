# 框架与平台背景：为什么边缘上也慢

本 skill 默认栈是 **Next.js App Router → OpenNext → Cloudflare Workers →（可选）D1**。下面把每一层在请求路径上干什么讲清楚，再解释"Worker 明明在用户旁边，为什么还要 0.5–2 s"。别的栈对照见 other-stacks.md。

## 1. 请求经过的层（从外到内）

```
浏览器
  │  DNS / TCP / TLS（可开 0-RTT 省回访一次握手）
  ▼
Cloudflare 边缘 POP（用户附近的机房）
  │  Tiered Cache / Smart Topology：MISS 时先问上层大机房，再回源
  │  Early Hints：若响应有 Link: rel=preload，可先发 103
  ├─► Workers Static Assets          ← public/、构建产物、_headers 管的 JS/CSS/图/图标
  │     不启动 Worker；只按 _headers 回 Cache-Control
  └─► Cloudflare Worker 运行时
        │  Smart Placement 可能把 isolate 挪到离数据库近的区域（见 §4）
        │  OpenNext 把 Next.js 编成一个大 handler.mjs（常 5–8 MB）
        ├─ SEO / SSG 页：若配了 staticAssetsIncrementalCache + enableCacheInterception
        │                 → 直接从 assets 读预渲染 HTML，不加载渲染器
        ├─ 动态页 / API：跑 React Server Components / Route Handlers
        └─► D1（默认单区域，例如 WNAM）
              跨洋 RTT：欧洲/亚洲常见 100–250 ms / 次
              可选：read replication + Sessions API（CF-2）
```

**关键词对照**

| 名词 | 是什么 | 和本 skill 的关系 |
|---|---|---|
| **Next.js App Router** | React 全栈框架：RSC、`generateMetadata`、Route Handlers、`prerender-manifest` | 页面默认可能被当成动态；纯静态页也要靠 OpenNext 缓存才不会每次 SSR |
| **OpenNext（`@opennextjs/cloudflare`）** | 把 Next 构建产物适配到 Workers / Static Assets 的适配层 | `open-next.config.ts` 的 `incrementalCache`、`enableCacheInterception` 决定 SEO 页走不走 assets |
| **Cloudflare Workers** | V8 isolate 边缘运行时；按请求计费；有 CPU 时间与包体积限制 | 冷启动要解析整个 `handler.mjs`；低流量机房经常冷 |
| **Workers Static Assets** | 与 Worker 同 zone 的静态文件分发；读 `public/_headers` | `_next/static` 的 immutable 缓存在这里生效，不经 Worker |
| **D1** | SQLite 托管；**默认单区域**（创建时选定，不能原地改区） | 边缘 Worker + 远端 D1 = 每次查询一次跨洋 RTT；读副本是 CF-2 |
| **Cache API** | 每个 POP 一份的 `caches.default`；免费；TTL 到期；**不能全球 purge** | PR-D 的边缘缓存；key 必须带 BUILD_ID |
| **Tiered Cache + Smart Topology** | 边缘 MISS → 上层大机房 → 源；免费 | 对走 CDN 的图 / OG 有帮助；对 Worker HTML 基本无效 |
| **Smart Placement** | 自动把 Worker 挪到"离后端近"的地方 | 低流量、全球用户、静态页占比高的站 → 常变成负收益；且**不随 `wrangler rollback` 回滚** |
| **0-RTT（TLS）** | 回访时跳过一次握手往返 | 只影响建连；GET 可安全重放时再开 |
| **Early Hints（103）** | HTML 算完前先让浏览器下 CSS/字体 | **只有响应带 `Link: rel=preload` 头才有用**；Next 常把 preload 写在 HTML 里，OpenNext HIT 也不带 Link → 白开 |

## 2. Next.js App Router 在这套部署里的行为

- **构建期**：`next build` 产出 `.next/`；OpenNext 再编成 `.open-next/`（assets + `server-functions/default/handler.mjs`）。
- **`prerender-manifest.json`**：`revalidate: false` 且不读 cookie/DB 的路由 = 纯静态。若 OpenNext **没**配 incremental cache，线上仍会每次跑 React（响应头常见 `x-nextjs-cache: MISS`，同时傻傻带着 `s-maxage=31536000`——CDN **不会**缓存 Worker 返回的 HTML，所以这个 `s-maxage` 对 HTML 无效）。
- **`force-dynamic` / 读 `cookies()` / 读 `headers()` / 查 D1**：每请求都进 Worker。这是结果页、分享页、API 的常态。
- **`generateMetadata` + 页面组件**：同一次请求各调一次 loader → **查两遍**，除非用 React `cache()` 去重。
- **Route Handler / Server Action**：和页面一样吃 D1 RTT；POST 与个性化响应 **绝不**进 Cache API。

## 3. 为什么"边缘"还会慢（按频率）

1. **每次 SSR 静态页**  
   没有 `staticAssetsIncrementalCache` 时，首页也要加载整包 handler 再渲染。热约 50–150 ms，冷 0.5–1.5 s。

2. **D1 串行瀑布**  
   `getResult` 一类：result → best → outcomes → rank，4 次串行 × 150 ms ≈ 600 ms，尚未计渲染。欧洲/亚洲最明显。

3. **冷 isolate**  
   handler 5–8 MB；低流量站很多 POP 没有热实例。拨测呈**双峰**（~70 ms / ~350 ms）。这不是代码回归——回滚旧版本同样双峰。

4. **静态资源短缓存**  
   缺 `public/_headers` 时 `_next/static` 常是 `max-age=0, must-revalidate`。回访 10–20 个文件各验证一次，亚太/南美每次进站白等 0.3–1 s。

5. **跳转链**  
   `/result` 查库发现非本人 → 307 → `/share` 再查一遍。北美以外合计 1.8–2.5 s 很常见。

6. **Smart Placement 帮倒忙**  
   静态页不查库却被挪到 D1 附近 → 离用户更远。表现为北美变快、全球变慢。

7. **重复查询 / 客户端瀑布**  
   metadata+page 双查；排行榜组件挂载后再请求 `/api/leaderboard`（服务端已有数据）。

## 4. Smart Placement vs 读副本（别混）

| | Smart Placement | D1 read replication（Sessions API） |
|---|---|---|
| 动的是什么 | **Worker 代码**跑在哪 | **数据副本**在哪 |
| 对静态页 | 可能变慢（离开用户） | 无影响 |
| 对动态读 | 略近主库 | 就近读副本（10–50 ms 级） |
| 一致性 | 无关 | 有复制延迟；刚写入要读主库或带 bookmark |
| 回滚 | **不进版本**；`wrangler rollback` 不恢复 | API 关 `read_replication`，或 `D1_REPLICA=off` |

经验法则：静态页占比高、用户全球分布、流量低 → **关掉 Placement，用读副本解决数据距离**。

## 5. 和"传统 CDN 回源"的差别

- 没有"源站机房"可以 Argo 优化；Worker **本身就是边缘计算**。
- Cloudflare Cache Rules 管不到 Worker 生成的 HTML（Worker 在缓存前面执行）。HTML 缓存要靠 OpenNext incremental cache 或你自己在 Worker 里用 Cache API。
- `_headers` 只作用于 Static Assets，不作用于 Worker 响应。

## 6. 诊断时先看哪些头

```bash
curl -sI "https://$HOST/" | tr -d '\r' | grep -iE '^(cache-control|cf-cache-status|x-nextjs-cache|x-opennext-cache|cf-placement|server|age):'
curl -sI "https://$HOST/_next/static/chunks/SOME.js" | tr -d '\r' | grep -i cache-control
```

| 头 | 含义 |
|---|---|
| `x-nextjs-cache: MISS` + 长 `s-maxage` | HTML 每次 SSR，CDN 没帮上忙 → 做步骤 B |
| `x-opennext-cache: HIT` | OpenNext 静态缓存命中 → B 已生效 |
| `cf-cache-status: HIT/MISS` | Cloudflare CDN 层（多见于静态资源 / 你显式公开缓存的响应） |
| `cf-placement: local-*` | Worker 在用户附近 |
| `cf-placement: remote-*` | 被 Smart Placement 挪走 |
| `cache-control: … immutable` | 步骤 A 对 hashed 静态资源已生效 |
| 无 `cf-placement` | Placement 已关（或该响应没走 Worker） |

建连 vs 服务器时间：用 Globalping 的 `timings`（dns/tcp/tls/firstByte/total）。若 dns+tcp+tls 的 p50 只有 15–60 ms，而 TTFB 几百到上千，瓶颈在服务器端（本 skill 的主战场）。
