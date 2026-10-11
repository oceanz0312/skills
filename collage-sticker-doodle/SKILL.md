---
name: collage-sticker-doodle
description: 通用"贴纸涂鸦拼贴定格"竖屏短视频生成器（HTML Canvas + Playwright + FFmpeg）。真人抠图白边贴纸 + 撕纸大色块 + 风景照拼贴 + 手写深墨字 + 程序化贴纸/涂鸦，按 BGM 节拍定格抖动、A/B 两位闪切。没有预设主题：agent 读用户的描述和素材，写一份故事板 plan.json（场合、情绪、风格包、色彩倾向、每场用什么素材、写什么字、贴什么贴纸、怎么转场和闪），校验后渲染，seed 只随机故事板没定的细节；5 个风格包（手账 / 杂志剪报 / 复古海报 / 街头涂鸦 / 胶片小志），带标签的程序化元素库（气球、蛋糕、票根、戒指、爪印、雨伞、雨滴、学士帽……）。用户说"把这些照片做成拼贴/贴纸/涂鸦/手账风/杂志拼贴/定格卡点视频"，任何场合（旅行、毕业、宠物、生日、纪念日、日常 vlog、雨天散步……）都用它。只要逐帧复刻那条 38 秒婚礼请柬参考片（固定 10 场景、TV 开场、色卡结尾）时，用 collage-stopmotion-invite。
---

# 贴纸涂鸦拼贴定格 · 通用生成器（collage-sticker-doodle v2）

从 collage-stopmotion-invite v8 泛化而来：**手艺不变（定格 boil、白边抠图、撕纸、深墨手写、全部 P0），版式放开**。一次渲染 = manifest（素材 + BGM）+ **故事板 plan.json（agent 根据用户描述写）** + seed。v2 去掉了预设主题：结构、文案、贴纸由故事板决定，seed 只填细节；同故事板同 seed 逐像素复现。

## ⛔ P0 硬规则（故事板、风格包、seed 都不许破坏；逐帧审计，违反即 FAIL）
| 规则 | 内容 | 怎么保证 |
|---|---|---|
| **P0-1 不越界** | 贴纸、涂鸦、文字、卡片、名牌、道具每一帧（含跳动、boil 抖动）都完整在画内。唯一例外：人物脚/腿可被**底边**裁掉。 | 版式随机后审计，越界就重掷（≤40 次） |
| **P0-2 恰好两个人物位置** | 有人的场景只有 A、B 两位，严格 A→B→A→B 交替（任何闪法都只是改"哪些拍子切"，不加位置）。 | `placePeople` 只生成 2 个位置；qa 查位置数 + 交替 |
| **P0-3 层级** | 底纸 → 大撕纸色块 → 风景照 → 信息卡 → 文字 → 贴纸/涂鸦 → **人物**。地标居中、轮廓完整，文字/贴纸压地标 ≤2%。 | 绘制顺序写死；审计主体框 |
| **P0-4 大色块** | 每帧 ≤3 层色块，每层画内面积 ≥18%，只在最底层。 | `makeSheets` 只出 1–2 张大撕纸 + 底纸 |
| **P0-5 信息不被盖** | 文字、名牌、清单、信笺不被色块盖、彼此不重叠、人物不压文字。 | 审计 + 贴纸放置拒绝采样 |
| **P0-6 人物完整** | 不许缺躯干/肢体、漂浮碎片、左/右/上边被裁。抠图侧 + 成片侧各查一次。 | `cutout.py` → `person_check.py`；`run.py --person-check` |
| **P0-7 人物零遮挡** | 人物贴纸任一像素都不许被任何东西盖（含转场）。 | 人物最后画；撕纸/盖章转场期间两边都不画人物，落地后人物才出现；逐帧像素比对（被盖 >0 px 即 FAIL） |

**随机只在 P0 之内**：seed 改结构、风格细节、贴纸种类和位置，但每个场景随机后都要过审计，不过就重掷；40 次都不过 → 退出码 3。

## 谁决定什么
| 维度 | 故事板（agent 写） | seed（只在故事板没写时） |
|---|---|---|
| 场合 / 情绪 | `occasion` `mood`（自由文本） | — |
| 风格包、色彩倾向、boil | `pack` `palette_bias` `boil` | 包内抽色板（相邻不重复）、boil 步长 |
| 结构 | 场景类型 + 顺序（place / solo / note / list / ransom）、开场/结尾版式、可选拍数 | 拍数；BGM 太短时压缩 / 丢末尾场景 |
| 素材 | 每场用哪张风景、哪个人（或 auto / null） | auto 轮换 |
| 文字 | 全部由 agent 根据 prompt 写，用户原话一字不改 | — |
| 贴纸 | 元素名或标签（`balloon`、`rain`） | 标签→具体元素、颜色、大小、位置；没写就用包的随机集 |
| 转场 / 闪法 | `transition`（cut / stamp / pan-dir / tear-dir）、`flash`（ab / ab2 / stutter / jump） | 没写就按包抽 |
| 版式细节 | — | 撕纸、遮罩、角度、字体抽选、贴纸位置、A/B 左右方向 |
节拍网格、P0、QA 与 v1 完全相同。详见 references/storyboard.md 与 references/randomness.md。

