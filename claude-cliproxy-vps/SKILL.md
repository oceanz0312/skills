---
name: claude-cliproxy-vps
description: >-
  在美国 VPS 上部署开源 CLIProxyAPI，配固定出口代理，接入已开通 Pro 的 Claude 账号，用 Cloudflare Workers 中转域名对外提供访问，
  并支持多账号（每个账号一个独享出口 IP、轮询加会话绑定），在本地走通整条调用链路的技术验证流程（含省 token 的参数设置）。
  适用场景：想把 Claude 订阅经自建代理暴露成 API，并用本地开发工具验证端到端是否打通；或者想给已有部署加中转域名、加账号。
---
# 用开源 CLIProxyAPI 走通 Claude 订阅调用链路（技术验证）

这是一个把开源项目 CLIProxyAPI 落地到真实部署、验证整条路径能否端到端跑通的实验。

目标架构：
```
本地开发工具（ANTHROPIC_BASE_URL=https://<RELAY_DOMAIN> + <API_KEY>）
  │  HTTPS
  ▼
Cloudflare Worker（<RELAY_DOMAIN>，所有路径原样透传）
  │  http://<VPS_IP>.nip.io:8317
  ▼
美国 VPS：CLIProxyAPI（systemd，:8317）
  │  出口：账号 proxy_url > 全局 requests.proxy-url > 直连
  ├─ 账号 1 → <PROXY_URL_1>（固定出口 IP #1）
  └─ 账号 2 → <PROXY_URL_2>（固定出口 IP #2）
        ▼
api.anthropic.com（各账号自己的 Claude Pro OAuth 凭证）
```

占位符：`<VPS_IP>` `<RELAY_DOMAIN>` `<CUSTOM_DOMAIN>` `<PROXY_HOST>` `<PROXY_PORT>` `<PROXY_USER>` `<PROXY_PASS>` `<PROXY_URL_1>` `<PROXY_URL_2>` `<API_KEY>` `<PANEL_PASSWORD>` `<SSH_KEY_PATH>` `<AUTH_INDEX>`。

步骤顺序：§1–§8 先用 `http://<VPS_IP>:8317` 走通单账号 → §9 换成中转域名 → §10 按需加账号。

---

## 1. 买并准备 VPS（腾讯云轻量）

1. 打开 `https://cloud.tencent.com`，注册并登录（可能需扫码，交给用户本人完成）。
2. 打开 `https://buy.cloud.tencent.com/lighthouse`，地域选**美国硅谷（Silicon Valley）**，镜像选 **Ubuntu Server 24.04 LTS**，规格 2 核 2G 起，时长 1 个月。
3. 实例「防火墙」放行 TCP **22** 和 **8317**（来源 `0.0.0.0/0`；如果用户本地出口 IP 不固定，就不要限来源）。只靠开 443 或做端口转发，解决不了国内网络访问的问题，要用 §9 的中转域名。
4. 配 SSH 密钥：控制台「SSH 密钥」里导入你的公钥并绑定实例（绑定会重启一次），或用网页终端把公钥追加进 `~/.ssh/authorized_keys`。私钥存到 `<SSH_KEY_PATH>`。
5. 验证：
```
ssh -i <SSH_KEY_PATH> ubuntu@<VPS_IP> 'cat /etc/os-release | head -2; nproc'
```

---

## 2. 买固定出口代理（IPRoyal 静态住宅）

1. 打开 `https://iproyal.com/static-residential-proxies/`，注册登录。
2. 购买 **Static Residential（ISP）** 代理：地区 **United States**，数量 1，周期 30 天，协议勾选 SOCKS5（也会给 HTTP）。
3. 拿到连接信息：`<PROXY_HOST>`、`<PROXY_PORT>`（SOCKS5）、`<PROXY_USER>`、`<PROXY_PASS>`。妥善保存（文件权限 600）。
4. 选独享的固定出口 IP（不要选动态或轮换的），让整条链路始终从同一个 IP 出网，网络更稳定。热门城市常缺货，有货的选哪个都行。付款前把最终总价发给用户确认。
5. **计划用几个账号，就准备几个 IP**（一个账号一个，见 §10）。
6. IP 定位库标的城市可能和下单城市不一样，不影响使用。

