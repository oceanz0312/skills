---
name: collage-sticker-doodle
description: 通用"贴纸涂鸦拼贴定格"竖屏短视频生成器（HTML Canvas + Playwright + FFmpeg）。真人抠图白边贴纸 + 撕纸大色块 + 风景照拼贴 + 手写深墨字 + 程序化贴纸/涂鸦，按 BGM 节拍定格抖动、A/B 两位闪切。结构（时长、场景数、顺序）由 BGM 长度/节拍和素材数量推导，5 个风格包（手账 scrapbook / 杂志剪报 magazine / 复古海报 retro-poster / 街头涂鸦 graffiti / 胶片小志 zine）× 5 个主题（旅行、纪念日、生日、个人 vlog、婚礼），开场/结尾/转场/闪法/boil 步长都由 seed 抽取，10 条片子不会像同一个模板。用户说"做个拼贴/贴纸/涂鸦/手账风/杂志拼贴/定格动画的旅行 vlog、纪念日、生日视频""把照片做成贴纸卡点视频""换个风格多做几版"时用。只要逐帧复刻那条 38 秒婚礼请柬参考片（固定 10 场景、TV 开场、色卡结尾）时，用 collage-stopmotion-invite，不用这个。
---

# 贴纸涂鸦拼贴定格 · 通用生成器（collage-sticker-doodle v1）

从 collage-stopmotion-invite v8 泛化而来：**手艺不变（定格 boil、白边抠图、撕纸、深墨手写、全部 P0），版式放开**。一次渲染 = 一个 manifest（素材 + 主题 + 风格包）+ 一首 BGM + 一个 seed；同 seed 逐像素复现，换 seed 换结构。

## ⛔ P0 硬规则（风格包、主题、seed 都不许破坏；逐帧审计，违反即 FAIL）
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

## 什么是随机的（详见 references/randomness.md）
| 维度 | 由什么决定 | 选项 |
|---|---|---|
| 时长 | `bgm.duration_sec`（≤ BGM 长度、≤ `max_sec`） | 任意，帧数 = 秒 × 30 |
| 节拍网格 | `bgm.T`（帧/拍）+ `offset_frames`；所有事件都落在拍点 | — |
| 场景数 / 顺序 | 可用拍数 ÷ 各场景长度，素材数量决定有几个风景场景 | 开场 4–6 拍、结尾 8–13 拍、中间每场 5–12 拍 |
| 场景类型 | 素材 + seed | place（风景+人+一句话）、solo（人+大字）、note（中文手写信笺）、list（清单卡+人）、ransom（剪字标题+人） |
| 开场 | 风格包允许列表 | tv（需要电视素材）、badge 圆徽章、ransom 剪字、polaroid 拍立得 |
| 结尾 | 风格包允许列表 | card 信息卡+名牌、wall 贴纸墙、stamp 盖章、filmstrip 胶片条 |
| 转场 | 风格包允许列表，每场景抽一次 | pan 步进摇（3 拍）、cut 硬切、tear 撕纸揭开（3 拍）、stamp 盖章落下（2 拍） |
| 闪法 | 有 A/B 对时 ab / ab2 / stutter，单张 jump | ab 每拍切、ab2 每 2 拍、stutter 切 3 拍停 2 拍、jump 每 2 拍跳 |
| boil 步长 | 风格包 | 1 拍或 ½ 拍（3 态循环） |
| 色板 | 风格包色板池，每场景抽一套，相邻不重复 | 主色 + 强调色 + 卡纸色 |
| 贴纸/涂鸦 | 风格包贴纸集 × 密度 | 见 references/elements.md（全部程序化生成，无版权素材） |

