# Playbook：逐步改法（可粘贴配置 + 前后验证）

每一步单独开 PR、单独 deploy、单独复测。路径以 **Next.js 16 + `@opennextjs/cloudflare` + D1** 为例；其它栈见 other-stacks.md。

环境变量约定（全部从环境读，**不要写进仓库**）：
```bash
export CLOUDFLARE_API_TOKEN=...   # 或 CF_API_TOKEN
export ZONE_ID=...                # 域名 zone
export ACCOUNT_ID=...
export GLOBALPING_TOKEN=...       # 可选，提高拨测限额
```

---

## 0. 基线（动手前必做）

### 拨测
```bash
python3 scripts/gp_probe.py --host example.com --label baseline \
  --path home=/ --path share=/share/<publicId> --path result=/result/<publicId> \
  --path static=auto --rounds 3
# 记下输出的 measurement id，之后 --reuse <id> 固定同一批探针
python3 scripts/analyze.py ./probes/baseline > ./probes/baseline.md
```
- 地点约 40 个（脚本内置美/欧/亚/非/澳等）；每路径 3 轮。
- **冷**：deploy 后约 3 分钟内测；**热**：约 10 分钟后再测一轮。两轮都写入报告。
- `static=auto`：从首页 HTML 抽第一个 `/_next/static/chunks/*.js` 作参照组（应远快于 HTML；若静态也慢，先查 CDN/_headers）。

### 构建产物
```bash
# 包体积与重复模块
ls -lh .open-next/server-functions/default/handler.mjs
# 打开 handler.mjs.meta.json，搜同一库被打进多个 chunk（如 zod × N）
jq '.prerenderedRoutes | keys' .next/prerender-manifest.json   # 或读文件看 revalidate:false 的路由
```

### 响应头快检
```bash
HOST=example.com
curl -sI "https://$HOST/" | tr -d '\r' | grep -iE 'cache-control|x-nextjs-cache|x-opennext-cache|cf-placement'
curl -sI "https://$HOST/_next/static/chunks/$(curl -s https://$HOST/ | grep -oE '/_next/static/chunks/[^"]+\.js' | head -1 | xargs basename)" \
  | tr -d '\r' | grep -i cache-control
```
- `x-nextjs-cache: MISS` + 长 `s-maxage` → 每次 SSR，做 B。
- `_next/static` 若是 `max-age=0, must-revalidate` → 做 A。

### 代码审计清单
- [ ] 每个动态页的查询几轮串行？能否 `batch` / `Promise.all`？
- [ ] `generateMetadata` 与 page 是否重复调同一 loader？
- [ ] 是否存在"查库 → 307 → 另一路由再查库"？
- [ ] 客户端挂载后是否立刻再打本可由 SSR 带下的 API？

---

## A. 静态资源长缓存（`public/_headers`）

Workers Static Assets 读取该文件；**这类请求不启动 Worker**。缺省常见 `max-age=0, must-revalidate`。

### 配置（整文件可粘贴）
```http
# public/_headers
/_next/static/*
  Cache-Control: public, max-age=31536000, immutable

# 无内容 hash 的资源：短 TTL + SWR；文件放在带版本的目录（如 /levels/v1/）
/levels/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
/og/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/favicon.ico
  Cache-Control: public, max-age=604800
/icon.png
  Cache-Control: public, max-age=604800
/icon-*.png
  Cache-Control: public, max-age=604800
/apple-icon.png
  Cache-Control: public, max-age=604800
/manifest.webmanifest
  Cache-Control: public, max-age=86400
```

### wrangler
一般**不用改** `wrangler.toml` / `wrangler.jsonc`：assets 目录已指向 `.open-next/assets` 时，`public/_headers` 会进构建产物。

### 坑
- **无 hash 的 URL 禁止 `immutable`**。换图请改文件名或目录版本（`v1/` → `v2/`）。
- 字体 `preload`：先看 `font-family` 栈，拉丁文是否也用该字体；乱用 `preload: false` 会造 FOIT。