---

## 3. 装 CLIProxyAPI + systemd

1. SSH 进 VPS，下载对应架构的发行包（amd64 示例，版本号按需替换）：
```
cd /tmp
curl -LO https://github.com/router-for-me/CLIProxyAPI/releases/download/v8.0.24/CLIProxyAPI_8.0.24_linux_amd64.tar.gz
sudo mkdir -p /opt/cliproxy
sudo tar -xzf CLIProxyAPI_8.0.24_linux_amd64.tar.gz -C /opt/cliproxy
```
2. 建无登录 shell 的服务账号并授权目录：
```
sudo useradd -r -s /usr/sbin/nologin -d /opt/cliproxy cliproxy
sudo chown -R cliproxy:cliproxy /opt/cliproxy
```
3. 写 `config.yaml`（见 §4），权限 600、属主 cliproxy。
4. 写 `/etc/systemd/system/cliproxy.service`：
```ini
[Unit]
Description=CLIProxyAPI
After=network-online.target
Wants=network-online.target

[Service]
User=cliproxy
Group=cliproxy
WorkingDirectory=/opt/cliproxy
ExecStart=/opt/cliproxy/cli-proxy-api --config /opt/cliproxy/config.yaml
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```
5. 启用并检查：
```
sudo systemctl daemon-reload
sudo systemctl enable --now cliproxy
systemctl is-active cliproxy        # 预期 active
ss -ltnp | grep 8317                # 预期 LISTEN :8317
```

---

## 4. config.yaml（模板）

`/opt/cliproxy/config.yaml`（600，属主 cliproxy），占位符如下：
```yaml
config-version: 8
server:
  host: "0.0.0.0"
  port: 8317
management:
  allow-remote: true            # 开管理面板时 true，不开则 false
  secret-key: <PANEL_PASSWORD>  # 写入后服务器自动哈希存储
  disable-control-panel: false  # 开面板时 false，不开则 true
access:
  api-keys:
    - "<API_KEY>"
oauth:
  auth-dir: "/opt/cliproxy/auths"
  # excluded-models:            # 可选：隐藏用不到的模型，让 /v1/models 只留实际要用的几个
  #   claude:
  #     - "<不需要的模型 id>"
requests:
  proxy-url: "socks5://<PROXY_USER>:<PROXY_PASS>@<PROXY_HOST>:<PROXY_PORT>"
routing:                        # 多账号时生效，见 §10.4
  strategy: "round-robin"
  session-affinity: true
  session-affinity-ttl: "1h"
```
说明：
- `requests.proxy-url` 是全局出口代理；单个账号文件里可以加 `"proxy_url"` 覆盖。优先级：账号 > 全局 > 直连。支持 `http`、`https`、`socks5`、`socks5h`，填 `direct` 表示这个账号直连。
- 改配置前先备份：`sudo mkdir -p /opt/cliproxy/backups && sudo cp /opt/cliproxy/config.yaml /opt/cliproxy/backups/config.yaml.bak-$(date +%Y%m%d-%H%M%S)`。
- **原地改写**同一个文件（比如 `sudo tee` 或直接用编辑器保存），服务会自动热加载。没生效时再 `sudo systemctl restart cliproxy`，重启会中断几秒。

---

## 5. 用你自己的 Claude Pro 账号授权（OAuth）

前提：用你自己的、已开通 Pro 的 Claude 账号。

1. 在 agent 的浏览器里打开 `https://claude.ai/login`，用该账号登录（邮箱 magic-link 或账号密码+2FA）。确认账号为 Pro。
2. 在 VPS 上启动登录（用 tmux 防断开）：
```
tmux new -s login
/opt/cliproxy/cli-proxy-api --config /opt/cliproxy/config.yaml -claude-login -no-browser
```
   它会打印一个授权链接，回调地址固定为 `http://localhost:54545/callback`。
