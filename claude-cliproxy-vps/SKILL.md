---
name: claude-cliproxy-vps
description: 搭建美国 VPS + CLIProxyAPI + 静态住宅代理，让 Claude Code 通过该代理使用 Claude Pro 订阅，并配好省 token 的设置。当用户要把 Claude 订阅经自建代理暴露成 API 供 Claude Code 使用时用本技能。
---

# 搭建 Claude Code 经 CLIProxyAPI + 住宅代理走订阅

目标架构：
```
Claude Code 客户端
  │  ANTHROPIC_BASE_URL=http://<VPS_IP>:8317  + <API_KEY>
  ▼
美国 VPS：CLIProxyAPI（systemd，:8317）
  │  requests.proxy-url = socks5://<PROXY_USER>:<PROXY_PASS>@<PROXY_HOST>:<PROXY_PORT>
  ▼
静态住宅(ISP)代理
  ▼
api.anthropic.com（用 Claude Pro 账号的 OAuth 凭证）
```

占位符：`<VPS_IP>` `<PROXY_HOST>` `<PROXY_PORT>` `<PROXY_USER>` `<PROXY_PASS>` `<API_KEY>` `<PANEL_PASSWORD>` `<SSH_KEY_PATH>`。

---

## 1. 买并准备 VPS（腾讯云轻量）

1. 打开 `https://cloud.tencent.com`，注册并登录（可能需扫码，交给用户本人完成）。
2. 打开 `https://buy.cloud.tencent.com/lighthouse`，地域选**美国硅谷（Silicon Valley）**，镜像选 **Ubuntu Server 24.04 LTS**，规格 2 核 2G 起，时长 1 个月。香港不在 Claude 支持区，不要选。
3. 实例「防火墙」放行 TCP **22** 和 **8317**（来源 `0.0.0.0/0`；若用户本地出口 IP 不固定，不要限来源）。
4. 配 SSH 密钥：控制台「SSH 密钥」里导入你的公钥并绑定实例（绑定会重启一次），或用网页终端把公钥追加进 `~/.ssh/authorized_keys`。私钥存到 `<SSH_KEY_PATH>`。
5. 验证：
```
ssh -i <SSH_KEY_PATH> ubuntu@<VPS_IP> 'cat /etc/os-release | head -2; nproc'
```

---

## 2. 买静态住宅代理（IPRoyal）

1. 打开 `https://iproyal.com/static-residential-proxies/`，注册登录。
2. 购买 **Static Residential（ISP）** 代理：地区 **United States**，数量 1，周期 30 天，协议勾选 SOCKS5（也会给 HTTP）。
3. 拿到连接信息：`<PROXY_HOST>`、`<PROXY_PORT>`（SOCKS5）、`<PROXY_USER>`、`<PROXY_PASS>`。妥善保存（文件权限 600）。
4. 建议买独享、不要选"动态/轮换"，整条链路要始终走同一个固定出口 IP。

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
requests:
  proxy-url: "socks5://<PROXY_USER>:<PROXY_PASS>@<PROXY_HOST>:<PROXY_PORT>"
```
说明：
- `requests.proxy-url` 是全局出口代理；也可在单个账号文件里加 `"proxy_url"` 覆盖（优先级：账号 > 全局；填 `"direct"` 表示该账号直连）。
- 改配置前先备份：`sudo cp config.yaml config.yaml.bak-$(date +%s)`，改完 `sudo systemctl restart cliproxy`。

---

## 5. 登录 Claude 账号 + OAuth 授权

前提：准备一个**已完成 KYC、已开通 Pro 的 Claude 账号**（例如在淘宝购买的成品号，通常附带邮箱/密码/2FA 或 magic-link 邮箱）。

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
5. 把回调 URL 粘回 VPS 终端那行提示并回车。成功后凭证写入 `/opt/cliproxy/auths/claude-*.json`，token 到期会自动刷新。

---

## 6. 开管理面板（加密码，不动防火墙）

1. config 设 `management.allow-remote: true`、`disable-control-panel: false`、`secret-key: <PANEL_PASSWORD>`，备份后重启。
2. 访问 `http://<VPS_IP>:8317/management.html`，用 `<PANEL_PASSWORD>` 登录（不是 API key）；若要求填服务器地址，填 `http://<VPS_IP>:8317`。
3. 面板里代理账号密码是明文显示，8317 又是公网明文 HTTP，面板密码别外传，别在公共网络登录。

---