### 验证（部署后）
```bash
JS=$(curl -s "https://$HOST/" | grep -oE '/_next/static/chunks/[^"]+\.js' | head -1)
curl -sI "https://$HOST$JS" | tr -d '\r' | grep -i cache-control
# 期望：Cache-Control: public, max-age=31536000, immutable
```
拨测：静态路径全球 p50 应明显下降；HTML 基本不变（本步只动静态）。

### 回滚
删掉或还原 `_headers`，重新 deploy。

---

## B. SEO / SSG 页走静态资源缓存

### 配置
```ts
// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

/**
 * 纯静态页（无 revalidate、无 cookie、无 DB）的预渲染 HTML 随每次 deploy 进 Workers Static Assets。
 * enableCacheInterception：命中时不加载 Next 渲染器 → 冷启动收益最大。
 * 不支持 ISR；需要 ISR 时改用 R2 + regional cache（不要用 KV 作增量缓存：最终一致，部署后可能读到旧页）。
 */
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
```
`wrangler` 的 `assets.directory` 保持 `.open-next/assets` 即可。

### 哪些页受益 / 不受益
- 受益：`prerender-manifest` 里 `revalidate: false` 的 SEO/内容页。
- 不受益：`force-dynamic`、`/api/*`、读 cookie 的玩法页 —— 照旧每请求计算。

### 坑
- 以后若给静态页加 cookie / 随机 / 个性化，会被"冻住"——写进代码规范。
- `next.config` 的 `headers()`（如 `X-Robots-Tag`）在 HIT 时**必须仍在**；用 smoke/E2E 断言。

### 验证
```bash
for p in / /faq /about; do
  echo "== $p"
  curl -sI "https://$HOST$p" | tr -d '\r' | grep -iE 'x-opennext-cache|x-nextjs-cache|cache-control|x-robots-tag'
done
# 期望：x-opennext-cache: HIT
# 隐藏页仍有 X-Robots-Tag: noindex（若你配置过）
```

### 回滚
`open-next.config.ts` 恢复空/`defineCloudflareConfig({})` 后 redeploy；或 `npx wrangler rollback <prevVersionId>`。

---

## C. 查询合并（1 请求 ≈ 1 次 D1 往返）

### C1. `db.batch`（drizzle 或原生 D1）
每条语句都用**入口参数**（如 `publicId`）作条件；用子查询代替"先 A 再 B"：
```ts
// repositories/….ts（示意）
const [heads, roundRows] = await db.batch([
  db
    .select({
      result: results,
      nickname: players.nickname,
      bestLevel: bests.bestLevel,
      rank: sql<number>`1 + (SELECT count(*) FROM bests AS h
        WHERE h.level_set_version = ${results.levelSetVersion}
          AND h.best_level > coalesce(${bests.bestLevel}, ${results.reachedLevel}))`,
    })
    .from(results)
    .innerJoin(players, eq(players.id, results.playerId))
    .leftJoin(bests, and(eq(bests.playerId, results.playerId), eq(bests.levelSetVersion, results.levelSetVersion)))
    .where(eq(results.publicId, publicId)),
  db
    .select({ level: rounds.level, humanStatus: rounds.humanStatus, winner: rounds.winner })
    .from(rounds)
    .where(inArray(rounds.sessionId,
      db.select({ id: results.sessionId }).from(results).where(eq(results.publicId, publicId))))
    .orderBy(rounds.level),
]);
// 正确率等聚合：用 roundRows 在 JS 里算，省掉第三条 SQL
```

### C2. React `cache()` 去重
```ts
// server/result-loader.ts
import { cache } from "react";
export const loadResultWithOwner = cache(async (publicId: string, fresh = false) => {
  return (await getGameService()).getResultWithOwner(publicId, { fresh });
});
// generateMetadata 与 page 都调用 loadResultWithOwner → 同请求只查一次
```

