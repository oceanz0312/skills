# 验证清单

## 永不缓存（Cache API、CDN 和 `_headers` 都不能覆盖这些）
- 限额和计数接口，例如 `/api/play-limit`。
- 对局、session 和 round 接口，例如 `/api/sessions*`、`/api/rounds*`。
- `/api/players/me` 这类个人接口，`/api/analytics`，`/play/*`。
- 所有 POST。
- 任何读 cookie 来判断"是不是本人"的输出。
smoke 里要断言这些接口没有 `cf-cache-status: HIT`，最好返回 `no-store`。

## 每个 PR 上线前
1. 跑 typecheck、lint 和单测。新逻辑要有对照单测：batch 的结果和旧函数输出相同；edge cache 测 TTL、key 版本号和 kill switch；replica 测回退逻辑。
2. **本地全量 E2E**（Playwright，测试环境里去掉真实的模型 key，例如 `env -u OPENAI_API_KEY`）。
   - 偶发失败要单独 spec 重跑 3 遍。如果全过，而且这次 PR 没碰相关代码，就记为 flake，但要在报告里写明。
   - 想更接近线上，可以用 `opennextjs-cloudflare preview` 加本地 D1，在 workerd 里跑关键 spec，同时在 main 上跑一遍同样的 harness 作为对照。
3. 记下当前线上版本号作为回滚点（`npx wrangler deployments list`），然后 deploy。记录新版本号和 startup 时间。

## 每次 deploy 后
- `scripts/smoke.sh`，只读检查：
  - 每个 SEO 页的 canonical 正确，并且 `x-opennext-cache: HIT`；
  - 隐藏页的 `X-Robots-Tag` 和 meta noindex 还在；
  - robots.txt 的 Disallow 规则和 sitemap 的 URL 数、排除项都对；
  - 结果页和对局页仍是 noindex；
  - www 和 workers.dev 的 301 正常；
  - `_next/static` 返回 immutable；
  - 限额和 session 接口没有被缓存。
- 线上只读 E2E：只跑 SEO、meta、图标和路由这类不写数据的 spec。会写数据的流程改用一个最小脚本：建 1 个用户，跑完流程，立即读本人结果、API 和分享页，再验证限额。报告里要说明它留下了哪些测试数据。
- 复测拨测：同一批探针跑 3 轮，用 `analyze.py <dir> <baseline>` 出对比表，写进进度日志。冷测一轮，热测（约 10 分钟后）再一轮。

## 进度日志模板（每步一段）
```
### PR-X <标题> — DONE
- PR <url>（squash <sha>）。Unit N pass，E2E N passed（时长）。
- Deploy version <new>; rollback → <prev>. Startup N ms, upload N KiB / gzip N KiB.
- Smoke all PASS（关键头）。
- Probe after-X: <page> global p50/p90 a/b → c/d (-N%)；异常或偏差说明。
```
