# 官方来源与版本核对

2026-11-07 为本 Skill 初次核对日期；执行时重查受影响API、安装版本和平台设置。下面是规则依据，不是复制当前账号配置。

| 事项                  | 来源                                                                                        | 核对要点                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D1副本与Sessions      | https://developers.cloudflare.com/d1/best-practices/read-replication/                       | 起始约束、写主库、书签等待、remote meta、当前收费；等待上限未公开                             |
| D1 binding数据库API   | https://developers.cloudflare.com/d1/worker-api/d1-database/                                | session方法、getBookmark直接返回string/null且无查询null；不照抄示例解构错误                   |
| D1返回对象            | https://developers.cloudflare.com/d1/worker-api/return-object/                              | served_by_region/served_by_primary、SQL duration排除网络、rows_read/written                   |
| D1书签排序            | https://developers.cloudflare.com/d1/reference/time-travel/                                 | 官方说明书签按字典序从旧到新；不解析内部格式或混合不同数据库；恢复点窗口不证明Session位置过期 |
| D1位置                | https://developers.cloudflare.com/d1/configuration/data-location/                           | 创建提示、jurisdiction与副本边界，不假定已有库可原地改地区                                    |
| D1定价                | https://developers.cloudflare.com/d1/platform/pricing/                                      | rows_read/written与计划限制按当前文档                                                         |
| R2位置                | https://developers.cloudflare.com/r2/reference/data-location/                               | hint best-effort、jurisdiction、同名桶重建不迁区                                              |
| R2公开域              | https://developers.cloudflare.com/r2/buckets/public-buckets/                                | custom domain缓存、r2.dev限制与其他访问路径                                                   |
| R2 binding/条件读取   | https://developers.cloudflare.com/r2/api/workers/workers-api-reference/                     | onlyIf失败无body与不存在null、If-Range不支持、httpEtag带引号、范围可截短                      |
| Cache API             | https://developers.cloudflare.com/workers/runtime-apis/cache/                               | put拒绝206/Vary:*、Set-Cookie、Range/Content-Length、SWR不支持                                |
| fetch缓存与Cache API  | https://developers.cloudflare.com/workers/reference/how-the-cache-works/                    | POP本地与Tiered差别、清除范围                                                                 |
| R2 binding缓存示例    | https://developers.cloudflare.com/r2/examples/cache-api/                                    | waitUntil与示例本身不保证私有鉴权                                                             |
| Worker Placement      | https://developers.cloudflare.com/workers/configuration/placement/                          | default/smart/显式位置；按installed schema核对字段                                            |
| AsyncLocalStorage     | https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/            | compatibility要求、run上下文、未支持方法                                                      |
| Static Assets headers | https://developers.cloudflare.com/workers/static-assets/headers/                            | 仅静态、多规则合并、长缓存需内容版本                                                          |
| Wrangler命令          | https://developers.cloudflare.com/workers/wrangler/commands/index.md                        | 先用项目本地 --help，确认资源/环境/只读与写入                                                 |
| Worker回滚            | https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/ | 代码回滚不回滚关联资源/数据                                                                   |
| Web Vitals            | https://web.dev/articles/vitals                                                             | LCP/INP/CLS，真实75分位和移动/桌面划分                                                        |
| 性能trace             | https://developer.chrome.com/docs/devtools/performance                                      | 实际trace和network APIs，不猜工具方法名                                                       |
| curl测量字段          | https://curl.se/docs/manpage.html                                                           | 累计阶段时间、%{json}、max-filesize、版本/协议支持                                            |
| HTTP Range/条件       | https://www.rfc-editor.org/rfc/rfc9110.html                                                 | GET Range、HEAD、304/412、If-Range、前置条件优先级                                            |

## 使用原则

- 平台文档与源码冲突时复核实际runtime；不能只引用最新types就声称旧compatibility date支持。
- 文档移位/404时从产品索引重新定位，不把探索未命中当服务故障。
- 书签按官方字典序比较，但内部格式仍不解析；若依赖额外workerd源码行为，记录版本/链接与回归测试。
- 无法取得某项文档/权限就写缺口，以本地证据做有界判断；不要求用户在聊天粘贴token，也不擅自安装或升级工具。