3. 在本地开 SSH 隧道，把 VPS 的 54545 映射到本地：
```
ssh -i <SSH_KEY_PATH> -L 54545:127.0.0.1:54545 ubuntu@<VPS_IP>
```
4. 在浏览器打开授权链接并点 **Authorize**，页面会跳到 `http://localhost:54545/callback?code=...`（打不开属正常）。复制整条回调 URL。
5. 把回调 URL 粘回 VPS 终端那行提示，回车。成功后凭证写入 `/opt/cliproxy/auths/claude-*.json`，token 到期会自动刷新。
6. 第二个及以后的账号用 §10 的面板方式添加，更省事。

---

## 6. 开管理面板（加密码，不动防火墙）

1. config 设 `management.allow-remote: true`、`disable-control-panel: false`、`secret-key: <PANEL_PASSWORD>`，备份后重启。
2. 访问 `http://<VPS_IP>:8317/management.html`（配好 §9 后改用 `https://<RELAY_DOMAIN>/management.html`），用 `<PANEL_PASSWORD>` 登录，不是 API key。
3. 常用页面：
   - 「认证文件」：账号列表；
   - 「OAuth 登录」：添加账号；
   - 「配额」：各账号的 5 小时和每周用量；
   - 配置面板 → 通用：客户端 API key。
4. 面板里会明文显示代理账号密码，面板密码要私下保管，别在公共网络下登录。

---

## 7. 本地开发工具设置

编辑 `~/.claude/settings.json`，`env` 块（model id 用 `/v1/models` 实际返回的 id 填）：
```json
"env": {
  "ANTHROPIC_API_KEY": "<API_KEY>",
  "ANTHROPIC_BASE_URL": "https://<RELAY_DOMAIN>",
  "ANTHROPIC_MODEL": "<opus-model-id>",
  "ANTHROPIC_DEFAULT_OPUS_MODEL": "<opus-model-id>",
  "ANTHROPIC_DEFAULT_SONNET_MODEL": "<sonnet-model-id>",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL": "<haiku-model-id>",
  "CLAUDE_CODE_SUBAGENT_MODEL": "<opus-model-id>",
  "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME": "<opus-model-id>",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME": "<haiku-model-id>",
  "ANTHROPIC_DEFAULT_FABLE_MODEL": "<opus-model-id>",
  "ANTHROPIC_DEFAULT_FABLE_MODEL_NAME": "<opus-model-id>",
  "CLAUDE_CODE_DISABLE_1M_CONTEXT": "1",
  "CLAUDE_CODE_PROMPT_CACHE_TTL": "1h",
  "CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL": "1h",
  "ENABLE_TOOL_SEARCH": "true",
  "CLAUDE_CODE_ATTRIBUTION_HEADER": "0"
}
```
`ANTHROPIC_BASE_URL` 在 §9 完成前先填 `http://<VPS_IP>:8317`，完成后改成中转域名，末尾不加 `/`。

另在 shell 配置（如 `~/.zshrc`）加：`export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。

各设置的技术效果（一句话）：
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`：把请求指向你的 CLIProxyAPI，key 是代理的客户端 key（非 Anthropic 官方 key）。
- 各 model 映射：把工具内部的模型名对到代理暴露的 id；**FABLE 两项映射到 opus**，这样默认不会选到当前账号没有额度的高端模型（否则会返回 429）。
- `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`：按 200K 上下文窗口处理，满了自动压缩，减少单轮 token 用量（1M 是模型 API 默认值，服务端无开关，只能在客户端控制）。
- `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` + `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`：把提示缓存时长设为 1 小时，断续使用时少重写上下文（需工具 v2.1.242+，且代理透传 `anthropic-beta` 头；API 只有 5m/1h 两档）。
- `ENABLE_TOOL_SEARCH=true`：让 MCP 工具按需加载，起步上下文显著变小（经第三方 base URL 时默认会把全部工具前置）。
- `CLAUDE_CODE_ATTRIBUTION_HEADER=0`：不在系统提示前加归属信息，减少无谓变化和流量。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`：关闭非必要的后台遥测流量。

---

## 8. 验证（含预期）

VPS 上：
```
systemctl is-active cliproxy                                   # active
curl -s -H "Authorization: Bearer <API_KEY>" http://127.0.0.1:8317/v1/models \
  | python3 -c 'import json,sys;print([m["id"] for m in json.load(sys.stdin)["data"]])'
