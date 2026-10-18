# Cloudflare 配置：zone / Worker / D1

每一项单独批准。改前先 GET 记原值。Token 只用环境变量，**永不 echo / 不入库**。

```bash
export CF_API_TOKEN="${CLOUDFLARE_API_TOKEN:?}"   # 权限：Zone Settings Edit、Zone Read、D1 Edit（按需最小化）
export ZONE_ID=your_zone_id_here
export ACCOUNT_ID=your_account_id_here
export D1_DATABASE_ID=your_d1_id_here
CF="https://api.cloudflare.com/client/v4"
H=(-H "Authorization: Bearer $CF_API_TOKEN" -H "content-type: application/json")
```

---

## 决策表

| 项目 | 建议 | 费用 | 说明 |
|---|---|---|---|
| Smart Placement `placement.mode=smart` | **先 A/B**；低流量 + 全球用户 + 静态页多 → 通常**关** | 免费 | 静态页被挪到 D1 旁会离用户更远；实测可出现北美↓、全球↑ |
| 固定 `placement` region/hint | **不要**用在整站 | 免费 | 全站静态页绕远；仅考虑拆"纯查库 Worker"时用 |
| Tiered Cache | **开** | 免费 | 对 CDN 上的图/OG 有帮助；Worker HTML 基本无感 |
| Smart Topology（配合 Tiered） | **开** | 免费 | 同上 |
| 0-RTT | **开**（GET 可安全重放时） | 免费 | 回访少 1 次握手 |
| Early Hints | **默认关**；仅当响应有 `Link: rel=preload` 再试 | 免费 | Next 常把 preload 写在 HTML；OpenNext HIT 无 Link 头 → 103 无从发 |
| HTTP/3 | 保持开 | 免费 | 看 `alt-svc: h3` |
| Cache Rules | 一般**不需要** | 免费 | 管不到 Worker HTML；静态已用 `_headers` |
| Argo Smart Routing | **不开**（除非有传统源站） | 付费 | 优化回源；纯 Worker 无源站 |
| D1 迁区 | **不迁** | — | 不能改区；只能新建+导数据；全球用户迁哪都有人远 |
| D1 read replication | 代码就绪后 **开 auto** | 免费额度内 | 见下方 CF-2 |
| 中国大陆 | 维持；要境内节点需企业版 + ICP | — | Free/Pro 无中国大陆 POP |

---

## CF-1：读原值 → 改 → 验证 → 回滚命令

### 读原值（必做）
```bash
curl -s "${H[@]}" "$CF/zones/$ZONE_ID/argo/tiered_caching"
curl -s "${H[@]}" "$CF/zones/$ZONE_ID/cache/tiered_cache_smart_topology_enable"
curl -s "${H[@]}" "$CF/zones/$ZONE_ID/settings/0rtt"
curl -s "${H[@]}" "$CF/zones/$ZONE_ID/settings/early_hints"
curl -s "${H[@]}" "$CF/zones/$ZONE_ID/settings/http3"
# Worker placement 在 wrangler 配置 / 最近一次 deploy 的 script settings，不在 zone settings
```

### 打开 Tiered + Topology + 0-RTT；Early Hints 先关
```bash
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/argo/tiered_caching" \
  -d '{"value":"on"}'
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/cache/tiered_cache_smart_topology_enable" \
  -d '{"value":"on"}'
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/settings/0rtt" \
  -d '{"value":"on"}'
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/settings/early_hints" \
  -d '{"value":"off"}'
```

### 关掉 Smart Placement（wrangler）
```jsonc
// wrangler.jsonc — 删除或注释：
// "placement": { "mode": "smart" },
```
然后 `npx wrangler deploy`。用响应头确认：
```bash
curl -sI "https://$HOST/some-dynamic" | tr -d '\r' | grep -i cf-placement
# 关掉后：通常不再出现 cf-placement；或不再是系统强制的 remote-*
```

### Early Hints 试验协议
1. `PATCH early_hints=on`
2. `curl -sI` 看有没有 `link: <...>; rel=preload`
3. 若**没有** Link 头（Next 内联在 HTML、OpenNext HIT 也无 Link）→ 立刻改回 `off`，记入日志"无效，已关"
4. 只有确认有 Link 头时才保留 on，并做拨测对比

### ⚠ Placement 不随版本
- Placement 是 **script 级设置**，不是 deployment 快照字段。
- **`npx wrangler rollback <versionId>` 不会恢复旧 placement。**
- 回滚代码后若曾改过 placement，必须再 deploy 一次带正确 `wrangler` 配置的版本，并用 `cf-placement` 头确认。
- 实验性打开 placement 时：记下实验 version id，测完用**正向 deploy**（正确配置）回到主线，不要假设 rollback 能救场。

