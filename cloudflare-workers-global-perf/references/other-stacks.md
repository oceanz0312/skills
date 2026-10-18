# 其他框架 / 平台：7 步怎么映射

本 skill 的主路径是 Next.js + OpenNext + Cloudflare Workers + D1。下面把 **A–E、CF-1、CF-2** 映射到常见栈，并标明**迁不过去**的东西。原则不变：先拨测 → 一步一 PR → 复测 → 记回滚点。

图例：✅ 几乎直接可用 · ↔️ 有等价物但 API 不同 · ❌ 无对等能力 / 别照搬

---

## 总表

| 步骤 | Cloudflare Workers + OpenNext | Vercel | Netlify | Node 自建 + CDN | 纯 CF Workers/Pages | Remix/SvelteKit/Nuxt@Workers | CloudFront / Fastly / Bunny |
|---|---|---|---|---|---|---|---|
| A 静态 immutable | ✅ `_headers` | ✅ 默认 hashed；查 `Cache-Control` | ✅ `_headers` / 头配置 | ↔️ CDN 行为 + 源站头 | ✅ Pages `_headers` | ✅ 各适配器静态目录 | ✅ Cache-Control / Cache Policy |
| B 静态 HTML 缓存 | ✅ OpenNext incremental + interception | ✅ ISR/SSG 边缘缓存原生 | ✅ CDN 缓存 + 构建页 | ↔️ CDN 缓存 HTML + 净化 cookie | ↔️ Pages 预渲染或 Cache API 自己写 | ↔️ 适配器 SSG；或自己 Cache API | ↔️ 整页缓存 + 变体键 |
| C 查询合并 | ✅ D1 batch + React cache | ✅ 任意 DB；React cache 同 | ✅ 同左 | ✅ 同左 | ✅ 自己写 batch/并行 | ↔️ loader 去重（见下） | ✅ 与 CDN 无关，在源站做 |
| D 边缘数据缓存 | ✅ Cache API | ↔️ Data Cache / Redis / KV | ↔️ Durable Cache / Blobs | ↔️ Redis/CDN surrogate | ✅ Cache API / KV | ✅ Cache API 或平台 KV | ↔️ Edge KV / Surrogate-Key |
| E 瘦身 | ✅ 减 handler.mjs | ↔️ 减 Serverless Function 体积 | ↔️ 同 | ↔️ 减 Node 启动与模块 | ✅ 减 Worker 包（1–10 MB 级限制） | ✅ 同 Workers 限制 | ↔️ 源站进程/镜像体积 |
| CF-1 拓扑 / 协议 | ✅ Tiered/Topology/0-RTT；Placement 慎用 | ❌ 无 Placement；CDN 自动 | ❌ 无 Placement | ↔️ CDN Origin Shield / 区域 | ✅ 同 CF zone 设置 | ✅ 同 CF | ↔️ Origin Shield / Midgress / POPs |
| CF-2 读副本 | ✅ D1 read replication | ↔️ Neon/PlanetScale/Aurora 只读 | ↔️ 同左 | ↔️ PG/MySQL 只读副本 | ↔️ D1 或外置 Turso/Neon | ↔️ 同左 | ↔️ 同左（在源站连副本） |

---

## 1. Next.js on Vercel

| 步骤 | 怎么做 |
|---|---|
| A | `/_next/static` 默认长缓存；用 `curl -sI` 确认 `immutable`。`public/` 下无 hash 资源自己设 `headers`（`next.config.js` → `headers()`）。 |
| B | SSG/ISR **原生**在边缘；`revalidate` / `fetch` cache / `unstable_cache`。不必 OpenNext。对照诊断：看 `x-vercel-cache: HIT\|MISS\|STALE`。 |
| C | 完全适用：`db` 侧 batch、React `cache()`、去 redirect 链、SSR `initialData`。 |
| D | 优先 Next Data Cache / `unstable_cache`；跨请求且要秒级可用 Redis（Upstash）或 KV。不要假设有 Workers Cache API。 |
| E | 关注 Serverless Function 体积与 Cold Start；`outputFileTracing` 已默认。zod/mini 等手段仍有用。 |
| CF-1 | **无 Smart Placement**。区域用 Vercel Regions；CDN 已全球。0-RTT/HTTP3 由平台托管。 |
| CF-2 | 用 **Neon / Supabase / PlanetScale / Aurora** 只读副本或边缘驱动（Neon cold start 另测）；应用层同样：写入与限额走主库，公开读可走副本。 |

