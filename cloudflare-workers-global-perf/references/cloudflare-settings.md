# Cloudflare 配置（zone / Worker / D1）

每一项都要单独批准。改之前先 GET 一次，记下原值，方便回滚。token 从 `$CLOUDFLARE_API_TOKEN` 读，不要打印出来。
```bash
CF=https://api.cloudflare.com/client/v4; H=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "content-type: application/json")
curl -s "${H[@]}" $CF/zones/$ZONE/argo/tiered_caching                          # GET 原值
curl -s "${H[@]}" -X PATCH $CF/zones/$ZONE/argo/tiered_caching -d '{"value":"on"}'
curl -s "${H[@]}" -X PATCH $CF/zones/$ZONE/cache/tiered_cache_smart_topology_enable -d '{"value":"on"}'
curl -s "${H[@]}" -X PATCH $CF/zones/$ZONE/settings/0rtt -d '{"value":"on"}'
curl -s "${H[@]}" -X PATCH $CF/zones/$ZONE/settings/early_hints -d '{"value":"off"}'
curl -s "${H[@]}" -X PATCH $CF/accounts/$ACCOUNT/d1/database/$DB_ID -d '{"read_replication":{"mode":"auto"}}'   # 回滚改成 "disabled"
```

| 项目 | 建议 | 说明 |
|---|---|---|
| Smart Placement `"placement": {"mode":"smart"}` | **先 A/B 测，低流量、用户遍布全球的站点通常关掉** | 一开始所有请求都是 `cf-placement: local-*`，等于没生效。后来打开测了一次，北美快了，但其他区域都慢了 100–200 ms，全球首页 p50 从约 120 升到约 250。原因是静态页本来就不查库，被挪到 D1 附近后就离用户远了 |
| ⚠ placement 不随版本走 | — | 它是 script 级设置，**`wrangler rollback` 不会恢复它**，回滚后仍是最后一次 deploy 的 placement。要恢复只能改好 `wrangler.jsonc` 再 deploy 一次，并用响应头确认 |
| 固定 placement region/hint | 不要用在整站 | 会让全站静态页都绕到那个区域。要用的话，只用在专门查库的拆分 Worker 上 |
| Tiered Cache + Smart Topology | 开 | 免费，对走 CDN 的图片和 OG 有帮助，影响很小。曾经怀疑它导致北美变慢，关掉对照测了一次，确认无关 |
| 0-RTT | 开 | 回访时少 1 次握手往返；GET 请求可以安全重放 |
| Early Hints | 一般关 | 只有响应带 `Link: rel=preload` 头时才有 103 可发。Next 把 preload 写在 HTML 里，OpenNext 缓存命中时也不带 Link 头，所以开了也没效果 |
| HTTP/3 | 保持开 | 看响应头 `alt-svc: h3` 确认 |
| Cache Rules | 不需要 | 对 Worker 生成的 HTML 无效，因为 Worker 在缓存前面执行。静态资源已经用 `_headers` 管 |
| Argo Smart Routing | 不开 | 付费，主要优化回源这一段；纯 Worker 没有源站 |
| D1 迁移区域 | 不迁 | 用户分布在全球，迁到哪里都有人远；而且 D1 不能改区域，只能新建库再导数据 |
| 中国大陆 | 维持现状 | Free 和 Pro 计划在中国大陆没有机房，China Network 需要企业版加 ICP 备案 |

## D1 read replication + Sessions API（CF-2）
```ts
// 只给能容忍复制延迟的公开读用：别人看的分享结果、聚合统计、公共榜单 top
const replica = typeof env.DB.withSession === "function"
  ? () => repos(drizzle(env.DB.withSession("first-unconstrained")))   // 每次调用都新开一个 session
  : null;
const reader = () => (replica && process.env.D1_REPLICA !== "off" ? replica() : primaryRepos);   // kill switch

let bundle = fresh ? await primary.getResult(id) : await reader().getResult(id);
if (!bundle && !fresh && replica) bundle = await primary.getResult(id);   // 副本还没同步到 → 回退主库，避免误报 404
```
- **必须读主库**的情况（不开 session 就是主库）：
  - 所有写入；
  - 每日限额和计数（读副本可能让用户多玩）；
  - 对局中的 session 和 round；
  - 本人刚结束时看的结果页（`fresh`）；
  - fresh 榜单。
- 需要"读到自己刚写的数据"又想用副本时，可以把写入返回的 bookmark 放进 cookie，下次用 `withSession(bookmark)`。
- 测试：
  - 集成测试里模拟一个"落后的空副本"，断言共享结果会回退主库；本人 fresh 读只走主库；写入不经过副本；`D1_REPLICA=off` 时生效。
  - 线上用脚本连续跑 3 局，每局一结束立刻读本人结果页、API 和分享页，确认第 4 局被限额拦下。
- 回滚：PATCH `read_replication.mode=disabled`，此时 `withSession` 自动退回主库；或者把 `D1_REPLICA` 设为 off。

## 冷实例与低流量
- 低流量 Worker 在很多机房的实例都是冷的，拨测会呈双峰（约 70 ms 和约 350 ms）。这不是代码回归：回滚到旧版本后同样双峰。
- 判断方法：同一批探针连跑 3–8 轮；对照 deploy 后约 3 分钟（冷）和约 10 分钟后（热）的结果；也可以临时回滚做 A/B，测完记得 roll forward。
