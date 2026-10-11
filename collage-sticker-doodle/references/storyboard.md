# 故事板 plan.json（agent 写，validate_plan.py 校验，run.py --plan 读取）

故事板决定**发生什么**：场合、情绪、风格包、色彩倾向、场景顺序、每场用哪张照片/哪个人、写什么字、贴哪些贴纸、怎么转场、怎么闪。
seed 只填故事板没写的细节（版式位置、撕边、角度、字体抽选、没指定的转场/闪法/贴纸、色板在倾向范围里的抽选）。

## Schema
```jsonc
{
 "prompt": "用户原话（留档）",
 "occasion": "自由文本：场合",            // 必填，例如 "猫咪到家一周年"
 "mood": "自由文本：情绪/节奏",           // 必填，例如 "cozy, funny, warm"
 "pack": "scrapbook|magazine|retro-poster|graffiti|zine",   // 用户指定优先，否则按 mood 选（见下）
 "palette_bias": ["#RRGGBB", ...],       // 可选：把包里最接近这些颜色的一半色板留下来抽
 "boil": 1 | 0.5,                        // 可选：定格抖动步长（拍）；不写由包抽
 "intro":  {"layout": "tv|badge|ransom|polaroid", "title": "...", "person": "<id>|auto|null", "stickers": [...], "beats": 4-6},
 "scenes": [                             // 顺序即播放顺序
   {"type": "place",  "place": <places 索引>, "person": "<id>|auto|null", "flash": "ab|ab2|stutter|jump", "text": "一句英文 ≤30 字符",
    "stickers": ["名字或标签", ...], "transition": "cut|stamp|pan[-left|right|up|down]|tear[-dir]", "beats": 6-10},
   {"type": "solo",   "person": "...", "text": "...", ...},                 // 人 + 大字，无照片，5-9 拍
   {"type": "note",   "lines": ["中文 ≤14 字/行", ...2-8 行], ...},       // 手写信笺，不放人，8-12 拍
   {"type": "list",   "title": "≤10 字", "items": ["≤14 字", ...2-4 项], "person": "...", ...},   // 清单卡 + 人，8-11 拍
   {"type": "ransom", "text": "剪字标题 ≤16 字符", "person": "...", ...}  // 4-7 拍
 ],
 "outro": {"layout": "card|wall|stamp|filmstrip", "text": "结束语 ≤26 字符", "lines": ["card 上的中文信息行"], "tags": ["名牌"], "stamp": "盖章字",
           "person": "...", "stickers": [...], "transition": "...", "beats": 8-12}
}
```
- `beats` 都可省；渲染器按 BGM 实际拍数伸缩：先把场景压到最短，仍然放不下就从末尾丢场景（写进 meta.plan.warnings），多出的拍子轮流加给各场景、再给结尾（结尾最多 14 拍）；还有剩就**提前收尾裁掉 BGM**（warnings 提示"加场景"）。所以写故事板时按第 3 条估好场景数。
- `person`：写 id 就用它；`"auto"`/省略 = 轮换（place 优先 A/B 对）；`null` = 不放人。`ab/ab2/stutter` 需要 A/B 对，单张自动降级为 jump。
- `stickers`：元素名（`balloon`）或标签（`party`、`rain`）。标签会在匹配的元素里按 seed 抽一个。`python scripts/validate_plan.py --list-elements` 列出全部。省略 = 包的随机贴纸。
- 文字里可以用 `{a}` `{b}` `{date}` `{place}`，从 manifest.names / info 替换。

## 怎么写故事板（plan-writing guidance）
1. **先读 prompt 和素材**：看每张风景是什么地方、每组人物是什么姿态（站/坐/跳/亲密/搞怪）、有几对 A/B。用户给了原话文案就**一字不改**放进去。
2. **定情绪 → 选包和节奏**：
   | 情绪 | 包 | boil | 转场 | 闪法 |
   |---|---|---|---|---|
   | 温暖、可爱、日常 | scrapbook | 1 | pan / cut | ab2 / jump |
   | 热闹、搞怪、炸 | graffiti / magazine | 0.5 | cut / stamp | ab / stutter |
   | 复古、怀旧、阳光 | retro-poster | 1 | pan / stamp | jump / ab2 |
   | 安静、文艺、忧郁、雨天 | zine | 1 | tear / cut | ab2 / jump |
   色彩倾向用 1–2 个能代表情绪的颜色（雨天：灰米 + 钴蓝；毕业：黄 + 红）。
3. **排结构**：开场 1 个（标题 ≤22 字符，说清"这是什么"）→ 中间 4–7 场 → 结尾 1 个。30 秒 ≈ 5 个中间场景，38 秒 ≈ 6，60 秒 ≈ 9–10。每张风景最多用一次；人物轮着用，同一个人不连续出现两场。情绪片少放 note/list（1 个够），热闹片可以多 ransom。
4. **写字**：一场一句，短、口语、和画面有关（"We made it!"，不要"Congratulations on your graduation journey"）。英文句子放 place/solo，中文放 note/list/card。不用 emoji 和特殊符号。
5. **挑贴纸**：每场 1–3 个、语义贴合画面（雨天：umbrella、raindrop、rainlines；毕业：cap、ticket、burst；宠物：paw、fish、yarn）。少即是多，情绪片 1–2 个。
6. **转场有起伏**：同一种转场不连续用 3 次；情绪转折处用 tear/stamp，同一段里用 cut/pan。
7. **校验 → 渲染 → 看 QA 拼图**；不满意改故事板，不要改 seed 硬碰。

## 两个示例
- `assets/plan.example.grad-trip.json` —— "college graduation trip with friends, energetic"：magazine、黄红、boil ½ 拍、ransom 开场 "CLASS OF 2026"、stamp/pan/cut 交替、stutter/ab 闪、贴纸 cap/plane/ticket/balloon、贴纸墙结尾 "Class dismissed!"。
- `assets/plan.example.rainy-walk.json` —— "a quiet rainy-season city walk vlog, melancholy"：zine、灰米+钴蓝、boil 1 拍、拍立得开场 "rainy season"、撕纸转场为主、ab2/jump 慢闪、中文信笺 4 行、贴纸 umbrella/raindrop/rainlines/moon/cloud、胶片条结尾 "until the sun comes back"。