# 列出账号可用的模型 id（以实际返回为准）
```
出口 IP 走代理：
```
curl -x socks5h://<PROXY_USER>:<PROXY_PASS>@<PROXY_HOST>:<PROXY_PORT> -s https://ipinfo.io/ip
# 预期为代理出口 IP（与 VPS 直连出口不同）
```
测试消息：
```
curl -s http://127.0.0.1:8317/v1/messages -H "Authorization: Bearer <API_KEY>" \
  -H "content-type: application/json" -H "anthropic-version: 2023-06-01" \
  -d '{"model":"<haiku-model-id>","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'
# 正常返回 assistant 文本
```
确认 1h 缓存透传：
```
CLAUDE_CODE_PROMPT_CACHE_TTL=1h claude -p "hello" --output-format json
# usage.cache_creation 里 ephemeral_1h_input_tokens > 0（若只有 ephemeral_5m_* 说明代理没透传 anthropic-beta）
```
确认流量只走代理：
```
ss -tnp | grep cli-proxy-api   # 只有到 <PROXY_HOST>:<PROXY_PORT> 的出站，无直连 Anthropic
```


---

## 9. 用 Cloudflare Workers 中转域名代替原始 IP

**为什么**：`http://<VPS_IP>:8317` 是海外裸 IP 加非标准端口，在部分网络下连不上或不稳定。在 VPS 前加一个免费的 Cloudflare Worker，对外就变成一个 HTTPS 域名。接口、管理面板、流式输出（SSE）都走这个域名，原始 IP 只作备用。

1. 登录 Cloudflare → Workers & Pages → 创建 Worker（比如 `relay`），会得到 `<RELAY_DOMAIN>`（`*.workers.dev`）。
2. 代码。Worker 不能直接请求「裸 IP + 非标准端口」，所以用 `nip.io` 把 IP 包装成主机名：
```js
const UPSTREAM = 'http://<VPS_IP>.nip.io:8317';
export default {
  async fetch(req) {
    const u = new URL(req.url);
    const target = UPSTREAM + u.pathname + u.search;   // 所有路径原样透传
    const h = new Headers(req.headers);
    for (const k of [...h.keys()]) {
      if (k.startsWith('cf-') || k === 'host' || k === 'x-forwarded-proto' || k === 'x-real-ip') h.delete(k);
    }
    const init = { method: req.method, headers: h, redirect: 'manual' };
    if (req.method !== 'GET' && req.method !== 'HEAD') init.body = req.body;
    const up = await fetch(target, init);
    return new Response(up.body, up);                   // 流式透传，SSE 正常
  }
};
```
3. 验证：
```
curl -s -o /dev/null -w '%{http_code}\n' https://<RELAY_DOMAIN>/v1/models               # 401，说明已到达 CLIProxyAPI
curl -s -H "Authorization: Bearer <API_KEY>" https://<RELAY_DOMAIN>/v1/models            # 模型列表
curl -sN https://<RELAY_DOMAIN>/v1/messages -H "Authorization: Bearer <API_KEY>" \
  -H "content-type: application/json" -H "anthropic-version: 2023-06-01" \
  -d '{"model":"<haiku-model-id>","max_tokens":16,"stream":true,"messages":[{"role":"user","content":"ping"}]}'   # 能看到逐条 event
```
4. 本地 `ANTHROPIC_BASE_URL` 改成 `https://<RELAY_DOMAIN>`，面板改用 `https://<RELAY_DOMAIN>/management.html`。
5. **兜底：绑自定义域名**。`*.workers.dev` 在部分网络下会被整个屏蔽。可以把自有域名托管到 Cloudflare，然后在 Worker → 设置 → 域和路由里添加自定义域 `<CUSTOM_DOMAIN>`，证书自动签发。本地改用 `https://<CUSTOM_DOMAIN>`，代码不用动。
6. **临时替代：Quick Tunnel**。跑 `cloudflared tunnel --url http://localhost:8317` 会得到一个 `https://<随机>.trycloudflare.com`，不需要账号，但进程一重启地址就变，只适合临时测试。
7. 注意：
   - Worker 只做透传，鉴权仍然靠 `<API_KEY>` 和 `<PANEL_PASSWORD>`；
   - Worker 到 VPS 这一段还是明文 HTTP。