## 文件地图
| 什么时候读 | 文件 |
|---|---|
| 写 manifest、准备素材 | `references/manifest.md`（字段、素材约束、A/B 对的要求） |
| 选风格包 / 理解每个包长什么样 | `references/style_packs.md` |
| 加贴纸或涂鸦种类 | `references/elements.md` |
| 结构、转场、闪法、seed | `references/randomness.md` |
| 主题文案 | `references/copywriting.md`（模板在 `scripts/render_template/themes.js`） |
| 色块、撕纸、照片遮罩 | `references/background_collage.md` |
| 手艺 DNA（必须保留的签名） | `references/signature.md` |
| 渲染 | `scripts/render_template/`：`collage.js`（计划 + 场景 + 审计）、`packs.js`、`themes.js`、`index.html`、`run.py` |
| 工具 | `scripts/cutout.py` 抠图（自动跑 P0-6）、`scripts/person_check.py`、`scripts/tv_screen.py`、`scripts/validate_manifest.py`、`scripts/qa_compare.py` |

## 工作流程
1. **问清楚**（一次最多 3 个问题）：主题（旅行/纪念日/生日/vlog/婚礼）、想要的风格包（不确定就按主题推荐：旅行→magazine/zine，纪念日→scrapbook/graffiti，生日→retro-poster/graffiti，vlog→zine/scrapbook）、BGM（没有就问能否用免版权曲）。名字、日期、地点可选。
2. **抠图（P0-6 源图侧）**：`python scripts/cutout.py in.jpg cut/<name>.png [--expect 2]`。A/B 对命名 `<name>_A` / `<name>_B`（同一机位、站位明显不同）。cutout.py 自动换模型重试；仍失败就换素材。
3. **写 manifest**：照 `assets/manifest.example.json`。`places` 每张给 `subject`（地标框，原图比例）和 `ground`（地面线）。`style.pack` / `style.randomness`，`theme`，可选 `copy` 覆盖模板文案。
4. **校验**：`python scripts/validate_manifest.py manifest.json` —— pack/theme、BGM 节拍、风景纵深、P0-6、A/B 同机位、字形覆盖。REJECT 先修。
5. **渲染**：项目根放 `render/`（= render_template + person_check.py）、`fonts/`、`raw/tex/`（crumpled.jpg、kraft.png）。
   `python render/run.py all frames --seed N --manifest manifest.json --meta meta.json --person-check --person-sheet person_check.jpg`
   日志第一行打印 plan（场景/转场/闪法/拍数）。退出码：2 字形缺失、3 P0 违规、4 P0-6 失败。
   `ffmpeg -framerate 30 -i frames/%05d.png -i bgm.mp3 -t <dur> -c:v libx264 -pix_fmt yuv420p -crf 18 -shortest out.mp4`
6. **QA（交付前必做）**：`python scripts/qa_compare.py out.mp4 --meta meta.json --T <meta.plan.boilT> --sheet qa_sheet.jpg --json qa.json [--extra other.mp4]`。P0-1…P0-7、字形任何一项失败 → 退出码 1，不能交付。再看一眼 person_check 拼图和 qa_sheet。
7. **多版本**：同一 manifest 换 seed / 换 pack 出几版给用户挑；报告里写 seed + plan 摘要。

## 不变的手艺（签名）
定格 boil（两拍之间完全静止、3 态循环）｜摇镜步进不缓动｜白边抠图贴纸 + 轻投影｜撕纸边露白色纸纤维｜每场景一主色一强调色｜一场景一句话（大字细笔画手写英文）｜中文全部深墨钢笔效果（每字粗细/深浅/角度/基线抖动）｜人物脚踩地面线 + 接触阴影｜只用手写体，不用粗体展示字｜不用叠化、发光、平滑缓动。

## 字体（项目 `fonts/`，全部 OFL）
英文：ReenieBeanie、NothingYouCouldDo、HomemadeApple、Caveat、DancingScript、Kalam。中文：MaShanZheng（scrapbook）、ZCOOLKuaiLe-Regular（magazine / graffiti）、ZhiMangXing-Regular（retro-poster）、LongCang-Regular（zine）。

## 已知限制
- 测试素材里的 A/B 对不是同机位拍的，validator 会 REJECT A/B 同机位（渲染不受影响，但真实交付请用同组拍摄的对）。
- 素材少于场景数时会复用（每个风景一场，人物轮换）；风景 <2 张时以 solo/note/list 场景为主。
- tv 开场需要 `props.tv`（抠好的电视 PNG + `tv_screen.py` 输出的屏幕 json）。
