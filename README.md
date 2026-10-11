# skills（源码仓库，私有）

存放 Agent Skills 的原始源码。线上分发由 skills 注册表负责：https://skills.zdychanges.workers.dev/skills

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
线上：https://skills.zdychanges.workers.dev/skills/<slug>/<相对路径>
```

例如 `collage-stopmotion-invite/references/timeline.md` ↔ `https://skills.zdychanges.workers.dev/skills/collage-stopmotion-invite/references/timeline.md`。
SKILL.md 里用相对路径引用文件，离线（本地目录）和在线（注册表）都能被 Agent 直接消费。

## 发布到注册表

```bash
cd <slug> && zip -r ../<slug>.zip . -x '*/__pycache__/*' '.DS_Store'
curl -X PUT --data-binary @../<slug>.zip \
  -H 'Content-Type: application/zip' \
  "https://skills.zdychanges.workers.dev/skills/<slug>?token=<TOKEN>"
```

`<TOKEN>` 为注册表发布令牌，切勿提交到仓库。

## Skills 列表

| slug | 说明 |
|---|---|
| `zh-ai-tool-viral-post` | 中文 AI 工具种草爆款推文写作风格（X / 小红书 / 即刻短帖）；`references/source-analysis.md` 为公开 X 账号的风格分析 |
| `collage-stopmotion-invite` | 拼贴风定格动画（婚礼请柬类）视频风格：素材约束 + 逐帧锁定的节奏与风格规范，供 Opus 5.5 写代码生成视频 |
| `collage-sticker-doodle` | 通用贴纸涂鸦拼贴定格视频生成器（v3）：agent 读描述与素材写故事板 plan.json，5 个可变风格包；另含锁定包 invite-classic（逐帧复刻 collage-stopmotion-invite v8 婚礼请柬）；全部 P0 审计与 QA 共用 |
| `video-style-distill` | 风格蒸馏元 skill：把视频 / 图片 / 设计稿 / 品牌手册 / 设计语言描述蒸馏成可复用的视频生成 skill（测量脚本：切点、视觉网格 T、boil、A/B、转场、对拍、色板、拼图、静态图动效推导；渲染器脚手架、plan 校验器、QA 骨架；产出模板） |

## 注意

`collage-stopmotion-invite/assets/slot_layout.jpg` 含参考视频的截帧，仅供私人学习研究，请勿公开分发。仓库不包含参考视频原片及其他第三方版权素材。
