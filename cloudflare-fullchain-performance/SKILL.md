---
name: cloudflare-fullchain-performance
description: 优化部署在 Cloudflare Workers 上的网站全链路性能。用于网站打开慢、跨地区访问慢、中国大陆链路绕行、D1 主从与书签、R2 视频和文件缓存、SSR HTML 缓存、字体和前端加载、性能对照及安全发布。适配 React/TanStack Start/Vite/Drizzle，也可迁移到其他 Workers 技术栈；先测量、按瓶颈实施、验证一致性与权限，不把缓存命中或理论路由当成已测得收益。
---

# Cloudflare 全链路性能优化 SOP

优化用户完成页面和业务操作的耗时，不追求某个单项分数。以现有代码和当前平台文档为依据；把正确性、权限与性能一起验收。此 Skill 不授权生产发布、迁移、开通付费产品或公开数据。

## 执行流程

### 1. 建立边界

读取项目的 Agent 指南、包管理器、构建/部署脚本及配置来源。识别 Worker/Pages、SSR/静态、数据库访问方式、R2 私有/公开、认证、任务队列与用户地区。确认本地是否绑定生产资源。

完成条件：填写 [执行记录模板](assets/performance-report.md) 的资源和授权部分；所有待测 URL/资源属于用户授权范围。使用项目安装版本，查本地 CLI `--help`；修改配置源，不修改生成文件。平台依据见 [官方来源](references/sources.md)。

### 2. 画链路并测基线

画出 `用户 → DNS/TCP/TLS → CDN/代理 → Worker → D1/R2/外部服务 → 首字节 → 资源下载 → 水合/可交互`。区分 HTML、业务 API、视频、SSE，不把总慢都归因到数据库。

按 [测量与验收](references/measurement.md) 收集相同地区、身份、数据、构建和冷热状态的基线。脚本只做有界 GET：

```bash
python3 -I /绝对路径/cloudflare-fullchain-performance/scripts/probe.py \
  --url https://example.com/ --label homepage --count 5 \
  --output /绝对路径/before-homepage.json
```

完成条件：基线包含每个采样的成功/失败、分段耗时和缓存状态；无法测量的部分明确留空，不填估计收益。

### 3. 按瓶颈选择分支

| 观察到的瓶颈                       | 执行材料                                                               | 优先动作                                                          |
| ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| DNS/TLS 慢、国际绕行、大陆入口不稳 | [网络入口](references/network.md)                                      | 多地区比对主域/入口，减少重定向和第三方依赖；有证据才考虑区域代理 |
| SSR/API 首字节慢、串行数据库往返   | [D1](references/d1.md)                                                 | 统一请求会话、展示副本、写后书签；减少查询往返/扫描               |
| 视频首播/拖动慢、R2 重复读取       | [R2 与媒体](references/r2.md)                                          | 鉴权后缓存不可变字节；Range/条件请求；合适的预览文件              |
| 匿名 HTML 每次重渲染               | [Worker 与 HTML](references/worker-html.md)                            | 明确公开页面白名单、构建版本缓存键、后台刷新                      |
| 资源链长、Google 字体、JS 水合重   | [前端资源](references/frontend.md)                                     | 字体自托管、缩小首屏依赖、合并请求与客户端缓存                    |
| 要量化收益或准备上线               | [测量与验收](references/measurement.md)、[发布](references/release.md) | 同条件对照、实际路由元数据、权限与回滚验收                        |

将已证实的每个瓶颈列为“实施 / 不适用 / 需要决策”。默认先做减少请求和往返、字体和缓存边界，再考虑资源迁移或新入口；不要为了套 SOP 把全套架构都重写。

D1 优化执行 [完整 SOP](references/d1.md)：改造 ORM/Worker/SSR/ServerFn/SSE 时读取 [实施参考](references/d1-implementation.md)，测量或发布时读取 [验收参考](references/d1-verification.md)。可移植模板为 [请求数据库路由](assets/d1-request-database.ts) 与 [浏览器/SSR 书签](assets/d1-browser-bookmarks.ts)，接入项目版本、业务策略与异常处理后复验，不能直接覆盖生产代码。

媒体实施必须同时执行 [完整验收矩阵](references/r2-verification.md)；HTTP测量统一使用 [probe.py](scripts/probe.py)，按测量文档启用可选正文/Range/SHA校验；页面资源快照使用 [browser_snapshot.js](scripts/browser_snapshot.js)，用法与隐私/计时限制见 [浏览器快照](references/measurement.md#只读浏览器快照)。两个工具不替代真实runtime、权限或Core Web Vitals验收。

### 4. 实施最小完整方案

一次改变一个可归因层，保留前后样本。将共性放到深层入口：统一数据库路由、统一客户端请求、统一媒体响应、统一 HTML 缓存，而不是给每个调用者叠专用分支。

- 展示一致性与提交正确性分开；副本不是事务、锁或权限校验的替代品。
- 私有/可撤下资源每次网络访问都先鉴权，再取字节缓存；公开桶/整响应缓存是另一种授权模型。
- 队列/cron/机器回调按任务正确性选择数据库，不默认沿用展示会话。
- 异步缓存写入与日志按平台生命周期托管；失败只降低命中率，不改变主业务结果。
- 大改、数据迁移、代理部署、费用/缓存撤销语义变化先获得对应批准；现有项目的兼容与发布规则优先。

完成条件：新增入口覆盖 SSR、ServerFn、直接 API、流式回复及后台调用；没有新旧双入口失控并存，没有权限绕过。

### 5. 验收后再发布

先执行本地隔离验证，再执行现有测试、类型检查和构建。只格式化/检查改动文件，使用独立工作树而不是 stash。按 [发布](references/release.md) 核对当前生产版本、任务状态和资源，遵守项目实际授权。

完成条件：测试矩阵全有结果；失败和跳过未计入通过；最新变基影响已复核；已批准发布才部署。线上使用用户已有身份只读验收，新增生产测试数据需另行授权。

### 6. 交付可核实结论

用 [执行记录模板](assets/performance-report.md) 报告改动、收益、正确性、发布版本与未测项；把适用规则写回该项目文档。三种状态严格分开：**已实现、已功能验证、已实测加速**。

已有实战范围及局限见 [案例与移植边界](references/evidence.md)。可复用的是流程和合同，不是某站的域名、地区、密钥、缓存时长或收益百分比。

## 使用与分发

将整个 `cloudflare-fullchain-performance/` 目录复制到接收方 AI 工具的 Skill 目录。Claude Code 用户级默认是 `~/.claude/skills/`，项目级可放 `.claude/skills/`；其他工具按其规范安装。`.skill` 文件是包含同一目录的 ZIP 分发包。未安装时也可明确让 AI 读取本文件并执行。

本 Skill 自包含，无需安装同级专项 Skill，也没有接收项目固定域名/账户/密钥依赖。演示报告见 [performance-report.html](performance-report.html)。

站点是 Next.js + OpenNext、主要问题是全球各地区 TTFB 时，先看同仓库的 `cloudflare-workers-global-perf`（Globalping 多地拨测、OpenNext 缓存、zone 配置与跨平台映射）；两者可以一起用。
