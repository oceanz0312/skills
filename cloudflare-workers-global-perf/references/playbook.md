# Playbook：逐步改法、代码模式与坑

每一步都要单独开 PR、单独 deploy、单独复测。下面的路径以 Next.js 16 + `@opennextjs/cloudflare` 为例。

## 0. 基线
- 拨测：`python3 scripts/gp_probe.py --host example.com --label baseline --path home=/ --path share=/share/<id> --path static=auto --rounds 3`
  - `static=auto` 会从首页 HTML 里取第一个 `/_next/static/chunks/*.js` 作为参照组。
  - 第一次运行会打印 measurement id，之后用 `--reuse <id>` 固定同一批探针，前后对比才公平。
- 读构建产物：
  - `.open-next/server-functions/default/handler.mjs` 的体积和 `*.meta.json`，用来找重复打包的模块。
  - `.next/prerender-manifest.json`，看哪些页面本来就是纯静态（`revalidate: false`）。
- 读响应头：
  - `x-nextjs-cache: MISS` 加上 `s-maxage=31536000`，说明 Worker 每次都在渲染。CDN 不会缓存 Worker 返回的 HTML，所以这个 `s-maxage` 没有用。
  - `cf-placement: local-XXX` 表示 Worker 跑在用户附近；`remote-XXX` 表示被 Smart Placement 挪走了。
- 代码：画出每个动态页的查询瀑布，统计串行往返次数，再找 `generateMetadata` 和页面之间的重复查询，以及"先查库再 307 到另一个页面"的跳转链。

## A. 静态资源长缓存（`public/_headers`）
Workers Static Assets 会读 `_headers`，这类请求不经过 Worker。没有这个文件时，默认是 `max-age=0, must-revalidate`，每个文件都要回源验证一次。
```
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
/levels/*            # 无 hash 的图片：放进带版本的目录（v1/），短 TTL + SWR
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
/favicon.ico
  Cache-Control: public, max-age=604800
/icon-*.png
  Cache-Control: public, max-age=604800
/manifest.webmanifest
  Cache-Control: public, max-age=86400
```
- 坑：文件名没有 hash 的资源不要设 immutable。要换图时，改文件名或目录版本。
- 字体预加载：先确认拉丁文是否也用到这个字体（`font-family` 栈里的第一个），再决定能不能去掉 `preload`。

## B. SEO / SSG 页走静态资源缓存
```ts
// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";
export default defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache, enableCacheInterception: true });
```
- 预渲染的 HTML 跟随每次部署发布到 assets，所以部署后马上就是新内容，不需要清缓存，也不用新建 R2 或 KV。
- `enableCacheInterception`：命中时连 Next 的渲染器都不加载，对冷启动帮助最大。
- 只读：不支持 ISR 或 revalidate。需要 ISR 的话改用 R2 + regional cache。不推荐用 KV，它是最终一致的，部署后可能读到旧页。
- 坑：
  - 页面以后如果读 cookie、加随机内容或做个性化，会被"冻住"，要写进代码规范。
  - 验证：`x-opennext-cache: HIT`。另外，`next.config` 里 `headers()` 加的头（比如 `X-Robots-Tag`）在 HIT 时还在不在，要用 E2E 或 smoke 确认。
  - `force-dynamic` 路由不受影响。

## C. 查询合并（1 个请求 = 1 次 D1 往返）
- **`db.batch([...])`**（drizzle 和原生 D1 都支持）：多条语句一次发出。每条语句都直接用入口参数（比如 publicId）作条件，用子查询代替"先查 A 再用 A 的结果查 B"：
```ts
const [heads, rows] = await db.batch([
  db.select({ result: results, nickname: players.nickname, bestLevel: bests.bestLevel,
    rank: sql<number>`1 + (SELECT count(*) FROM bests h WHERE h.version = ${results.version} AND h.best > coalesce(${bests.best}, ${results.reached}))` })
    .from(results).innerJoin(players, eq(players.id, results.playerId))
    .leftJoin(bests, eq(bests.playerId, results.playerId)).where(eq(results.publicId, id)),
  db.select().from(rounds)
    .where(inArray(rounds.sessionId, db.select({ id: results.sessionId }).from(results).where(eq(results.publicId, id)))),
]);
```
  - 能在 JS 里从已有行算出的聚合（正确率、计数），就不要再多发一条 SQL。