## 7. 客户端 Claude Code 设置

编辑 `~/.claude/settings.json`，`env` 块（model id 用 `/v1/models` 实际返回的 id 填）：
```json
"env": {
  "ANTHROPIC_API_KEY": "<API_KEY>",
  "ANTHROPIC_BASE_URL": "http://<VPS_IP>:8317",
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
另在 shell 配置（如 `~/.zshrc`）加：`export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。

各设置的理由（一句话）：
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_API_KEY`：指向你的 CLIProxyAPI，key 是代理的客户端 key（非 Anthropic 官方 key）。
- 各 model 映射：把 Claude Code 内部模型名对到代理暴露的 id；**FABLE 两项映射到 opus**，避免选到无额度的 Fable 模型而报 429。
- `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`：按 200K 窗口处理，满了自动压缩，省 token（1M 是模型 API 默认，服务端无开关，只能客户端控制）。
- `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` + `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`：把提示缓存从 5m 改回 1h，断续使用时少重写上下文（需客户端 v2.1.242+，且代理透传 `anthropic-beta` 头；API 只有 5m/1h 两档）。
- `ENABLE_TOOL_SEARCH=true`：强制 MCP 工具按需加载，起步上下文大幅下降（第三方 base URL 下默认会全量前置所有工具）。
- `CLAUDE_CODE_ATTRIBUTION_HEADER=0`：不在系统提示前加归属信息，减少无谓变化/流量。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`：关掉非必要遥测/后台流量。

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
客户端确认 1h 缓存透传：
```
CLAUDE_CODE_PROMPT_CACHE_TTL=1h claude -p "hello" --output-format json
# usage.cache_creation 里 ephemeral_1h_input_tokens > 0（若只有 ephemeral_5m_* 说明代理没透传 anthropic-beta）
```
确认流量只走代理：
```
ss -tnp | grep cli-proxy-api   # 只有到 <PROXY_HOST>:<PROXY_PORT> 的出站，无直连 Anthropic
```

---

## 9. 常见坑

- **默认模型选到 Fable 报 429**：Pro 账号对部分高端模型无额度，`/model` 直接回车可能选中它。把客户端默认模型设为 opus/sonnet，并把 FABLE 映射到 opus。
- **管理面板 404**：config 缺 `management` 段；需加 `allow-remote`/`secret-key`/`disable-control-panel`。登录用面板密码，非 API key。
- **客户端连不上 VPS 超时**：客户端处于受限网络时 22/8317 不通；开代理/VPN 再连，或从云端环境直连。
- **浏览器直连 `IP:端口` 返回 400**：部分环境直连被拦；改用 `ssh -L` 建隧道后用 `localhost` 访问面板。
- **macOS 无 `timeout` 命令**：脚本别依赖 `timeout`，改用 `</dev/null` 等方式。
- **模型 id 命名**：旧模型名代理可能不认；一律用 `/v1/models` 返回的 id，或在代理里配别名映射。
- **第三方 base URL 关掉省 token 功能**：指向第三方代理后 Claude Code 会①全量前置 MCP 工具②缓存降到 5m。用 `ENABLE_TOOL_SEARCH=true` + `CLAUDE_CODE_PROMPT_CACHE_TTL=1h`(+SUBAGENT) 修复，并在 `/mcp` 关掉用不到的服务。
- **8317 公网明文**：会被扫描，日志可见陌生 IP 用错误 key 探测。可按需把防火墙限到固定来源 IP。

---

## 10. 回滚 / 维护

- 回滚：VPS `sudo cp <备份> /opt/cliproxy/config.yaml && sudo systemctl restart cliproxy`；客户端覆盖回 `settings.json` 备份并重开 Claude Code。
- **代理和 VPS 通常按月计费**：到期后代理断则请求全失败、VPS 回收则数据与 IP 丢失。**给两者各设一个到期前 3 天的提醒**，到期前续费或迁移。
- 日常省额度：同一会话里接着聊、少开新会话；关掉用不到的 MCP。

---

## 11. 安全边界（务必遵守）

- 不伪造浏览器指纹、不伪造地区（这类"过地区检查"工具的指纹/地区功能不要用）。
- 不改共享环境的系统时区。
- 不把本机所有 Claude 入口（网页/桌面/CC）统一强行指向住宅 IP——那属于绕开地区限制。
- 订阅转 API 可能违反 Anthropic 条款、有封号风险，仅供个人研究；用可接受被封的账号。