## 文件地图
| 什么时候读 | 文件 |
|---|---|
| 写 manifest、准备素材 | `references/manifest.md`（字段、素材约束、A/B 对的要求） |
| 选风格包 / 理解每个包长什么样 | `references/style_packs.md` |
| 加贴纸或涂鸦种类 | `references/elements.md` |
| 结构、转场、闪法、seed | `references/randomness.md` |
| **写故事板（每次必读）** | `references/storyboard.md`（schema、写作指南、两个示例 → `assets/plan.example.*.json`） |
| 色块、撕纸、照片遮罩 | `references/background_collage.md` |
| 手艺 DNA（必须保留的签名） | `references/signature.md` |
| 渲染 | `scripts/render_template/`：`collage.js`（计划 + 场景 + 审计）、`packs.js`、`index.html`、`run.py` |
| 工具 | `scripts/cutout.py` 抠图（自动跑 P0-6）、`scripts/person_check.py`、`scripts/tv_screen.py`、`scripts/validate_manifest.py`（素材）、`scripts/validate_plan.py`（故事板 + 元素库列表）、`scripts/qa_compare.py` |

## 工作流程：读 prompt/素材 → 写故事板 → 校验 → 渲染 → QA
1. **读**：用户的描述（场合、情绪、指定的风格或文案）+ 素材（每张风景是哪里、每组人物什么姿态、有没有 A/B 对）+ BGM 长度。缺关键信息才问（一次 ≤3 个）。
2. **抠图（P0-6 源图侧）**：`python scripts/cutout.py in.jpg cut/<name>.png [--expect 2]`；A/B 对命名 `<name>_A` / `<name>_B`。失败换素材。
3. **manifest**：照 `assets/manifest.example.json` 写素材清单（places 的 `subject` 地标框、`ground` 地面线；people 的 A/B 与 src；bgm 的 T / offset / duration_sec）。`python scripts/validate_manifest.py manifest.json`。
4. **写故事板**：按 `references/storyboard.md` 的指南写 `plan.json`（先给用户看一眼场景列表和文案更好）。`python scripts/validate_plan.py plan.json manifest.json`（schema、引用、贴纸名/标签、拍数、字形）。REJECT 先改。
5. **渲染**：项目根放 `render/`（= render_template + person_check.py）、`fonts/`、`raw/tex/`。
   `python render/run.py all frames --seed N --manifest manifest.json --plan plan.json --meta meta.json --person-check --person-sheet person_check.jpg`
   日志打印实际 plan（含 warnings：降级的闪法、被丢的场景）。退出码：2 字形缺失、3 P0 违规、4 P0-6 失败。
   `ffmpeg -framerate 30 -i frames/%05d.png -i bgm.mp3 -t <dur> -c:v libx264 -pix_fmt yuv420p -crf 18 -shortest out.mp4`
6. **QA（交付前必做）**：`python scripts/qa_compare.py out.mp4 --meta meta.json --T <meta.plan.boilT> --sheet qa_sheet.jpg --json qa.json`。P0-1…P0-7、字形任何一项失败 → 退出码 1。看一眼 qa_sheet 和 person_check 拼图。
7. **迭代**：不满意改故事板（换场景顺序、文案、贴纸、转场），seed 只用来换细节。交付时附 plan.json + seed。

## 不变的手艺（签名）
定格 boil（两拍之间完全静止、3 态循环）｜摇镜步进不缓动｜白边抠图贴纸 + 轻投影｜撕纸边露白色纸纤维｜每场景一主色一强调色｜一场景一句话（大字细笔画手写英文）｜中文全部深墨钢笔效果（每字粗细/深浅/角度/基线抖动）｜人物脚踩地面线 + 接触阴影｜只用手写体，不用粗体展示字｜不用叠化、发光、平滑缓动。

## 字体（项目 `fonts/`，全部 OFL）
英文：ReenieBeanie、NothingYouCouldDo、HomemadeApple、Caveat、DancingScript、Kalam。中文：MaShanZheng（scrapbook）、ZCOOLKuaiLe-Regular（magazine / graffiti）、ZhiMangXing-Regular（retro-poster）、LongCang-Regular（zine）。

## 已知限制
- 测试素材里的 A/B 对不是同机位拍的，validator 会 REJECT A/B 同机位（渲染不受影响，但真实交付请用同组拍摄的对）。
- 素材少于场景数时会复用（每个风景一场，人物轮换）；风景 <2 张时以 solo/note/list 场景为主。
- tv 开场需要 `props.tv`（抠好的电视 PNG + `tv_screen.py` 输出的屏幕 json）。