- **React `cache()`**：`generateMetadata` 和页面各调用一次 loader，同一个请求会查 2 遍，用 `cache()` 包住就只查一次。
```ts
export const loadResult = cache(async (id: string, fresh = false) => (await getService()).getResult(id, { fresh }));
```
- **去掉跳转链**：原来的做法是查库判断不是本人，307 到 `/share`，然后又查一遍。改成在同一个路由里直接渲染公共视图组件，canonical 指向 `/share/...`，并保持 noindex。
- **服务端带初始数据**：排行榜之类的组件挂载后不再立即 fetch，由 SSR 传 `initialData`。也可以先 stream 页面，再把这部分数据流式补上。
- **`Promise.all`**：互相独立的查询并发执行；"取自己的 best → 算名次"改成一条带子查询的 SQL。
- 坑：
  - SQL 改写容易在并列排名、空值回退这类细节上出偏差。要写对照单测，同一份数据，新旧函数的输出必须完全相同。
  - 限额扣减和退还的逻辑一个字都不要动。

## D. Cache API 边缘缓存
每个机房各自一份，免费，按 TTL 过期，不能全球一键清除，所以 TTL 要按"数据会不会变"来定：
| 数据 | TTL | 备注 |
|---|---|---|
| 已结束、不会再变的事实（结果、每关 outcome、owner） | 1 天 | core 条目 |
| 名次、个人最佳、**昵称**等会变的字段 | 30–60 s | live 条目，和 core 分开存 |
| OG / 分享图 | 1 天 | 整个 Response 缓存，同时给 `Cache-Control: public, max-age=86400`，方便爬虫复用 |
| 全表聚合（关卡统计、sitemap 用的数据） | 10 min | |
| 公共榜单 top-N | 30 s | 个人相关部分（around、isMe）不缓存 |

```ts
export async function cached<T>(cache: EdgeCache | null, key: string, ttl: number, load: () => Promise<T>) {
  if (!cache) return load();
  const hit = await cache.get<T>(key); if (hit !== undefined) return hit;
  const v = await load(); if (v != null) cache.set(key, v, ttl);   // null 不缓存，避免把 404 缓存住
  return v;
}
// key: https://edge-cache.internal/v1/${OPEN_NEXT_BUILD_ID}/${key}   ← 带上 build id，每次部署自动换新 key
// put: new Response(JSON.stringify(v), { headers: { "Cache-Control": `public, max-age=${ttl}` } })，用 waitUntil 异步写入
// 只在 workerd 里启用（navigator.userAgent === "Cloudflare-Workers"），EDGE_CACHE=off 时直接执行 load（kill switch）
```
- 绕过缓存：本人刚完成或刚改过数据时，用 `fresh: true` 读主库，不读也不写共享缓存。
- **教训（昵称陈旧 bug）**：最初把 nickname 放进了 1 天的 core 缓存，用户改昵称后，分享页显示的还是旧名字。规则是：任何用户之后还能改的字段，都只能放进短 TTL 的 live 条目，而且本人视图要读最新数据。
- 测试：用内存版 cache 测 TTL 过期、key 带版本号、kill switch 生效。
- 流量低时命中率不高，收益主要还是来自 C。

## E. Bundle 瘦身
- 先看 `handler.mjs.meta.json`，找"同一个库被打了 N 份"的情况。例如 zod 被 7 个路由各打包一份，约 1.25 MB。
- `zod` → `zod/mini`（tree-shakable）。要补 schema 单测，保证错误码不变。
- dev-only 依赖（比如本地 libsql）换成空模块；`@vercel/og` 和 resvg.wasm 可以拆出去，或者先只给它们加缓存。
- **什么时候不值得做**：实测 bundle 只减了 6.8%，startup 从约 36 ms 降到约 33 ms，线上 startup 本来就在 17–23 ms。如果 `wrangler deploy` 报告的 startup 已经低于 25 ms，就不要为了瘦身去拆架构。冷启动的大头是"实例冷"，不是体积。
