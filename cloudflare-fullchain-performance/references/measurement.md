# 测量：基线、归因与正确性

先回答“哪一段慢”，再证明“这次改动让它快了”。网络探针、Worker/D1 日志和浏览器性能测量各有边界，不能互相替代。

## 目录

- [建立可比基线](#建立可比基线)
- [分段时间与网络探针](#分段时间与网络探针)
- [脚本用法与安全](#脚本用法与安全)
- [服务端证据](#服务端证据)
- [浏览器与真实用户](#浏览器与真实用户)
- [验收与结论](#验收与结论)

## 建立可比基线

填写执行记录：用户地区/运营商、入口、时间窗口、colo、身份、部署 commit/version、页面/对象版本、请求方法、视频范围、缓存状态、浏览器状态。凭据和签名 URL 只留在受保护的本地输入，不进报告。

- **版本前后对照**：同内容、入口、地区与冷热条件，交替测量或在接近的时间窗重复；分别报告失败率和成功样本耗时。
- **冷热对照**：同一版本的 MISS/HIT 只证明该版本热命中更快，不证明优化前后收益。
- **地区对照**：实际用户地区分别采集；单台开发机切 Host 不能代替中国/美国用户探针。
- **操作对照**：首页 HTML、认证 API、视频首段、拖动、长 SSE 分开。HTML TTFB 不能替代“创作可交互”，64 KiB 视频段不能替代整片下载/解码。
- 不强制在生产清缓存，也不批量随机 query 制造 MISS。只读 GET 也需确认路由没有副作用、业务数据与用户授权匹配。

默认每入口串行 5 次、最多 10 次是探索样本；不报告可靠 P95 或全站速度保证。需要统计稳定结论时使用获批的真实用户采样或受控实验，不自行扩大生产压测。

## 分段时间与网络探针

curl 的 `time_namelookup`、`time_connect`、`time_appconnect`、`time_starttransfer` 都是从请求开始累计的时间。对新连接近似分解：

| 输出               | 计算                                          | 解释与边界                                           |
| ------------------ | --------------------------------------------- | ---------------------------------------------------- |
| dns_ms             | namelookup                                    | DNS 完成；本机/系统缓存会影响                        |
| tcp_ms             | connect − namelookup                          | TCP 建连阶段；代理环境会改变含义                     |
| tls_ms             | appconnect − connect                          | HTTPS 握手；明文 HTTP 不适用                         |
| first_response_ms  | starttransfer                                 | 首响应到达，可能是响应头，不是视频第一 payload 字节  |
| after_handshake_ms | starttransfer − appconnect（HTTP 用 connect） | 含入口往返、代理、Worker 和后端，不是纯 SQL/CPU 时间 |
| download_ms        | total − starttransfer                         | 剩余传输时间，不含解码与绘制                         |

每次脚本启动一个新 curl 进程，不复用连接池；操作系统 DNS 缓存和中间缓存仍可复用。默认 identity 编码用于下载字节上限，**不模拟浏览器压缩/连接复用**。检测压缩收益时另用浏览器或已核实支持和限制的工具，单独标记。

`CF-Ray` 只提取末尾 colo；它不证明 D1 查询来自该地区。`CF-Cache-Status: DYNAMIC` 也不排除 Worker 内部 Cache API 已 HIT。要观察内部命中，应用增加受控低信息量诊断/计数，脚本识别约定的 `X-Edge-Cache`；未返回即留空。

## 脚本用法与安全

依赖 Python 3 标准库与已安装 curl **8.4.0+**，以在未知 Content-Length 时也限制下载。脚本不会安装或升级工具。执行时从可信项目/脚本位置运行 Python `-I`，下载物放独立空目录。

### 普通公开页面

```bash
python3 -I /绝对路径/cloudflare-fullchain-performance/scripts/probe.py \
  --url https://example.com/ --label homepage --count 5 \
  --output /绝对路径/before-homepage.json
```

### 视频只测一个小段

```bash
python3 -I /绝对路径/cloudflare-fullchain-performance/scripts/probe.py \
  --url https://example.com/media/sample.mp4 --label video-start \
  --range bytes=0-65535 --expect-status 206 --max-bytes 131072 --verify-body \
  --count 5 --output /绝对路径/before-video.json
```

服务端忽略Range返回200或下载超预算都失败，不能作为“下载完成更快”。默认ok只代表传输和预期状态；启用`--verify-body`后还要求identity表示、实际长度/Content-Length及206的Content-Range一致，并比对同一请求多次SHA-256，变化样本判失败。支持安全整数内闭段、open和suffix，EOF截尾按总大小校验，不盲目要求固定64 KiB。

正文在私有临时目录有界暂存，流式计算摘要后删除；报告仅留字节数/摘要。摘要仍可能识别内容，分享前审查。已有可信段/完整文件摘要可加`--expect-sha256`，否则“一致”不证明内容本身正确。正文校验仅支持预期200或带Range的206；HTTP边界/权限/调用数/seek仍执行 [媒体完整矩阵](r2-verification.md)。非法/多段Range测试用项目既有验收工具，不让低量探针承担完整协议测试。

### 认证/签名 URL

在安全本地位置由用户或既有工具创建仅当前用户可读的普通文件（POSIX 权限 600/400、≤64 KiB）：

- URL 文件只含一个 URL；所有带查询参数的链接都用 `--url-file`，无查询的公开链接才用 `--url`。这是保守的输入限制，避免依赖不完整的敏感参数名称清单；路径本身带秘密时也用受保护文件。脚本不能撤回调用前已进入 shell 历史/初始 argv 的值。
- 请求头文件逐行 `name: value`，用 `--headers-file`，例如已有 Cookie 或 Authorization。不要在 shell 参数中展开它们。
- 文档和共享日志不包含文件内容；文件及其备份按项目凭据规则处理。label 只用无业务标识的 ASCII 短名。

```bash
python3 -I /绝对路径/cloudflare-fullchain-performance/scripts/probe.py \
  --url-file /受保护位置/target-url.txt \
  --headers-file /受保护位置/request-headers.txt \
  --label authenticated-read --count 3 \
  --output /绝对路径/authenticated-read.json
```

脚本只做GET、不跟随重定向、不持久保存响应正文（可选校验仅有界私有暂存后删除）、不回显curl错误全文；URL 和凭据经 stdin 传给 curl。JSON仅保留指标、状态、colo、受限placement诊断、有限缓存指令、校验头是否存在，以及启用正文校验时的长度/SHA。cf-placement可能变化，不作为业务合同。临时响应头在用户私有临时目录内，采样后删除；输出文件以 600 新建，拒绝覆盖已有文件。

边界：默认 5 次/间隔 1 秒/超时 15 秒/下载 2 MiB；选项最多 10 次、30 秒/次、8 MiB/次。失败样本保留，有任一失败返回 1；参数/环境/文件错误返回 2；全部达到所选状态及可选正文合同返回0；body_consistent无有效正文时为null，不能把全失败写一致。默认预期 200；合法 206/304 用 `--expect-status` 明确选择，常规业务验收不要把 4xx 改为预期来掩盖错误。

远程入口必须 HTTPS，HTTP 只允许字面回环 IP（如 127.0.0.1 / ::1）用于隔离验收，测试只用假凭据。协议遵循当前 curl 构建、代理环境与协商结果；输出实际 HTTP 版本，不假设支持 HTTP/3。没有自动重试，不因重试成功隐去原故障。

HEAD由项目既有工具单独验收；它不下载正文，不能替代GET字节或同等TTFB。成功样本按colo、外部/内部缓存和实际HTTP版本分组；旧专项脚本参数不保留，所有HTTP测量只使用本文件的probe入口。

## 服务端证据

按受限日志/聚合指标采样，不把访问令牌、用户输入、完整 SQL 或对象私密标识放进公开响应。

| 层     | 必需证据                                                                                                    | 不能据此宣称                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D1     | binding 会话的 `served_by_region`、`served_by_primary`、SQL duration、rows_read/written，业务往返数与总时间 | REST/本地 D1/colo 不能证明远程副本命中；SQL duration 不等于 API 总耗时 |
| R2     | 每次 get/head 次数、内部 full/range HIT/MISS、实际字节/摘要、后台缓存失败数                                 | 少一次 get 不自动等于 LCP 改善；不可把段命中当整片命中                 |
| HTML   | 公开资格、变体 key 摘要、build ID、缓存年龄/fresh/stale、SSR 总时长                                         | 旧构建命中不是部署验收；匿名 HIT 不证明认证用户正确                    |
| Worker | 请求总时长、CPU、外部等待、实际 placement、诊断采样开销                                                     | placement 字段已写不证明实际更快；waitUntil 不是永久任务               |

新增诊断要低开销、采样、脱敏、可关闭，采集/发送异常不影响用户主流程。观察本地 runtime 只能证明合同；远程真实副本与 POP 行为需相应环境证据。

## 浏览器与真实用户

用项目指定浏览器工具观察网络瀑布与真实界面；有性能 trace 能力时取实际 API/schema，不编造 trace 方法。缺 trace/RUM 就列未测项，继续做可用的网络、代码和运行时验证，不擅自安装工具。

分别检查：首屏关键资源发现、阻塞样式/脚本、字体来源、主线程长任务、水合、布局位移、点击/输入/导航、视频解码/seek和长 SSE。统计 transfer size 与资源展开大小要区分；确认压缩响应实际生效。

官方 Core Web Vitals 良好阈值：LCP ≤ 2.5 秒、INP ≤ 200 毫秒、CLS ≤ 0.1，按真实访问的 **75 分位**，移动/桌面分开。实验室 Lighthouse/单次 trace 不替代真实 INP 分布。骨架改善感知和 CLS，未必减少真实 LCP。

### 只读浏览器快照

在项目允许的浏览器打开已授权页面，等待实际首屏稳定；读取 [browser_snapshot.js](../scripts/browser_snapshot.js)，将整个IIFE表达式交给页面evaluate。它不是Node CLI，不打开页面/登录/刷新/滚动/发请求，只读当前性能条目和DOM，返回navigation阶段、origin/initiator资源汇总、字体来源/状态、图片loaded/broken/pending和DOM数量。

- 无observer，资源缓冲可能不完整；SPA后续导航不是独立测量轮。没有截图、LCP/INP/CLS/TBT、长任务、水合错误或播放器验收输出。
- connectIncludingTls包含TLS，不与tls重复相加；资源持续时间和不是首屏墙钟时间。
- transferSize=0不证明HIT，跨源无Timing-Allow-Origin尤其如此；同源还须结合网络记录、Service Worker和缓存策略。旧HIT响应头也可能来自浏览器副本。
- 图片统计覆盖全部document.images、不区分视口；pending懒图不是broken，仍人工确认首屏应加载资源。
- 字体按文件扩展名和Google Fonts域名识别，无扩展名会漏；状态不证明computed font/字符覆盖。stylesheetLinks统计全部样式链接，不包括CSS @import。
- 脚本内部解析URL但不输出路径/query/Cookie/正文；origin仍可能暴露内部域名，分享前脱敏。跳转后的导航计时可能受跨源隐私限制，HTTP探针逐跳单测。

## 验收与结论

1. 执行所改分支的正确性矩阵：鉴权、跨租户、冷/热、HTTP 条件、D1 并发、语言/Host、登录回跳、流式断连和失败路径。
2. 所有测试标记通过/失败/跳过/未测；同条件样本包含失败，不筛掉慢样本或跨 colo 混算。
3. 对耗时指标计算 `(优化前 − 优化后) / 优化前`，前值非零；标明样本量、成功/失败、中位数、比较条件与归因限制。
4. 将“代码具备路由”“功能验证通过”“实测快了多少”分开。不能把可能的最近副本、文档理论或其他站点结果写成本项目收益。

完成条件：每个已实施动作都有正确性结果与性能证据或明确缺口；未通过的功能不能靠更低耗时交付。