---

## 10. 多个 Claude 账号

### 10.1 原则：一个账号一个独享固定出口 IP
每个账号绑一个自己专用的固定出口 IP（§2 买几个就用几个），用账号认证文件里的 `proxy_url` 指定。优先级：账号 `proxy_url` > 全局 `requests.proxy-url` > 直连。

### 10.2 添加账号（管理面板 OAuth 页）
面板的 OAuth 登录在服务器端换 token，**这一步走全局 `proxy-url`**：
1. 先给已有账号写好自己的 `proxy_url`（比如账号 1 → `<PROXY_URL_1>`）。
2. 备份后，**临时**把全局 `requests.proxy-url` 改成新账号的代理 `<PROXY_URL_2>`，原地改写，等它热加载。
3. 面板 →「OAuth 登录」→ Anthropic 一栏点登录，生成**新的**授权链接（不要用以前打开过的旧链接）。
4. 在浏览器打开链接，用你自己的 Claude Pro 账号授权。浏览器会跳到 `http://localhost:54545/callback?code=...`（打不开是正常的），复制整条地址粘回面板，提交。
5. 「认证文件」页出现新账号，就说明添加成功了。

### 10.3 给新账号绑定 IP，恢复全局
1. 备份后，在新账号的 `auths/claude-*.json` 里加一个顶层字段：`"proxy_url": "<PROXY_URL_2>"`。
2. 把全局 `requests.proxy-url` 改回 `<PROXY_URL_1>`。
3. 检查权限：`sudo chown cliproxy:cliproxy /opt/cliproxy/auths/*.json && sudo chmod 600 /opt/cliproxy/auths/*.json`。
4. 认证文件和配置都会热加载，不用重启。

### 10.4 分配策略（推荐：轮询 + 会话绑定）
```yaml
routing:
  strategy: "round-robin"        # 默认；另有 fill-first、weighted-round-robin
  session-affinity: true         # 同一个对话固定落在同一个账号
  session-affinity-ttl: "1h"     # 约 1 小时没有请求就解除绑定
  # session-affinity-subagents: true（默认）子任务跟随主对话用同一个账号
```
- 好处：同一个对话一直用同一个账号，提示缓存能连续命中，更省额度；不同对话分散到各个账号，额度消耗更均匀。绑定的账号不可用时会自动换到其他账号。
- 备选 `strategy: "fill-first"`：先用满一个账号再换下一个。缓存一样省，但会集中消耗一个账号，切换时可能有个别请求要重试。
- 验证方法：同一个会话连续发几条，都打到同一个账号；新开会话会换账号（看面板日志或「认证文件」页的请求计数）。

### 10.5 逐个账号验证出口
```
curl -s -H "Authorization: Bearer <PANEL_PASSWORD>" https://<RELAY_DOMAIN>/v0/management/auth-files    # 查各账号的 auth_index
curl -s -X POST https://<RELAY_DOMAIN>/v0/management/api-call \
  -H "Authorization: Bearer <PANEL_PASSWORD>" -H "content-type: application/json" \
  -d '{"auth_index":"<AUTH_INDEX>","method":"GET","url":"https://ipinfo.io/json"}'
# 预期：每个账号返回的都是它自己那个固定出口 IP
```