### Smart Placement A/B 怎么做
1. 基线：placement 关，热拨测 3 轮记全球/分区 p50。
2. 临时 deploy：`placement.mode=smart`（可不开 PR，但要记 version id）。
3. 同一 `--reuse` 探针再跑 3–8 轮。
4. 判据：若北美↓但欧亚南美↑ 100–200 ms、全球 p50 变差 → **保持关**。
5. 用正确配置 redeploy 主线；确认头；不要依赖 rollback。

### CF-1 回滚（zone）
```bash
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/argo/tiered_caching" -d '{"value":"off"}'
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/cache/tiered_cache_smart_topology_enable" -d '{"value":"off"}'
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/settings/0rtt" -d '{"value":"off"}'
curl -s "${H[@]}" -X PATCH "$CF/zones/$ZONE_ID/settings/early_hints" -d '{"value":"off"}'
```

---

## CF-2：D1 read replication + Sessions API

### 打开 / 关闭副本（账户 API）
```bash
# 开
curl -s "${H[@]}" -X PATCH "$CF/accounts/$ACCOUNT_ID/d1/database/$D1_DATABASE_ID" \
  -d '{"read_replication":{"mode":"auto"}}'
# 关（代码 withSession 在关闭后会退回主库行为，但仍建议保留 D1_REPLICA kill switch）
curl -s "${H[@]}" -X PATCH "$CF/accounts/$ACCOUNT_ID/d1/database/$D1_DATABASE_ID" \
  -d '{"read_replication":{"mode":"disabled"}}'
```

### 代码模式（可粘贴骨架）
```ts
// container / db bootstrap
type SessionConstraint = "first-unconstrained" | "first-primary" | string;
interface D1Binding {
  withSession?: (constraint?: SessionConstraint) => unknown;
}

function makeRepos(db: Database) {
  return { games: createGameRepository(db), leaderboard: createLeaderboardRepository(db) };
}

const primary = makeRepos(primaryDb);

let replica: (() => ReturnType<typeof makeRepos>) | null = null;
if (typeof env.DB.withSession === "function") {
  replica = () => makeRepos(createD1Database(env.DB.withSession!("first-unconstrained")));
}

const reader = () =>
  replica && process.env.D1_REPLICA !== "off" ? replica() : primary;

// 共享结果（可容忍短暂延迟）
let bundle = options.fresh
  ? await primary.games.getResultBundle(id)
  : await reader().games.getResultBundle(id);
// 副本尚未同步到刚写入的行 → 回退主库，避免误 404
if (!bundle && !options.fresh && replica) {
  bundle = await primary.games.getResultBundle(id);
}
```

### 谁必须读主库（不要 withSession，或 `first-primary`）
| 路径 | 原因 |
|---|---|
| 所有写入 | 副本只读 |
| 每日限额 / 计数读写 | 副本延迟 → 用户可能多玩 |
| 进行中的 session / round | 强一致 |
| 本人刚结束后的结果页（`fresh`） | 必须立刻看见 |
| 刚改昵称 / 刚上榜后的 fresh 榜 | 同上 |

可选：写入返回的 **bookmark** 塞进 cookie，下次 `withSession(bookmark)` 读"至少新鲜到该点"的副本。

### Kill switch
- `D1_REPLICA=off` → `reader()` 退回 primary（不改 API 开关也能止血）。
- `EDGE_CACHE=off` → 见 playbook D（另一开关，常一起记在 runbook）。

### 测试
- 集成：注入"空的落后副本" → 共享读回退主库；`fresh` 只打主库；写入不经副本；`D1_REPLICA=off`。
- 线上最小写入脚本：同一 player key 连续 3 局；每局结束立刻 GET 本人结果页 + API + 陌生人视角分享页；第 4 局应 429/限额。报告里写明留下的测试行。

### 验证头 / 行为（部署后）
```bash
# 功能：打完立刻可读（副本延迟被 fresh/回退兜住）
# 性能：热拨测下 result/share 北美以外再降一截；对比 CF-1 基线
# 开关：临时 D1_REPLICA=off 后延迟应回到"仅边缘缓存 + batch"水平
```

### 回滚顺序
1. `D1_REPLICA=off`（最快）
2. 或 `read_replication.mode=disabled`
3. 或 `wrangler rollback <versionId>`（注意 placement 坑）

---

## Worker 部署与版本

```bash
npx wrangler deployments list          # 记当前 version id = 回滚点
npx wrangler deploy                    # 记下新 version、startup ms、upload size
npx wrangler rollback <prevVersionId>  # 代码回滚；placement 不回滚！
```

DNS、Email Routing、密钥轮换：**本 skill 默认不动**。需要改时另开批准项。
