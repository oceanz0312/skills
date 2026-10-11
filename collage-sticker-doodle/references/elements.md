# 元素库（全部程序化生成，collage.js；带标签，故事板按名字或标签选）

`python scripts/validate_plan.py --list-elements` 打印 名字 → 标签。表在 collage.js 的 `ELEMENTS`（贴纸）和 `DOODLES`（笔画）。

v2 新增贴纸：balloon、cake、ticket、ring、paw、umbrella、raindrop、cloud、moon、camera、coffee、leaf、gift、note（音符）、fish、house、postage（邮票）、cap（学士帽）、envelope、bone、plane、yarn；新增笔画 rainlines。

**贴纸**（`stickerShape` + `drawSticker`，白色模切边 + 轻投影，可带手写小标签）：
star、burst（爆炸星）、sparkle（四角闪光）、heart、flower、smiley、sun、dots（网点圆）、spiral、check、asterisk、bolt（闪电）、crown、bubble（对话框，带标签）、tag（价签，带标签）、tape / washi（半透明胶带 / 条纹和纸）、arrowSticker。

**涂鸦笔画**（`drawDoodleStroke`，无白边，墨色或强调色，6–10px 圆头）：
arrow（弧线箭头）、zigzag、underline、circleMark（圈注）、scribble（乱圈）、rays（放射线）、spray（喷漆雾点）、crownMark、hearts。

**纹理**（`procTex`，seed 固定）：newsprint、halftone、concrete、photocopy；scrapbook 用 raw/tex/crumpled.jpg。

**大件**：撕纸大色块（diag / side / arch）、不规则照片遮罩（skyline / torn / arch / circle / heart / blob）、信息卡（piece，torn 边 + 纸纹）、圆徽章、盖章、拍立得、胶片条、名牌、剪字标题（ransom）。

## 放置规则
- 贴纸/涂鸦都登记为 `doodle` 类，用拒绝采样放在空处：不碰任何文字/信息（留 14px），可以部分藏在人物后面（人物在最上层，所以不会盖人），不碰画面边（P0-1）。放不下就丢掉，不硬塞。
- 每场景数量 = 风格包 `density`（wall 结尾 +3，note 场景 ≤2）。

## 加一种贴纸
在 `stickerShape` 里加路径（以 0,0 为中心，尺寸 S），需要内部图案就在 `drawSticker` 里加，在 `ELEMENTS` 里登记名字和标签（标签用英文小写、具体的语义词），需要的话再写进某个包的 `stickers`（随机填充用）。登记框是 ±0.66S，形状不要超过它。