**迁不过去**：OpenNext `enableCacheInterception`、`public/_headers` 语法、`cf-placement`、D1 Sessions API。

**拨测同样适用**；把分析脚本的 cache 头字段加上 `x-vercel-cache`。

---

## 2. Next.js on Netlify

| 步骤 | 怎么做 |
|---|---|
| A | `public/_headers`（Netlify 语法与 CF 类似）或 `netlify.toml` `[[headers]]`。 |
| B | 构建页默认进 CDN；Next Runtime 缓存行为跟版本走——用响应头与文档确认，不要照抄 OpenNext 配置。 |
| C–E | 与框架层相同（batch、cache()、瘦身）。 |
| CF-1/2 | 无 CF Placement/D1。DB 副本策略同 Vercel 节。 |

---

## 3. Next.js（或任意 Node）自建 + CloudFront / Fastly / Bunny / 通用 CDN

| 步骤 | 怎么做 |
|---|---|
| A | 源站或 CDN 策略：`/_next/static/*` → `max-age=31536000, immutable`。CloudFront Cache Policy；Fastly `beresp.ttl` + `Surrogate-Key`；Bunny Pull Zone 规则。 |
| B | **整页缓存 HTML** 时必须设定：忽略何种 cookie、何种 query；登录态 / Set-Cookie 要 bypass。否则要么不命中，要么串会话。这是与 Workers 最大差异点。 |
| C | 在 **源站**做：连接池、SQL batch、去掉 302/307 链、HTTP keep-alive。CDN 帮不上查询合并。 |
| D | Surrogate / Edge KV（Fastly KV、CloudFront Functions + KeyValueStore、Bunny Edge Storage）。TTL 分层与"昵称进短 TTL"教训仍适用。 |
| E | Node 冷启动、容器镜像体积、懒加载路由。 |
| CF-1 等价 | **Origin Shield**（CloudFront）、Fastly Shield、Bunny Optimizing；选离数据库近的 shield，而不是把所有流量钉死在一个区。 |
| CF-2 等价 | Aurora Reader、Cloud SQL replica、PG streaming replica、PlanetScale、Turso（边缘 SQLite）、Neon。应用层：主库写 + 限额；公开读副本；replica lag → 回退主库。 |

**迁不过去**：Worker isolate 冷启动画像、`wrangler rollback`、D1 `withSession`。多了：**HTML 缓存与 cookie 变体**这一大类问题。

---

## 4. 纯 Cloudflare Workers / Pages（无 OpenNext）

| 步骤 | 怎么做 |
|---|---|
| A | Pages：`public/_headers` 或 `_routes.json` 配合；Workers + Assets：同样 `_headers`。 |
| B | Pages 预渲染；或在 Worker 里对可公开 GET 自己 `caches.default.put`。无 OpenNext interception —— 命中时你就别 `import` 重模块。 |
| C | 手写数据层：`env.DB.batch([...])`（D1）、或对其它 DB 做并行。无 React `cache()` 时，用模块级 memo / `ctx` 上挂 per-request 字典去重。 |
| D | Cache API helper 与 playbook D **几乎原样可用**（去掉 `OPEN_NEXT_BUILD_ID`，换成你的 `env.BUILD_ID` / deploy hash）。 |
| E | Worker 包限制严格（常数量 MB 级）；避免打进 wasm/重型解析器；OG 图拆 Worker。 |
| CF-1 / CF-2 | 与主 skill **完全相同**（同一 zone / D1）。 |

适合：API-only、小型 SSR（Hono + JSX）、已用 Pages Functions 的站。

---

## 5. Remix / SvelteKit / Nuxt 在 Workers（或 Node）

### 共同点（步骤 C 的框架对应）
| 框架 | "metadata + page 双查"等价物 | 去重方式 |
|---|---|---|
| Remix | 多个 `loader` 依赖同一数据 | 用 `context` 传已载入数据；或单 loader 聚合 |
| SvelteKit | `+page.server.ts` + `+layout.server.ts` 重复 fetch | `locals` / 共享 `load` 父级 |
| Nuxt | 双 `useAsyncData` / 无 key | 稳定 `key` + `useRequestEvent` 缓存 |
| Next | `generateMetadata` + page | React `cache()` |

### Workers 上
- A/D/CF-1/CF-2：与纯 Workers 相同。
- B：看适配器是否支持 SSG/prerender 产物进 Static Assets；否则自己 Cache API。
- Remix Vite Cloudflare 适配器、SvelteKit `adapter-cloudflare`、Nuxt CF preset —— 各自确认**预渲染文件落点**与响应头。

