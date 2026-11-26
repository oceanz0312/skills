# D1 验收：路由证据、性能对照与发布

分别验证实现正确、业务可用和实测收益。本地真实 workerd 不模拟跨区副本同步；远程 REST 和 CF-Ray 都不能证明 Worker 会话命中副本。

## 验收矩阵

| 场景       | 必须证明                                                    |
| ---------- | ----------------------------------------------------------- |
| 模块级ORM  | 进入会话后prepare/batch走当前连接，未捕获首个请求           |
| 并发请求   | 多个session不串；同会话并行由D1维护位置                     |
| 写后读     | 提交first-primary，同会话写后看见；next fetch/SSR位置不倒退 |
| 权威例外   | auth、角色/封禁、机器、queue、cron保持主库合同              |
| 原子业务   | CAS/唯一约束/幂等/库存/扣费不被普通读写替代                 |
| 客户端     | ServerFn公共fetch/直接API/轮询真携带头；外站不发送/不采纳   |
| 多标签页   | 迟到响应取字典序最大；Web Lock范围原子；无锁明确降级        |
| Cookie异常 | 编码/坏值/禁用/写失败有结果，不把成功写当失败重放           |
| SSE        | 头发出后写入的事件更新；await位置再刷新；取消/断流不重扣    |
| 公共缓存   | HIT/MISS都无个人书签/Set-Cookie，私有响应不进入共享缓存     |
| 请求外操作 | 无会话默认主库；waitUntil继承时显式选择权威上下文           |
| 多库/换库  | 独立路由器及命名空间，不将别库位置用于当前库                |

Node fake D1 可检查路由选择，但不能作为平台合同唯一证据。使用项目安装的 Wrangler/Miniflare/workerd 和 bundler，按实际版本API构造本地 isolated D1；`convertV4MiniflareOptions`只适用于支持它的版本，不固定全站升级运行时。

本地runtime至少执行：建隔离fixture → 模块级ORM → 写后读 → 返回书签并带回 → 六个独立并行请求 → session内batch → 已发头stream继续写 → 原始主库外部查行数。这里创建的表/数据只能进隔离库，正式站点只用已有身份只读。

接收项目将测试放自身既有目录，跑相关单测、真实runtime、E2E、类型检查、构建。模板经过某一版本验证不等于接收版本免测试；Drizzle实际接口可能变化。

本次两份模板经过17项本地实跑：真实workerd/隔离D1上的模块级Drizzle、书签跨请求、六个并发会话、batch、主库旁路、嵌套权威上下文恢复、stream写入；客户端逻辑覆盖不透明编码/字典序、锁合并、init.headers整体替换/空集合清除旧认证/undefined继承、Request原method/body/signal保留、外站隔离、Cookie保存失败、缺锁前置拒绝、显式单标签页与SSR参数形状。严格TypeScript检查通过。验证环境为Drizzle 0.45.4、Wrangler 4.149.0及其Miniflare 5.20261006.1-alpha、TypeScript 5.9.3，测试compatibility_date为2026-06-01并启用nodejs_compat；这是证据版本，不是要求接收项目升级。客户端逻辑实跑不代替接收项目真实浏览器多标签页/ServerFn集成验收。

## 远程证据与归因

从 **Worker binding 查询结果** 采样收集：

```text
meta.served_by_region
meta.served_by_primary
meta.timings.sql_duration_ms
meta.rows_read / rows_written
业务query数量、batch次数、请求总耗时、失败/重试
```

`timings.sql_duration_ms`排除网络等待；查询很快而API慢时继续看应用往返、入口、认证、外部服务或前端水合。ORM若隐去meta，用中央低开销诊断或获批只读binding探测，不绕REST伪造Session测试。记录聚合/匿名类别，不能公开SQL、用户输入、Cookie、令牌或完整书签。

对照同时固定：用户地区/运营商、入口/colo、身份、部署版本、业务数据、查询/分页、客户端连接与缓存。先改一层，再测同一操作：

| 指标             | 记录方式                                             |
| ---------------- | ---------------------------------------------------- |
| API首响应/总时间 | 端到端，相同地区与身份；保留失败                     |
| D1执行           | 同查询SQL duration、rows_read、实际primary/region    |
| 应用往返         | 每请求查询/batch及串行链，批处理前后                 |
| 用户体验         | SSR、刷新、保存后可见、SSE完成到展示；需要浏览器/RUM |

5–10次低量串行是探索，中位数可以描述，不能报告可靠P95/全球保证。副本可能等待也可能落主库，没有固定等待上限和自动fallback承诺；不能保证每次最近副本或对美国用户完全无影响。

所有收益表分“成功/失败数、对照条件、中位数、差值、限制”，计算 `(before-after)/before`时before非零。网络入口变更、缓存由MISS变HIT、数据集改变不得归因D1。没有基线或remote meta就明确“未量化/未证明副本命中”。

## 发布与回滚

读取接收项目Agent/部署规范，核对本地remote bindings、已批准生产动作、安装版本和配置源。副本开启/索引DDL/迁库是不同操作，分别取相应授权与scope；不把案例站点常设批准传给新站点。

1. 基线和矩阵完成，按改动影响跑checks；失败/跳过/未测单列。
2. 最新目标分支变基/合并后复核；只检查改动文件，不stash共享工作树。
3. 获批后从干净已推送commit部署，先查活跃任务/SSE影响；标准脚本可能顺带迁移，逐项核对。
4. 回读Worker实际version与traffic，在正式域/已有账号只读验证ServerFn、API、SSR和展示。
5. 同条件复测meta和用户操作。代码回滚不会还原数据库设置/迁移/数据；停用副本也可能延迟。

## 历史案例与完成条件

统一请求会话曾在 TanStack Start/React/Drizzle/Workers 项目发布并验证：本地模块级ORM、并发、写后读、SSE和客户端书签；线上已有身份的真实API/ServerFn成功传递位置。**没有受控D1前后性能A/B、APAC命中或可靠P95数字**，不把其他层缓存收益写成D1收益。

交付写清：入口清单每项处理、业务矩阵结果、版本/资源动作、同条件性能证据、未测项/撤销范围。已实现、已功能验证、已实测加速三种状态分开；错误/过期权限即便更快也不能交付。
