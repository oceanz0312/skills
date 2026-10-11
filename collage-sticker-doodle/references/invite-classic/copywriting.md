# 文案生成指南（替换时保持同一种"声音"）
- **英文情话 S4–S8（5 句）**：只从公版古典文学、名人情书里选，或者仿写同语气。每句 ≤30 字符/行、≤3 行，按语义断行（S8 那种三行阶梯式"Ever X / Ever Y / Ever Z"可以保留）。
  - 推荐池：*Love in summer bloom*（化用）；*Haply I think on thee*（Sonnet 29）；*Journeys end in lovers meeting*（Twelfth Night）；*Love looks not with the eyes, but with the mind*（Midsummer，原片截成 *Love looks with mind*）；*Ever thine, ever mine, ever ours*（Beethoven）；*Shall I compare thee to a summer's day*（Sonnet 18）；*Whatever our souls are made of, his and mine are the same*（Brontë）；*I have loved the stars too fondly to be fearful of the night*；*You are my sun, my moon, and all my stars*（cummings 化用）；*Grow old along with me, the best is yet to be*（Browning）。
  - 和场景搭配：山 / 自然配季节、花；城市夜景配"想念"；街道建筑配"相遇"；地标配"心、眼"；海配"永恒、我们"。
- **中文信笺 S3**：第一人称复数（我们），称呼"亲爱的家人与挚友"，结构是 宣告 → 感谢 → 邀请 → 署名式结尾（"纸短情长，静候佳期"）。10–13 行，每行 ≤14 字，口语、温暖，不用网络梗。
- **流程卡 S9**：标题 + ≤4 行"时:分 事项"。
- **结束卡 S10**：婚礼日期 / 婚礼地点 / 厅名 + 一句英文 "See you at the wedding"（可以换成 "Save the date"）+ 两个名字标签（{新郎名拼音大写}/{新娘名拼音大写}）。
- **标题 S2**：≤3 个英文词、≤16 字母，全大写（WE GOT MARRIED / SAVE THE DATE / WE SAID YES）。
- 片头：`WEDDING INVITATION` + `{新郎名拼音} & {新娘名拼音}`。


## v5 字体（只用手写体）
- 英文情话 / 标题 / 名字：Reenie Beanie、Nothing You Could Do、Homemade Apple、Caveat、Dancing Script（OFL/Apache，Google Fonts）。大字号、细笔画。
- 勒索信标题：剪纸底块 + 手写字形（Caveat 500 / Dancing Script 500 / Kalam）。
- 中文：全部用马善政 Ma Shan Zheng（正文、流程、日期地点、流程标题、厅名），配 v8 钢笔墨迹渲染（近黑、加粗、轻压感、逐字抖动）。站酷快乐体不再使用（偏卡通展示体）。
- 文案每场景 1 句话（可以换行成 2–3 行）；写太长会被缩到最小字号 118×系数，仍放不下就重掷/失败。
- 校验：validate 用 fontTools 查 cmap；渲染后 `assertGlyphs()` 再按实际绘制过的字符查一遍。
