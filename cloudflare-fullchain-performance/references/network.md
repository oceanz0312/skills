# 网络入口：先定位绕行，再决定是否加代理

覆盖浏览器到 Cloudflare 的路径；数据库和存储优化分别见 D1/R2 分支。区域代理是有运营成本的架构选择，不是所有站点的默认优化。

## 目录

- [区分四段耗时](#区分四段耗时)
- [优先修直接入口](#优先修直接入口)
- [按证据启用区域入口](#按证据启用区域入口)
- [代理合同](#代理合同)
- [验收与撤销](#验收与撤销)

## 区分四段耗时

1. 从目标用户地区测 DNS、TCP、TLS、首响应与下载；至少区分中国大陆、亚洲、美国和欧洲中实际有用户的地区。
2. 比较主域、只返回静态健康响应的 Worker 路由、静态资源、真实业务 API。健康快而业务慢时，向后端或计算继续定位；健康也慢才支持入口链路问题。
3. 记录 `CF-Ray` 尾部 colo、远端 IP、协议版本、是否走客户端代理。Anycast IP 不是固定机房 IP；colo 会随运营商、时间和路由变化。`CF-Ray` 也不是 D1 的服务地区。
4. 查 A/AAAA/CNAME、DNS 灰云/橙云、重定向链及 TLS 域名。`traceroute`/MTR 的中间 ICMP 丢包不等于 HTTPS 丢包；对端不应答不能直接判断故障。
5. 工具缺失时使用当前系统支持的替代（例如用 OpenSSL `-text` 查看证书），记录证据缺口，不凭 IP 地理库推断整条路径。

TLS 累计值应换算为阶段差值，具体见 measurement。不要将一次暖 DNS 请求标为冷启动基线。

## 优先修直接入口

- 统一 HTTPS 与规范路径，减少串行 301/302、语言跳转和跨域认证请求。
- 浏览器业务 API 尽量使用当前同源；固定主站 origin 可能让区域入口用户每次跨回主站，还会丢 host-only 会话。
- 清理确实不用的第三方域名和 preconnect，尤其是首屏字体、脚本、图片链；不要通过无依据的 DNS/协议开关“碰碰运气”。
- 测 HTTP/2/3 是否真正协商、是否存在协议路径异常。替换 DNS 提供商、启用 HTTP/3 或 BBR 不保证消除国际路由绕行。
- 查看 Worker Placement：默认靠近 incoming request；Smart 针对多次后端往返可能更快，但会改变请求位置，需持续流量和对照。不要默认将有 D1 副本的站点固定到主库地区。Worker 移位不迁移 R2/D1 数据，详见 worker-html。

### 规范化与地区跳转

从路由/i18n核实canonical、链接生成和最终规范URL一致。确定性的GET/HEAD规范化可放SSR前，以合适的301/308和有限缓存保留原query；站内链接直接指向规范地址，缓存跳转也不能消除首次多一次请求。验收GET/HEAD、query、其他路径、POST、循环和最终URL。

地区/用户偏好跳转是个性化响应，不得跨人共享缓存；先判断门禁/镜像再进入合格HTML缓存。它不等同于确定性路径规范化。

### CDN机制与静态分流

静态资产按框架和安全合同直接服务，避免无必要经过SSR。Cache Rules、fetch CDN缓存和Workers Cache API是不同机制；Response加public不代表全球已缓存，Cache API逐POP独立且不支持Tiered Cache。需要分层回源时核实支持的fetch/公开域路径及授权。

检查规则优先级、URL normalization、query/Cookie和origin头覆盖，防止规则强制缓存private/no-store或忽略内容版本。Placement诊断头可能变化，只用于观测，不作为业务合同。

## 按证据启用区域入口

仅在直接入口确实绕行、新入口测得更稳定/更快、用户同意运营和费用时实施：

```text
目标地区用户 → 区域 VPS/CDN 入口 → TLS 回源 Cloudflare origin → 同一 Worker
其他地区用户 → 主域 Cloudflare → 同一 Worker
```

香港常用于服务中国大陆，但机器地理位置不保证大陆线路质量；运营商、带宽、国际出口和到 Cloudflare 的回源都要测。Cloudflare 中国网络属于另一产品与准入模型，VPS 代理不等于购买了中国网络，也不消除法律/备案/数据合规要求。

- 代理入口 DNS-only 指向服务器；Worker origin 使用另一个自定义域名。不能把同一 hostname 同时当灰云 VPS 和 Worker custom domain。
- 主域保留给全球用户；地区跳转只作用于合适的浏览器页面导航，保留路径/查询，提供关闭偏好。API、OAuth callback、Webhook、静态资产不盲目跳转。
- 先检查 origin 和代理两跳健康，再启用跳转。尽量一次导航到正确入口，不把所有用户强制送香港。
- 完整列出域名、DNS、VPS、防火墙、TLS、OAuth、可信代理、监控与故障撤销；逐项取得授权。资源 ID 和凭据从接收项目读取。

## 代理合同

- TLS 验证正常开启，回源 SNI 与 Host 指向 origin；公开 host 的恢复必须同时验证可信代理来源/防伪标记及 hostname 白名单。仅接受任意客户端的 `X-Forwarded-Host` 白名单不是来源认证。
- 信任链逐跳清晰：由代理覆盖/正确追加 X-Forwarded-For，客户端 IP 从可信链右侧剥离；删除客户端伪造的 CF/IP/应用内部标记头。测试真实 IP 的限流与审计，不让所有用户落入 VPS 的同一 IP 桶。
- 浏览器链接、上传地址、登录和支付回跳采用允许的当前 origin；host-only cookie 在主域和区域入口独立。增加 OAuth 回调和 CSRF trusted origins，不扩大成任意 origin。
- SSE 禁止响应缓冲，及时 flush，使用 `no-cache, no-transform`、心跳、合适超时和断连取消。Caddy 可使用 `flush_interval -1`；具体读写/首响应超时来自产品最长流，不照抄某站的秒数。
- 保留 Range、If-Range、ETag、Accept-Encoding 及请求方法，正确处理 GET/HEAD 的空 body。不要透明改变媒体字节而让范围和摘要失效。
- 普通 HTML/JS/CSS 保持正确压缩；SSE/媒体按内容合同避免变换。某案例全站不 `encode` 不是通用推荐。
- 核实代理→origin的HTTP keep-alive、连接池/TLS复用、DNS、HTTP/2与实际回源机房；多加一跳不代表这段连接天然更快。
- 代理限制与应用上传限制对齐，有上限和失败反馈；增加超时/取消测试，而不是无限扩大请求预算。
- 镜像 SEO 按产品设置 canonical/noindex/robots，origin 管理入口不应重复收录。静态资产绕过 Worker 时单独检查这些头。

## 验收与撤销

在同一客户端、地区和时间窗口比较主域与新入口；不跨 colo 合并性能样本。验证 TLS、登录、真实 IP、超过预期时长的 SSE、文件上传、Range/seek、缓存和多语言。

先部署正确代理与 Worker 信任，再启用 DNS/跳转。撤销时先停止自动跳转并验证，再删除入口 DNS；仅删 DNS 会使用户继续跳到失效地址。回滚 Worker 不会回滚 DNS、服务器或 OAuth 配置。
