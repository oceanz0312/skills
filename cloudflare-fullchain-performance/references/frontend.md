# 前端资源：缩短首屏链路，减少重复请求

覆盖网站 UI 字体、静态缓存、SSR/水合和数据请求。不把视频渲染器的字体等待策略与普通网页混为一谈。

## 字体与第三方域

1. 在真实网络记录中找外部字体 CSS → 字体二段请求、失败重试和回退，不仅搜索 package.json。CSS `@import` 本身会加依赖；只改 font-display 不消除它。
2. 对已获得分发许可的关键 UI 字体自托管 WOFF2，保留许可证；只包含实际需要的字重和字符集。中文大字库先衡量体积，可使用合理系统字体。下载物放独立目录，使用可信转换工具，不运行来源包安装脚本。
3. 根据视觉合同选 `font-display: optional` 或 `swap`，设置接近的 fallback 字体度量减少位移。optional 可以保留系统字体到当前导航结束，不是无条件视觉等价方案。
4. 只 preload 首屏关键字体，正确 `as=font`、MIME、crossorigin；全部字重/所有字体预载会争用首屏带宽。
5. 清理无实际使用的 Google Fonts 样式链接/preconnect；必须保留的关键第三方才考虑preconnect。在 Mac/iPhone、Windows/Android 等实际受众平台检查 computed font、中文/数字/符号、缺字、粗体/代码和位移，不能只验文件下载成功。
6. 视频/海报渲染通常需等待指定字体以保持输出稳定，可继续有另一套 font loading 合同；UI自托管不等于所有渲染字体均本地。

## 静态资源与媒体加载

- JS/CSS/字体/图片有真实内容哈希、同址不覆盖才长期 `immutable`。一年可作为版本化资产起点，寿命与撤回要求由产品定；手写查询v不证明底层不可变。
- 固定文件名使用短有效期/ETag重新验证，更新时换内容版本URL；当前头不能召回旧副本。旧HTML/运行中页面需要的旧chunk须在其有效窗口内保持可取。
- Workers Static Assets 的 `_headers` 只作用于静态资产，不作用于Worker生成的SSR/API。多条匹配同名头会逗号合并，不是最后覆盖；避免全站与assets规则冲突。其他适配器按本项目核对。
- 核对扩展名、Content-Type、nosniff、字体CORS/ETag与实际正文；HEAD验头不能替代GET字节。版本资源复访分别观察无请求、304与边缘HIT，不把它们混为一类。
- 检查实际Content-Encoding、transfer size与展开体积，确认Brotli/gzip生效；不重复压缩MP4、WOFF2、JPEG。HTTP探针identity样本不用于证明浏览器压缩收益。
- 图片设置width/height/aspect-ratio、响应尺寸和合理编码；压缩后文字/细线仍可读。已证实的LCP图通常不lazy，只给真正关键的一张合理优先级；屏外按可见性加载。
- 视频卡片先显示适当封面，按交互/可见性选择preload，不同时预下载一屏原片；预览与原片分开，媒体交付/转码规则见 [R2](r2.md#预览与原片)。

## SSR、产物与水合

- 检查生产构建而非dev bundle，区分入口传输/展开体积、parse/execute和长任务；只用项目允许的分析工具。
- 大解析器、编辑器、图表/播放器、邮件渲染和SDK按功能精确import/lazy；SSR-only库保持服务端边界。重复库/无用polyfill删除前确认浏览器目标，不以到处memo或手工vendor切片替代真实依赖分析。
- 首屏可见内容由SSR或正确骨架呈现，减少hydration后才能启动的数据链。SSR公开数据按身份/版本注入Query cache并复用，避免水合立即重拉同请求；个人数据不串入公开HTML缓存。
- 用浏览器trace定位LCP加载/渲染延迟、长任务和交互。骨架改善位移/等待感不等于实际LCP减少；实验室TBT不冒充真实INP。
- 保留locale/i18n、无JS体验和可访问性，首屏登录/表单在hydration前不会误提交。实际确认动态chunk加载、SSR/hydration无报错和导航/权限/提交行为不变。

## 合并数据请求与客户端缓存

- 导航余额/计数按业务合并读取，避免每次切路由重复认证REST链；主要内容/导航不等待不相关账号摘要或侧栏统计。
- TanStack Query等建立统一key和合理staleTime、retry、refetchOnFocus，按变化频率选择，不抄案例数字。
- 写入后失效所有相关key；页面余额与shell统计若是两份cache必须都失效，注释不是实现。
- ServerFn公共fetch与直接API wrapper统一携带D1书签，外站上传不传。以真实浏览器请求确认，不只看函数配置。
- 并发旧响应可能覆盖UI state，revision/CAS合并仍保留；D1书签不自动解决前端渲染倒退。
- 视频不重复创建多个重播放器；保持统一播放、seek、音量和下载控制。

## 完成条件

关键第三方请求按预期减少；字体许可和实际跨平台回退正确；GET正文、静态头/版本/旧chunk可用；首屏输入不退化；保存后余额/列表/名称刷新一致。按 [测量](measurement.md#浏览器与真实用户) 记录实际LCP/INP/CLS或trace，未测省时只报告请求/字节减少；发布矩阵见 [发布](release.md)。
