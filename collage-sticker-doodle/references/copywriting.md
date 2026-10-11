# 文案

模板在 `scripts/render_template/themes.js`，每个主题：`title`（开场标题候选）、`headline`（剪字标题）、`quotes`（英文一句话，≥10 条）、`note_zh`（中文信笺 5–7 行，每行 ≤14 字）、`list_title` + `list`（清单 3 行）、`closing`（结尾英文）、`end`（盖章字）、`tags`（名牌，{a}{b}）。
`{a}` `{b}` `{date}` `{place}` 从 manifest.names / info 替换；manifest.copy 可覆盖任一字段。

## 规则
- 英文一句话 ≤30 字符，大字细笔画手写体；不写长段落。
- 中文只放在信笺、清单、结尾信息卡里，全部走深墨钢笔效果；每行 ≤14 字。
- 不用 emoji、不用特殊符号（☐ ♥ 等手写字体里多半没有，会被字形检查打回）。
- 给用户先过目文案再渲染（尤其婚礼、纪念日的称呼和日期）。
