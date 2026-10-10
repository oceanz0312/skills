# skills（源码仓库，私有）

存放 Agent Skills 的原始源码。线上分发由 skills 注册表负责：https://oceanz.me/skills

## 结构

```
<slug>/
  SKILL.md          # 主文件，frontmatter 的 name 必须等于 <slug>
  references/       # 按需读取的参考文档
  scripts/          # 配套脚本
  assets/           # 模板、示例、图片
```

## 路径同构

每个 skill 目录与线上地址一一对应：

```
本地：<slug>/<相对路径>
线上：https://oceanz.me/skills/<slug>/<相对路径>
```

例如 `collage-stopmotion-invite/references/timeline.md` ↔ `https://oceanz.me/skills/collage-stopmotion-invite/references/timeline.md`。
SKILL.md 里用相对路径引用文件，离线（本地目录）和在线（注册表）都能被 Agent 直接消费。

## 发布到注册表

```bash
cd <slug> && zip -r ../<slug>.zip . -x '*/__pycache__/*' '.DS_Store'
curl -X PUT --data-binary @../<slug>.zip \
  -H 'Content-Type: application/zip' \
  "https://oceanz.me/skills/<slug>?token=<TOKEN>"
```

`<TOKEN>` 为注册表发布令牌，切勿提交到仓库。

## Skills 列表

| slug | 说明 |
|---|---|
| `zh-ai-tool-viral-post` | 中文 AI 工具种草爆款推文写作风格（X / 小红书 / 即刻短帖）；`references/source-analysis.md` 为公开 X 账号的风格分析 |
| `collage-stopmotion-invite` | 拼贴风定格动画（婚礼请柬类）视频风格：素材约束 + 逐帧锁定的节奏与风格规范，供 Opus 5.5 写代码生成视频 |

## 注意

`collage-stopmotion-invite/assets/slot_layout.jpg` 含参考视频的截帧，仅供私人学习研究，请勿公开分发。仓库不包含参考视频原片及其他第三方版权素材。
