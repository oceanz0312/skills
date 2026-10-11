---
name: match-cut-discovery-montage
description: 做"弧线地平线匹配剪辑 · 发现蒙太奇"风格的品牌/产品发布短片（约 20 秒，16:9，25fps）：黑底上一道居中的凸弧（大气层边缘、星球、气泡、叶片、陶器、古画、蓝图、细胞切片、岩石、羽毛……）在 30+ 个镜头间不断"形状匹配"硬切，镜头越切越快（0.6s→0.24s），衬线白字在弧线上方逐词出现（如 "There's / more to / discover"），最后收在产品名 + 品牌标志、并回到开场那道大气层弧线首尾呼应。节奏已从参考片逐帧量好并锁定，用户只换素材、文案和品牌。只要用户提到 match cut、匹配剪辑、形状转场、地平线弧线转场、发现/探索主题蒙太奇、Opus 5.5 那种发布片、Anthropic/Claude 风格模型发布短片、AI 模型发布预告、快剪素材拼贴、越剪越快的卡点、"there's more to discover"类品牌片，即使没说"skill"，也要用这个 skill。不要用于：真人口播、产品 UI 演示、纯动画信息图、手账拼贴定格（用 collage-stopmotion-invite）。
---

# 弧线匹配剪辑 · 发现蒙太奇 · 视频生成器（match-cut-discovery-montage v1）

由 video-style-distill 蒸馏自一条 20.02s / 1280×720 / 25fps 的 AI 模型发布短片（35 镜 / 34 硬切）。只沉淀节奏、构图、调色、字体、剪辑语法；**不含参考片任何画面、标志或字体**，素材和品牌由用户提供。
一次渲染 = 素材（clips/ + BGM）+ 故事板 plan.json（prep.py 从 EDL 生成，agent 可改文案/品牌）+ seed（只影响颗粒）。同 plan 同 seed 逐像素复现。

**能力边界（先告诉用户）**：这是实拍/素材蒙太奇风格，按 video-style-distill 的 limits，只能蒸馏剪辑节奏和包装（弧线构图规则、切点表、字幕、调色、片尾）；画面本身要用户提供或自拍，渲染器不生成素材（片尾光弧除外，是程序化的）。

## ⛔ P0 硬规则（审计 + QA，违反即 FAIL）
| 规则 | 内容 | 怎么保证 |
|---|---|---|
| P0-1 弧线连续 | 每镜一道横向居中、向上凸的弧，弧顶 x≈0.5、y 0.38–0.58（目标 0.48）；相邻镜头弧顶 y 差 ≤0.08 | arc_match.py 测弧 + prep 平移到 0.48；qa.py `P0-1`：合格率 ≥0.65、中位 0.42–0.54、相邻跳变 P90 ≤0.10（参考片 0.74 / 0.485 / 0.04） |
| P0-2 只用硬切 | 镜头间 0 帧转场；唯一运动转场是片尾镜头内上摇 | 渲染器每 scene 直接换素材，无混合代码 |
| P0-3 锁定节奏 | 35 镜帧表 ±1 帧（assets/lock.json），只许整体线性伸缩 ±10% | validate_plan.py REJECT；qa.py `P0-3`：命中 ≥33/34、偏差 ≤2 帧、多余强切 ≤2 |
| P0-4 字在弧上 | 字在弧线上方干净区、水平居中，底边距弧顶 ≥2% 画高；跨镜位置字号不变 | style.js styleAudit 逐帧检查 → run.py 退出码 3；engine 文字重叠/越界审计 |
| P0-5 三个词组 | 文案 3 个词组，各占镜 14–17 / 18–22 / 23–34，逐组替换不累加，最后一组最大 | validate_plan.py |
| P0-6 首尾呼应 | 首镜与片尾都是大气层式光弧；片尾 产品名 → 品牌 → 上摇露出暖橙光带，停在光带上（不黑场） | style.js endcard；qa.py `P0-6` 末帧亮度 ≥25 |
| P0-7 相邻换色 | 相邻镜头弧下主色 RGB 距离 ≥90 或上方明暗反转（否则硬切读不出来，测试片实测同色相邻 scdet 只有 0.13–0.25） | arc_match.py --order 排序代价；qa.py 切点命中率间接检查 |
| P0-8 版权 | 只用用户自有/授权/公共领域素材；不得用参考片画面、他人标志或未授权字体 | manifest 每条 license，人工确认 |

