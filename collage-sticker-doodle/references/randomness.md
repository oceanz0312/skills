# 随机系统（只在 P0 之内）

所有随机都来自 `seeded(key)` = mulberry32(hash(seed|key))，同 seed 同 manifest 逐像素复现。

## 计划（makePlan，key "plan"）
1. 帧数 = duration_sec × 30；拍点 `BEATS = round(offset + k·T)`。
2. boil 网格：包里抽 1 拍或 ½ 拍。
3. 开场（包的 intros，tv 需要 props.tv）和结尾（outros）各抽一个；开场 4–6 拍（tv 固定 6），结尾 8–13 拍。
4. 中间场景池 = 每张风景一个 place + note + list +（开场不是 ransom 时）ransom + 最多 2 个 solo；随机顺序依次装入剩余拍数（每种有最短/最长拍数），余下的拍数轮流加给各场景，再余下的给结尾。
5. 转场：每场景从包的 transitions 抽；tv 开场之后固定 cut（屏幕推满就是转场）。
6. 人物：A/B 对优先进 place 场景，单张进其它场景，不够就轮换复用。闪法从包的 flash 抽（单张只能 jump）。所有人物事件都在拍点上，落位（转场结束）后 ≥10 帧才开始。
7. 色板：每场景从包色板池抽，相邻不重复。文案：主题模板 + manifest.copy，情话全片不重复（不够才循环）。

## 版式（makeLayout，key "<scene>|layout|<attempt>"）
色块撕法、照片遮罩、地标居中缩放、文字字体/字号/位置/倾斜、卡片尺寸角度、人物 A/B 左右方向和倾斜、贴纸种类/颜色/大小/位置。

## 永不随机
P0 规则、层级、人物 0.50H 基准高度、最小字号（英文 118px×系数、中文 46px）、两位置规则、地标完整、拍点对齐、人物最后画。

## 重掷
每场景随机后：软检查（遮罩覆盖、地标在遮罩内、两位置放得下、字号、文字对比 ≥3:1）→ 贴纸拒绝采样 → 落位帧/首个事件帧 × 3 个 boil 态做完整 P0 审计。任何一项不过就 attempt+1（人物随 attempt 逐级缩小），最多 40 次。

## randomness 档位
low / medium / high 只缩放倾斜、偏移、撕边起伏和额外装饰概率。
