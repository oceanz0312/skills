# manifest.json 字段与素材约束

```json
{
 "style": {"randomness": "medium"},       // pack 由故事板 plan.json 决定；randomness low|medium|high 只放大装饰幅度
 "bgm": {"file": "assets/bgm.mp3", "T": 12.25, "offset_frames": 3.4, "duration_sec": 38.4, "max_sec": 60},
 "places": [{"file": "assets/x.jpg", "subject": {"u":0.5,"v":0.05,"w":0.4,"h":0.5}, "ground": 0.90}],
 "people": [
   {"id": "p5", "A": "cut/S5_A.png", "B": "cut/S5_B.png",
    "src":  {"photo": "assets/S5_A.jpg", "mask": "cut/S5_A.mask.png", "people_count": 2},
    "srcB": {"photo": "assets/S5_B.jpg", "mask": "cut/S5_B.mask.png"}},
   {"id": "s2", "A": "cut/S2_person.png", "src": {"photo": "assets/S2_person.jpg", "mask": "cut/S2_person.mask.png"}}],
 "props": {"tv": {"file": "cut/props/tv.png", "screen": "cut/props/tv.screen.json"}},   // 可选；有了才可能抽到 tv 开场
 "names": {"a": "Lin", "b": "Zhou"}, "info": {"date": "2026.10.01", "place": "里斯本"}
}
```

文案、场景、贴纸都不在 manifest 里，写在故事板（references/storyboard.md）。
```
```

## 字段说明
- `bgm.T`：一拍多少帧（30fps）。`T = 1800 / BPM`；BPM 太快（>170）用两倍 T。validator 用 librosa 测并提示。`offset_frames` = 第一拍所在帧。
- `duration_sec`：成片长度（≤ BGM 长度）。场景数跟着变：30 s ≈ 8–9 场，38 s ≈ 10–11 场，60 s ≈ 14–16 场（素材不够会复用）。
- `places[].subject`：地标/建筑主体在**原图**里的框（0..1）。渲染时地标居中、完整落在不规则遮罩里（P0-3）。`ground`：地面线在照片片里的高度比例，人物脚踩在这里。
- `people[]`：有 `B` 的是 A/B 对（同机位、两人站位明显不同），会被优先放进风景场景用 ab/ab2/stutter 闪；只有 `A` 的单张用 jump。`src` 指向原照片 + mask，成片 P0-6 检查用它把关键点映射回画面。

## 素材约束
1. **人物**：全身或至少到大腿，四肢在画内，左/右/上不被原图边裁（只允许底边）；cutout.py 的 `.check.json` 必须 pass。
2. **A/B 对**：同一地点同一组拍摄，背景相似（bg_sim ≥0.45），姿势差异明显（IoU ≤0.88）。
3. **风景**：横幅 ≥1.3、有纵深（街道、海岸线、天际线），主体框不贴原图顶边；近景局部会 WARN。
4. **数量**：建议 ≥3 张风景 + ≥2 组人物（其中 ≥1 对 A/B）。
5. **版权**：只用用户自己的照片或 CC0/CC-BY 素材；贴纸、涂鸦、纹理全部是程序化生成的，不需要额外素材。