### C3. 去掉跳转链
```ts
// app/.../result/[id]/page.tsx（示意）
const data = await loadResultWithOwner(id, /* fresh */ isOwner);
if (!data) notFound();
if (!isOwner) {
  // 不要 redirect('/share/...')
  return (
    <>
      <link rel="canonical" href={`${origin}/share/${id}`} />
      <ShareView data={data} />   {/* 与 /share 共用展示组件 */}
    </>
  );
}
return <OwnerResultView data={data} />;
```
保持 `/result` 的 `noindex`；对外分享链接本来就应是 `/share/...`。

### C4. SSR 带 `initialData`；独立查询 `Promise.all`
排行榜组件有 `initialData` 时首屏不请求；手动刷新仍可走 API。  
`getBest` ∥ `list(top)`；名次用子查询，避免 best→count 串行。

### C5. 写入路径（可选）
`setNickname` + `createSession` 可 batch；**限额扣减/退还逻辑一个字都不要动**。

### 验证
- 单测：同一 fixture，新旧函数输出深相等（通关、中途失败、void 关、并列、best 高于本局）。
- E2E：非本人打开 `/result/...` → **200**（无 307）+ 分享视图 + canonical；本人打开为 owner 视图。
- 拨测：result/share 北美以外 p50 应接近"1 次 RTT + 渲染"。

### 回滚
开关 `RESULT_BUNDLE=off` 切回旧函数；或版本回滚。

---

## D. Cache API 边缘缓存

每 POP 一份；免费；按 TTL 过期；**无全球 purge** → TTL 按"会不会变"拆，key 带 BUILD_ID。

### TTL 表
| 数据 | TTL | Key 后缀示意 |
|---|---|---|
| 结束后不变的事实（结果、outcomes、owner） | 86400 | `result-core/<id>` |
| 会变：名次、best、**昵称** | 30–60 | `result-live/<id>` |
| OG / 分享图（整 Response） | 86400 | `share-og/<id>` |
| 全表聚合（关卡统计） | 600 | `level-stats/<version>` |
| 公共榜 top-N | 30 | `board-top/<version>/<limit>` |

### 可粘贴 helper 骨架
```ts
// server/edge-cache.ts
import "server-only";

export interface EdgeCache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds: number): void;
}

export async function cached<T>(
  cache: EdgeCache | null | undefined,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  if (!cache) return load();
  const hit = await cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  if (value !== null && value !== undefined) cache.set(key, value, ttlSeconds); // 勿缓存 null/404
  return value;
}

const ORIGIN = "https://edge-cache.internal";

/** workerd 内启用；EDGE_CACHE=off 为 kill switch */
export function createWorkersEdgeCache(): EdgeCache | null {
  if (process.env.EDGE_CACHE === "off") return null;
  const store = (globalThis as any).caches?.default as Cache | undefined;
  if (!store || globalThis.navigator?.userAgent !== "Cloudflare-Workers") return null;
  const req = (key: string) =>
    new Request(`${ORIGIN}/v1/${encodeURIComponent(process.env.OPEN_NEXT_BUILD_ID ?? "dev")}/${key}`);
  return {
    async get<T>(key) {
      try {
        const hit = await store.match(req(key));
        return hit ? ((await hit.json()) as T) : undefined;
      } catch {
        return undefined;
      }
    },
    set(key, value, ttlSeconds) {
      const res = new Response(JSON.stringify(value), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${Math.max(1, Math.round(ttlSeconds))}`,
        },
      });
      // waitUntil(store.put(...)) —— 用你项目里的 defer/waitUntil 封装
      void store.put(req(key), res).catch(() => undefined);
    },
  };
}

