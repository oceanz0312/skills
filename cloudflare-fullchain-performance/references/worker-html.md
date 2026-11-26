# Worker 与匿名 HTML 缓存

覆盖 SSR、Cache API 后台刷新、Worker Placement 和请求生命周期。缓存资格必须由响应内容的真实变体决定，不仅靠路径或 Cookie 名字。

## 目录

- [公开 HTML 缓存](#公开-html-缓存)
- [应用层后台刷新](#应用层后台刷新)
- [Worker Placement](#worker-placement)
- [减少计算与往返](#减少计算与往返)
- [验收矩阵](#验收矩阵)

## 公开 HTML 缓存

1. 列显式路由白名单，只选所有访客共用的公开 GET HTML。优先首页、介绍、法律/博客等；账户、付款、工作台、管理员、SSE/API 默认旁路。
2. 审计 Authorization、认证 Cookie、访问门禁、地域、语言、A/B 实验、租户、Host 与会改变输出的查询参数。不能只检查某个框架 Cookie 前缀。
3. 缓存键至少包含版本/build ID、受信站点/Host或租户、语言、页面路径及影响内容的模式/参数。若合并 host，先证明 HTML/SEO/绝对链接一致。
4. 只忽略已证明不影响内容的 tracking 参数；未知 query 旁路，不能删掉全部 query 来提高命中率。
5. 仅保存200、HTML的合格GET；HEAD可复用头但不写无正文副本。拒绝跳转、错误及 Set-Cookie、private/no-store、未穷尽的 Vary、个性化位置 header。不要剥掉 Set-Cookie 就把个人页面变成“可缓存”。
6. 浏览器对 HTML 使用重新验证策略，例如 `public, max-age=0, must-revalidate`；内部缓存寿命与 stale窗口分开。动态 SSR 头在 Worker Response 设置，`_headers` 不作用于它。

缓存键用 build ID 时部署切新命名空间，不能解释为“部署之后还会读上版 HTML 一天”。新构建仍有首个MISS，同版本后台刷新不消除它。旧HTML有效期内所需chunk须可取。同版本内容更新/下架需内容版本、刷新或清除，不能一边允许一天陈旧一边保证五分钟生效。可容忍一天陈旧不是默认，must-revalidate也不能召回历史一年浏览器HTML副本。

## 应用层后台刷新

Cache API 不支持直接设置 stale-while-revalidate/stale-if-error 来实现这个流程。应用自己存写入时间并处理：

```text
无缓存 / 无效时间戳（含未来值） → render → 校验资格 → 有界 tee，异步 put → 立即返回
age ≤ fresh → HIT
fresh < age ≤ maxStale → 返回旧副本，waitUntil 重渲染并更新
age > maxStale → 不再使用旧副本，走 render/受控失败
```

- 内部 TTL 与硬 maxStale 按产品接受度选；案例 fresh5分钟/maxStale1天仅示例。既要设置存储TTL，也要检查年龄以实现真实硬上限。
- 后台刷新仍执行完整资格检查；被更新成个人响应、错误或设置 Cookie 时不能覆盖公开缓存。
- 用isolate级in-flight去重，完成/失败后清理，使失败后可重试；不称跨POP/全局锁。
- 用框架真实execution context的ctx.waitUntil托管，缺失时安全降级不假装刷新已启动。捕获缓存读写异常并记录失败计数，缓存缺失/逐出时仍正常渲染。刷新失败可以在允许窗口使用旧副本；超过窗口的故障策略明确。
- 返回响应清除内部写入时间等元数据，保留调试命中标记（如 x-edge-cache）；公开响应不携带某访客的 D1 书签。
- 不对流式动态页面无限buffer。clone/tee的慢消费者会积压；限定复制预算，取消未用流，超预算只流式返回不缓存。大下载不套HTML方案。
- 不能用本地缓存命中代替真实 custom-domain/生产路由验证；不同 POP 可能各自冷启动。

## Worker Placement

从配置源与当前 schema读取 placement。默认 Worker 靠近用户；多次访问固定后端时 Smart 可能用更近后端的运行位置减少往返，也会增加用户到执行点的路程。

- 不默认开启/固定区域；先记录用户→Worker、Worker→数据库/外部服务、计算耗时。D1 已有近端副本时收益不同。
- 当前平台还有 region/host/hostname 等模式，互斥与支持范围按 installed schema/官方文档核对；host探测不适合任播/复制资源。
- Smart 需要稳定多地区流量，观察足够分析期；缺调用不能得出无效/已加速结论。配置按 Worker，不是每个调用点的“数据库地区开关”。
- 静态资产路径与 assets binding的执行位置不同，分别测量。
- 若确实需要边缘鉴权/缓存 Worker + 后端密集 Worker 的分层，可设计 service binding；这是架构变更，应先对齐，不能为套性能指南默认拆站。

## 减少计算与往返

- 移除重复身份读取、同响应重复数据库查询；保留服务端权威权限判定，不能为了快信任前端角色。
- 独立工作并行，依赖工作 batch/缩短链，不将每个 await 都替 Promise.all。
- 只在使用重功能时加载对应解析器/SDK；检查 SSR 导入是否把大客户端/邮件/媒体包带上关键请求。
- 通过直接 binding访问D1/R2/服务，不用 Cloudflare REST API 模拟可用 binding 的数据操作。
- 诊断异步、结构化、限量、不阻塞业务；缓存/日志失败不改变主流程。日志只留脱敏的类别和时长，不带 Cookie、认证码、签名 URL或文件正文。
- 数据状态用 request context/ALS，不在模块全局变量存请求用户、连接或书签。

## 验收矩阵

- 匿名 HIT、STALE刷新、MISS；个性化/私有/Cookie设置/错误/Vary未建模响应旁路。
- 修改语言、host、模式/query/租户不会串内容；build ID换后不读旧命名空间。
- 注入cache/clock/defer覆盖无效时间、缺context、缓存故障、超过硬上限；真实runtime验证waitUntil。两个并发STALE仅本isolate合并，失败后可再刷新，真实渲染错误不被吞。
- 公共缓存未泄露 D1位置或用户资料；静态和SSR缓存头分别验证。
- 命中 HTML 的 TTFB 与完整 LCP、可交互分别测，不把 hit 当页面完成。