### Node 上
- 回到"自建 + CDN"节；loader 去重仍在应用层做。

---

## 6. AWS Lambda@Edge / CloudFront Functions

| 步骤 | 怎么做 |
|---|---|
| A | CloudFront Cache Policy + 源站头。 |
| B | 整页缓存 + 缓存键（是否含 query/cookie/Authorization）。Lambda@Edge 做 A/B 或鉴权时小心别把所有 HTML 变成 dynamic。 |
| C | 在**源**（ALB/ECS/Lambda）做 batch；Edge 函数里不宜跑重查询。 |
| D | CloudFront KeyValueStore、ElastiCache、或源旁 Redis；TTL 分层同。 |
| E | Lambda 包体积与冷启动；Edge 函数有更严限制（用 CloudFront Functions 做跳转/头改写，逻辑放源站）。 |
| CF-1 等价 | Origin Shield + 正确 Origin 区域。 |
| CF-2 | Aurora Reader 等。 |

**迁不过去**：D1 Sessions、`wrangler`、Workers Cache API 语义（改用 CF 自己的策略与 KVS）。

---

## 7. Fastly / Bunny 速查

**Fastly**
- A/B：VCL/`beresp.ttl`、`Surrogate-Control`、`Surrogate-Key` 便于精准 purge（这是 CF Cache API **没有**的能力——CF 侧用短 TTL + BUILD_ID 代替 purge）。
- D：Edge Dictionaries / KV Store。
- Shield POP ≈ Origin Shield。

**Bunny**
- Pull Zone 缓存规则 + Edge Rules；便宜全球 CDN。
- 动态逻辑弱于 Workers —— 重逻辑仍在源站；A/B/部分 D 很合适。

---

## 8. 数据库侧：CF-2 的跨平台等价

| 产品 | 读扩展方式 | 应用层注意 |
|---|---|---|
| Cloudflare D1 | `read_replication` + `withSession` | 限额/本人 fresh → 主库；miss 回退 |
| Turso (libsql) | 边缘 replica | 写主库；读 replica URL |
| Neon | 区域 / 只读 endpoint；注意冷启 | 池化；冷启计入拨测 |
| PlanetScale | 读只从 replica | Vitess 已处理部分路由；仍勿在副本上扣配额 |
| Aurora / RDS | Reader endpoint | 会话粘滞；lag 监控；限额走 writer |
| Postgres 自建 | Streaming replica | 同上 |
| Redis / KV | 不是 SQL 副本；作 D 层缓存 | 与 DB 副本互补，不替代一致性方案 |

**共同应用规则（任意平台）**
1. 写入与配额校验永远打主库（或 writer）。
2. 公开、可延迟的读才打副本。
3. "刚写完立刻读自己" → 主库或 bookmark/会话一致性。
4. 副本空/miss → 回退主库，避免假 404。
5. 环境变量 kill switch。

---

## 9. 明确不要照搬的东西

| 做法 | 为何别照搬 |
|---|---|
| 全站 Smart Placement | 静态为主的全球站常负收益；其它平台根本没有这个旋钮 |
| 依赖 `s-maxage` 让 CDN 缓存 Worker HTML | Worker 在缓存前执行；OpenNext/自己 Cache API 才管 HTML |
| Early Hints 无 Link 头仍开启 | 无效配置，增加噪音 |
| 把用户可改字段塞进长 TTL | 昵称/头像/标题陈旧 |
| HTML 全页 CDN 缓存且不剥离 cookie | 串会话、不命中、或缓存私密页 |
| `wrangler rollback` 后默认 placement 已复原 | **不会**；见 cloudflare-settings.md |
| 在副本上做限额扣减 | 超卖 / 多玩 |
| 为 E 过度拆架构 | startup 已很低时收益≈0 |

---

## 10. 换栈时的最小行动清单

1. 用 `scripts/gp_probe.py`（改 `--host`）拉基线；分析脚本可按平台加 cache 头字段。
2. 对照总表：只做目标平台上是 ✅/↔️ 的步骤。
3. 每步仍：方案 → 批准 → PR → 测试门禁 → deploy → smoke → 冷/热拨测。
4. 把平台特有回滚方式写进进度日志（Vercel Instant Rollback、Netlify deploy rollback、CloudFront 版本、Fastly 配置 clone 等）。