export async function cachedResponse(
  key: string,
  ttlSeconds: number,
  render: () => Promise<Response>,
): Promise<Response> {
  const cc = `public, max-age=${ttlSeconds}`;
  const withCC = (r: Response) => {
    const h = new Headers(r.headers);
    h.set("Cache-Control", cc);
    return new Response(r.body, { status: r.status, headers: h });
  };
  if (process.env.EDGE_CACHE === "off") return withCC(await render());
  const store = (globalThis as any).caches?.default as Cache | undefined;
  if (!store || globalThis.navigator?.userAgent !== "Cloudflare-Workers") return withCC(await render());
  const request = new Request(`${ORIGIN}/v1/${encodeURIComponent(process.env.OPEN_NEXT_BUILD_ID ?? "dev")}/${key}`);
  const hit = await store.match(request).catch(() => undefined);
  if (hit) return withCC(hit);
  const fresh = withCC(await render());
  if (fresh.ok) {
    const buf = await fresh.arrayBuffer();
    void store.put(request, new Response(buf, { headers: fresh.headers })).catch(() => undefined);
    return new Response(buf, { status: fresh.status, headers: fresh.headers });
  }
  return fresh;
}

export const EDGE_TTL = {
  resultCore: 86_400,
  resultLive: 60,
  levelStats: 600,
  boardTop: 30,
  shareImage: 86_400,
} as const;
```

### 使用约定
```ts
// 共享视图：读 cache；本人刚打完：fresh=true → 不读不写共享 cache，直打主库
const core = await cached(edge, `result-core/${id}`, EDGE_TTL.resultCore, () => games.getCore(id));
const live = await cached(edge, `result-live/${id}`, EDGE_TTL.resultLive, () => games.getLive(id));
```

### 坑（真实踩过）
- **昵称陈旧**：把 nickname 放进 1 天 core → 用户改名后分享页仍旧名。规则：**凡用户事后能改的字段，只进短 TTL live**；本人视图读最新。
- 流量低时命中率不高，收益主要仍靠 C。
- 永不清：限额、session、round、`/me`、analytics、POST、读 cookie 的输出。

### 验证
```bash
# OG：首包慢，立刻再打应快且带 Cache-Control
curl -sI "https://$HOST/share/<id>/opengraph-image" | tr -d '\r' | grep -i cache-control
# 期望：public, max-age=86400
# 限额绝不能 HIT
curl -sI "https://$HOST/api/play-limit?pk=smoke-$RANDOM" | tr -d '\r' | grep -iE 'cf-cache-status|cache-control'
# 期望：无 HIT；最好 Cache-Control: no-store
```
单测：内存 cache 测 TTL、BUILD_ID 换 key、`EDGE_CACHE=off`。

### 回滚
`EDGE_CACHE=off`（wrangler vars）无需 redeploy 代码逻辑分支；或版本回滚。

---

## E. Bundle 瘦身

### 怎么找
```bash
ls -lh .open-next/server-functions/default/handler.mjs
# 读 *.meta.json：同一包路径出现在多个 chunk → 合并 import 或换 tree-shakable 入口
```

### 常见手法
| 手法 | 说明 |
|---|---|
| `zod` → `zod/mini` | tree-shakable；补 schema 单测，错误码不变 |
| 共享 schema 模块 | 避免每条 API 路由各打一份 |
| dev-only（libsql 等） | 构建 alias 成空模块；确认 `serverExternalPackages` 仍被打包时强制换掉 |
| `@vercel/og` + wasm | 先给 OG 加 1 天缓存（D）；再考虑拆独立 Worker |

### 何时不值得
`wrangler deploy` 报告 startup 已 **< 25 ms**，或体积只降个位数百分比时，冷启动大头是**实例冷**不是解析。不要为瘦身拆架构。

### 验证
部署日志对比 upload KiB / gzip KiB / startup ms；API 校验与 OG 图回归。

---

## 步骤顺序与依赖
```
A → B → C → D → E → CF-1 → CF-2
         ↑         ↑
    查询正确性   缓存正确性（依赖 C 的数据结构）
```
CF-1/CF-2 的 API 与坑见 cloudflare-settings.md。
