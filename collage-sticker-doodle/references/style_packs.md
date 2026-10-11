# 风格包（scripts/render_template/packs.js）

> 另有锁定包 **invite-classic**（不在 packs.js 里，走 `render_template/invite/` 的 v8 渲染器）：结构和参数全部固定，见 references/invite-classic/README.md。

每个包只改装饰：色板池、纹理、颗粒、英文/中文字体、剪字字体、贴纸集、涂鸦集、贴纸边、密度、允许的开场/结尾/转场/闪法/boil 步长、照片遮罩池、照片调色。P0 几何从不受影响。

| 包 | 感觉 | 色板 | 纹理 | 中文 | 英文 | 贴纸 / 涂鸦 | 开场 / 结尾 | 转场 | 闪法 / boil |
|---|---|---|---|---|---|---|---|---|---|
| **scrapbook** 手账 | 暖、软、日记感 | 粉橙绿奶油 | 皱纸 | 马善政 | Reenie / Caveat / Homemade / Nothing | 心、星、花、胶带、和纸、笑脸、价签 / 圈圈、箭头、锯齿 | tv·badge·ransom·polaroid / card·wall | pan 为主，cut、tear | ab·jump·ab2 / 1 拍 |
| **magazine** 杂志剪报 | 硬朗、对比强 | 红、黑、白、海军蓝、柠檬黄 | 新闻纸（横纹 + 灰条） | 站酷快乐体 | Kalam / Caveat / Dancing | 价签、对话框、箭头贴、星、网点、勾、星号、爆炸 / 箭头、下划线、圈注 | ransom·polaroid / stamp·filmstrip | cut 为主，stamp、pan | ab·stutter / 1 或 ½ 拍 |
| **retro-poster** 复古海报 | 70s 海报 | 芥末黄、青绿、砖橙、深青 | 半调网点 | 志莽行书 | Dancing / Homemade / Caveat | 太阳、星、皇冠、网点、闪电、爆炸 / 放射线、锯齿 | badge·tv / stamp·card | pan、stamp | jump·ab2 / 1 拍 |
| **graffiti** 街头涂鸦 | 水泥墙 + 荧光 | 水泥灰 + 荧光绿/粉/青/橙 | 水泥（裂纹、斑点） | 站酷快乐体 | Kalam / Caveat / Reenie | 闪电、星、皇冠、星号、笑脸、螺旋、对话框 / 喷漆雾点、锯齿、皇冠线 | ransom·badge / wall·stamp | cut、tear、stamp | stutter·ab·jump / ½ 或 1 拍 |
| **zine** 胶片小志 | 复印机、黑白 + 一个专色 | 米白 + 荧光粉 / 钴蓝 | 复印碳粉噪点 | 庞门正道龙苍 Long Cang | Nothing / Reenie / Homemade | 胶带、星号、勾、网点、箭头贴、螺旋 / 下划线、圈注、箭头 | polaroid·ransom / filmstrip·card | cut、tear、pan | ab2·jump·stutter / 1 或 ½ 拍；照片黑白高反差 |

## 加一个新包
复制一个条目，改字段即可；中文字体必须是手写风且 OFL/可商用，先用 fontTools 验字形（validator 的 FONT_FILES 里登记文件名）。`density` 是每场景贴纸数 [min,max]；不要超过 4，否则 P0-5 重掷会变多、画面也变"牛皮癣"。
