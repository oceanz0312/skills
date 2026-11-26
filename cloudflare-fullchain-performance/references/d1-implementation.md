# D1 实施：把会话接到整个调用链

将 D1 读写策略落实到 Worker、ORM、SSR、ServerFn、直接 fetch 和 SSE。本文件提供改造顺序及模板接入点；平台语义和路由选择以 D1 主参考为准，不代替业务授权。

## 目录

- [盘点与改造顺序](#盘点与改造顺序)
- [请求路由模板](#请求路由模板)
- [Worker 与认证接入](#worker-与认证接入)
- [浏览器与 SSR 接入](#浏览器与-ssr-接入)
- [流式写入与跨请求](#流式写入与跨请求)
- [查询与客户端缓存优化](#查询与客户端缓存优化)
- [异常与停用](#异常与停用)

## 盘点与改造顺序

先给所有实际数据库入口建立清单，记录文件/函数、数据用途、是否写入、所需一致性、调用身份和当前查询数。搜索只是候选生成，必须追踪真实调用者：

```text
getDb / getReadDb / getReadYourWritesDb / getPrimaryDb
withSession / drizzle / env.DB / prepare / batch / exec
认证适配器 / ServerFn middleware / Webhook / queue / scheduled
SSE工具写入 / waitUntil / 客户端fetch / 服务端loader / 余额与列表缓存
```

按顺序处理：

1. 在中央数据模块建立请求路由与独立权威读取入口，验证模块级 ORM 不固定会话。
2. Worker 业务 fetch 最外层接会话；认证、机器、后台有明确旁路。
3. 按用户意图选择展示/提交策略，更新所有实际读取入口；保留 CSRF、auth 和上下文中间件。
4. 客户端公共 fetch、SSR cookie/context、SSE 事件统一传递位置。
5. 按接收项目的兼容政策删除/迁移旧逐调用读库选择，不保留两套不受控入口。
6. 再减少往返、扫描与重复刷新，用回归矩阵及基线证明收益。

完成条件：清单每一项都有“接入/权威例外/不适用”的代码依据。新增调用自然走统一入口，不要求未来开发者猜哪个读库函数更合适。

## 请求路由模板

读取并按项目接口改造 `assets/d1-request-database.ts`。模板通过 `createRequestDatabase(primary, schema)` 构造：

| 返回接口        | 用途                                                   |
| --------------- | ------------------------------------------------------ |
| getDb           | prepare/batch 时读取当前会话；模块级业务 ORM 可复用    |
| getPrimaryDb    | 独立权威读取，不继承展示会话                           |
| run             | 显式 primary 或 session 策略，返回 Response 和当前书签 |
| currentBookmark | SSE 在查询/写入后取得位置                              |

模板在 Worker 支持的 AsyncLocalStorage 上运行，不能从 Node 单测推断平台支持。Proxy 转发保留绑定接收者和 ORM 类型；按目标 ORM 实际使用接口核对，不用 `as unknown as D1Database` 掩盖不兼容。

- `prepare` 时绑定当前会话。因此模块级 ORM 可以保留，模块级 **prepared statement** 不能提前创建后跨请求复用；`batch` 里的 statements 必须属于当前请求/同一会话。
- 会话仅有 prepare/batch；模板会阻止会话内通过路由入口调用管理接口，避免 exec/dump 悄悄绕回主库且不推进书签。迁移/管理在请求外使用原始 binding 与批准的工具。
- 每个数据库绑定各创建一套 router 和书签槽。不要让一个 ALS session 服务不同 D1 binding。
- primary 策略显式清掉当前上下文；后台继承是实际异步行为，不假定 waitUntil 自动脱离会话。

示意接入：从现有配置取得 binding/schema 后在中央模块创建一次 router。Worker handler 通过 `router.run(policy, handle)` 执行业务，再按响应资格附加书签；模板不包含固定域名、路径或用户身份判定。`getBookmark()` 直接返回 string/null，没有查询时null；不要从它解构 `{ bookmark }`，没有位置时不附加空字符串。

## Worker 与认证接入

策略由业务用途决定，不把 GET/POST 当唯一依据。读型 ServerFn 若用 POST，应根据框架可验证的注册/调用元数据识别；不能信任前端发来的“这是只读”头。

- 展示：合法 incoming bookmark 或 first-unconstrained。
- 用户提交：first-primary，更新/CAS 走该会话的 getDb；auth 权威读取单独走 getPrimaryDb。
- 机器和请求外任务：primary。请求内启动的后台任务也显式 primary；长任务按队列/任务框架生命周期托管。
- 资金/库存/角色撤销：保留主库和条件写/原子业务合同。first-primary 是最新起点，不是每条 SELECT 主库，更不是事务锁。

**书签覆盖写入**：同一浏览器提交的所有相关写入要由该会话执行。若写入绕过 getDb 直接到原 binding、另一个会话或远程任务，当前 session.getBookmark 不代表那个写入；不要据它保证读自己写入。任务回调完成后展示按版本/完成状态设计刷新，不假装浏览器书签包含尚未收到的后台写入。

Better Auth 等适配器使用独立权威入口；同时审计身份 cookie cache 和客户端 viewer 缓存。主库并不能撤销浏览器已缓存的角色。付款/扣费正确性独立验收，不顺手重写业务事务。

Response 传递要求：

1. Cookie/header 都有体积与字符校验，cookie 编码，header 优先级明确。
2. session 有新位置才附加自定义响应头；保留 status/body/流与原始业务头。
3. 个人位置仅出现在不共享的业务响应。公共 HTML/CDN 缓存路径不附加位置或 Set-Cookie；不能只靠路径猜公开。
4. 需要书签的个人响应按产品明确 no-store/private 和实际 CDN 规则；私有无标签响应不自动安全。
5. 受控跨源扩展若确实需要，明确 CORS allow/expose 与身份来源；默认浏览器 wrapper 只同源。

完成条件：SSR、ServerFn 与直接 API 在真实 Worker 入口上复用同一策略，机器/认证不会读展示会话，公开缓存不携带个人位置。

## 浏览器与 SSR 接入

读取 `assets/d1-browser-bookmarks.ts`，以数据库命名空间设置 cookieName/headerName、产品寿命及跨标签页保证。该文件同时可用于服务端解析 cookie 和浏览器传递，不把 cookie 当权限凭据。

模板选择：

- `crossTab: 'required'`：无 Web Locks 时在发请求前明确拒绝，接收项目应在 UI 选择服务器托管位置或真正的串行替代。
- `crossTab: 'single-tab-only'`：显式只保证单标签页，不能宣传全设备/多标签页无倒退。

`remember` 在共享锁内执行“读当前值 → 官方字典序取最大 → 写入 → 读回检查”。Cookie 被禁用/写入失败返回 false，而非假报持久化成功。fetch wrapper 在返回业务响应前 await 保存；失败仍返回原业务结果并发出 `d1-bookmark-storage-failed`，项目必须显示一致性缺口并走明确的权威重读流程，**不自动重试已成功写操作**。

按版本接入 TanStack Start 的 `serverFns.fetch`；SSR 分支保持 fetch(input) 与 fetch(input, init) 参数语义，服务器使用原请求 cookie/context。客户端直接 API、轮询、上传前置业务请求统一使用 wrapper；第三方上传/文件签名 URL 不发送书签。

Refresh/SSR：host-only cookie 在该浏览器同源下继续位置；不同主域/区域入口、浏览器或设备各自独立，切 origin 不是全局最新保证。

保留 headers、signal、credentials、Request/init 等 fetch 行为：显式 `init.headers` 整体替换原 Request 的头，空集合也会清除旧认证/内容类型；未指定或undefined才继承，再注入同源书签，不能合并残留旧认证。原method/body/signal保持原生语义。认证状态切换按项目清理相关状态，换库/重建库更换命名空间，不读取旧库书签。

## 流式写入与跨请求

SSE 响应头之后仍可能写入，头里的书签只是当时位置。以应用事件传最终/中间新位置：

```ts
let lastSent: string | null = null
function writeEvent(event: unknown) {
  const current = database.currentBookmark()
  if (current && current !== lastSent) {
    enqueueSse({ type: 'db_bookmark', bookmark: current })
    lastSent = current
  }
  enqueueSse(event)
}
```

这是顺序示意，enqueueSse/database 是接收项目接口。服务端在后续业务事件前发位置，客户端按事件顺序 `await channel.remember(event.bookmark)` 再刷新。解析器正确处理分段帧、多事件、断连、取消与工具错误。

- stream producer 保有同 session 以及合法生命周期；请求返回之后尚未执行的写入须通过已验证上下文/队列方案托管。
- 并发完成不让旧书签覆写新值；浏览器未收到的最终事件不算已确认位置。
- 数据展示 revision 合并另行保留：更老的 UI 响应仍可能比新响应晚到，书签不是前端状态排序器。
- SSE 断网不等于业务失败；扣费/任务幂等保持原合同，不能因此重复生成/重扣。

## 查询与客户端缓存优化

先量查询 count、等待总时间、rows_read 和 SQL duration，再选动作：

| 证据                 | 动作                              | 回归重点                           |
| -------------------- | --------------------------------- | ---------------------------------- |
| 多个独立串行 SELECT  | 同一会话 batch 或合适并行         | 参数、结果顺序、失败处理、业务依赖 |
| N+1列表/重复统计     | 联合/聚合查询，合并shell统计      | 分页、空列表、权限过滤、精度       |
| rows_read高/排序扫描 | 执行计划、复合索引、选择列/分页   | 实际索引命中及写入开销；DDL先批准  |
| 同请求重复auth/数据  | 仅请求内复用，保留权威边界        | 不把用户对象放全局变量             |
| hydration后串行读取  | SSR预取或共享Query key            | SSR位置、身份隔离与失效            |
| 保存后多处各自刷新   | 统一key/合理staleTime，失效相关项 | 余额、名称、列表、sidebar都刷新    |

依赖上条结果的 SQL 不盲目并行；展示缓存可陈旧不代表提交判断可以信任它。减少往返和读行数通常比仅改路由更普遍，但每项收益要实测。

## 异常与停用

非法/不可用书签先验证，明确有界失败处理；不依赖前端字符串保证提交正确性。若要退回主库重新读取，应做批准的 **只读** 恢复，禁止自动重放写操作或未知副作用的 ServerFn。

停用副本不是立即删除副本，官方说明最多24小时才停止副本处理；也不是数据回滚。需要即时恢复全部主库查询时切应用路由并验证，书签状态/权限与UI缺口按合同处理。

完成条件：正常、失败、无Cookie、无共享锁、断流、换库/停用都能解释结果；性能优化未增加业务重复或隐藏一致性失败。