### 10.6 看额度
- 面板「配额」页：每个账号的 5 小时和每周用量。
- 也可以用 `api-call` 以某个账号的身份查询：`{"auth_index":"<AUTH_INDEX>","method":"GET","url":"https://api.anthropic.com/api/oauth/usage","header":{"Authorization":"Bearer $TOKEN$","anthropic-beta":"oauth-2025-04-20"}}`。

---

## 11. 常见坑

- **默认模型选到没有额度的高端模型报 429**：Pro 账号对部分高端模型没有额度，`/model` 直接回车可能选中它。把默认模型设为 opus/sonnet，并把 FABLE 映射到 opus。
- **管理面板 404**：config 缺 `management` 段；需加 `allow-remote`/`secret-key`/`disable-control-panel`。登录用面板密码，非 API key。
- **本地连不上 `IP:8317`**：受限网络下海外裸 IP 不稳定，开了网络代理也不一定能通。用 §9 的中转域名。
- **`*.workers.dev` 打不开**：有些网络会整个屏蔽这个域名。给 Worker 绑一个自定义域名（§9.2）。
- **Worker 请求上游失败**：Worker 不能直接请求「IP + 非标准端口」，上游要写成 `http://<VPS_IP>.nip.io:8317`。
- **加账号时授权走错出口**：面板 OAuth 换 token 用的是全局 `proxy-url`，按 §10.2 先临时把全局切到新账号的代理。
- **授权回调端口**：Claude 是 `localhost:54545/callback`（`1455` 是别的服务商用的）。
- **改配置没生效**：要原地改写才会热加载；新加的认证文件权限要 600、属主 cliproxy。
- **浏览器直连 `IP:端口` 返回 400**：有些环境会拦直连。改用中转域名，或者 `ssh -L` 建隧道后用 `localhost` 访问面板。
- **macOS 无 `timeout` 命令**：脚本别依赖 `timeout`，改用 `</dev/null` 等方式。
- **模型 id 命名**：旧模型名代理可能不认；一律用 `/v1/models` 返回的 id，或在代理里配别名映射。
- **经第三方 base URL 时默认关掉省 token 功能**：指向第三方代理后工具会①把 MCP 工具全量前置②缓存默认降到 5m。用 `ENABLE_TOOL_SEARCH=true` + `CLAUDE_CODE_PROMPT_CACHE_TTL=1h`(+SUBAGENT) 恢复，并在 `/mcp` 关掉用不到的服务。
- **8317 公网明文**：会被公网扫描探测。可按需把防火墙限到固定来源 IP。

---

## 12. 回滚 / 维护

- 回滚：VPS 上 `sudo cp <备份> /opt/cliproxy/config.yaml`（会热加载，必要时重启）；本地用 `settings.json` 的备份覆盖回去，重开工具。
- 去掉某个账号的独立 IP：删掉它的 `proxy_url`；关掉会话绑定：设 `session-affinity: false`；不用中转了：base URL 改回 `http://<VPS_IP>:8317`。
- **代理和 VPS 通常按周期计费**：某个代理到期后，用它的账号请求会全部失败；VPS 被回收，数据和 IP 都会丢。**给每个代理和 VPS 各设一个到期前 3 天的提醒**，到期前续费；换新 IP 后记得更新对应账号的 `proxy_url`。
- 日常省额度：同一会话里接着聊、少开新会话；关掉用不到的 MCP。

---

## 13. 使用须知

- 这是对开源项目的一次技术验证。
- 使用过程中遵守所涉各项服务的服务条款（Anthropic、云服务商、代理服务商、Cloudflare）。
- 购买任何东西之前，先把最终总价发给用户，等他明确确认。
- 妥善保管各类 key、密码与凭证，不要外传。
- 不要修改共享环境的系统时区。