## 🔒 硬锁（节奏）
- 逐镜帧数：31,52,11,6,6,13,15,13,14,15,13,14,15,18,8,11,12,8,10,8,8,11,7,6,8,8,7,8,6,7,7,7,6,5,106（共 500 帧）。
- 加速曲线 5 段：引子 → 加速切入 → 13–15 帧稳拍 → 词组段 8–12 帧 → 5–8 帧冲刺 → 4.24s 片尾。
- 字幕切点 = 镜头切点 f218 / f267 / f312；片尾 f394。
- 换 BGM：本风格不卡拍（参考切点到拍中位 97ms），只按 4s 入拍、15.8s 高点整体伸缩 0.9–1.1。

## 🎚 可调默认
| 维度 | 默认 | 容差 |
|---|---|---|
| 画幅 | 1280×720（可 1920×1080） | 16:9 固定 |
| 文字基线 | 0.40 画高 | 0.36–0.44 |
| 字号（画高比） | 0.030 / 0.035 / 0.060 | ±15% |
| 字色 | #F2EEE6 | 暖白 |
| 颗粒 | 0.05 | 0.03–0.08 |
| 调色 | S 曲线 + 黑位 0.03 | 可换 LUT，但全片统一 |

## 谁决定什么
| 维度 | 故事板（agent） | seed |
|---|---|---|
| 素材选择/顺序 | arc_match 自动排，agent 复核调换 | — |
| 文案 3 词组、产品名、品牌、logo | ✔ | — |
| 颗粒 | — | ✔ |

## 文件地图
| 什么时候读 | 文件 |
|---|---|
| 排镜头、对节奏 | `references/timeline.md`、`references/reference_shots.csv`、`assets/lock.json` |
| 风格总解析（测量 + 解读） | `references/style_analysis.md` |
| 像不像原作 | `references/signature.md`、`references/look.md` |
| 找素材、做匹配 | `references/shot_matching.md` |
| 文字、片尾、音乐 | `references/typography.md`、`references/endcard.md`、`references/audio.md` |
| 工具 | `scripts/arc_match.py` 测弧+排序、`scripts/prep.py` EDL→素材帧+plan、`scripts/validate_plan.py`、`scripts/render/`（engine.js 底座 + style.js 风格 + run.py）、`scripts/qa.py`；拆解器 `analyze_video.py / audio_beat.py / palette.py / contact_sheet.py`（同 video-style-distill） |

## 工作流程
1. 收素材：40–60 段（视频或图），按 shot_matching.md 四类凑齐，写授权。
2. `python scripts/arc_match.py clips/ --out arcs.json` → `python scripts/arc_match.py --order arcs.json --edl assets/edl.template.json --out edl.json`（片尾槽位留空 = 程序化光弧；也可填用户自己的大气层素材）。
3. 把 `scripts/render/` 复制到项目 `render/`，`python scripts/prep.py edl.json --render render --words ... --product ... --brand ... [--logo logo.png] --font serif.ttf`。
4. `python scripts/validate_plan.py render/plan.json --lock assets/lock.json`（REJECT 先改）。
5. `python render/run.py render/plan.json frames --seed N --meta meta.json --mp4 out.mp4 --bgm bgm.wav`（P0 违规退出码 3）。
6. `python scripts/qa.py out.mp4 --T 0.04 --stopmotion 0 --no-grid --meta meta.json --ref-analysis <参考 analysis.json> --allow-diff scene_count,pose_swap_scenes,hard_cut_sec --out qa/`（失败退出码 1），再自己看 `qa/qa_sheet.jpg` 和每镜中间帧，对照 signature.md。
7. 交付 mp4 + 拼图 + qa.json + 素材授权清单。

## 签名｜反模式 → references/signature.md

## 字体（需可商用 / OFL）
Source Serif 4、Newsreader、Noto Serif、Fraunces（低 SOFT）；中文思源宋体 SemiBold。

## 已知限制
- video-style-distill 的拆解器把这类"构图不变的硬切"读成 2 个场景 + 30 步分拍转场，T 网格无意义；所以 QA 关掉网格检查（--no-grid），结构对比里 scene_count / pose_swap_scenes / hard_cut_sec（拆解器口径）用 --allow-diff，节奏改用逐镜切点命中判定。
- arc 检测是启发式，线稿/网格/高亮纹理会误检，以统计量为准并人工看拼图。
- 不生成画面素材；音乐未试听，只给可测量的数字。
