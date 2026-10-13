---
name: doubao-tts-voiceover
description: >-
  Generate Chinese voiceover / TTS audio (plus optional SRT subtitles) for
  self-media videos with the Volcengine Doubao TTS 2.0 (seed-tts-2.0) API. Use
  when the user wants text turned into natural, expressive narration, wants to
  tune voice tone/speed/pitch, or needs a script polished for spoken delivery.
---
# 豆包语音合成 2.0 自媒体配音

## 前置条件（一次性）
1. 火山引擎控制台 → 豆包语音 → 开通「语音合成 2.0」（按量 ≈0.0003 元/字，或买字数包）。
2. 控制台 → **API Key 管理** → 创建 API Key。
3. 只放环境变量，绝不写进文件/仓库：`export VOLC_TTS_API_KEY=...`
4. `pip install requests`

## 步骤
1. **润色文案为口语**：短句、设问开头、用标点控制停顿；去掉括号、长英文，日期/数字改成好读的说法。
2. **合成**：
   ```bash
   python3 scripts/tts.py "文案" out.mp3 --subtitle out.srt
   python3 scripts/tts.py -f script.txt out.mp3 --subtitle out.srt
   ```
   长文按句子自动分段（≤1000 字/段）后拼接。
3. **检查输出**：试听 mp3；SRT 可直接导入剪辑软件（多段时偏移为估算，必要时用 ffprobe 校正）。
4. **AI 内容标识**：发布时注明「AI 配音」，并按平台要求勾选 AI 生成声明（《人工智能生成合成内容标识办法》）。

## 调音色与语气
脚本默认预设（均可覆盖）：音色 `zh_male_liufei_uranus_bigtts`（刘飞 2.0）、演说博主激情语音指令、`speech_rate 10`、`pitch 2`。
- `--speaker <音色ID>`：换 2.0 官方音色（复刻音色需 `seed-icl-2.0`，见 references）。
- `--instruction "用轻松聊天的语气……"`：语音指令 `context_texts`，大白话描述语气，最有效；不计费；仅 2.0 官方音色支持。
- `--no-instruction`：只用参数，便于 A/B 对比。
- `--speech-rate [-50,100]`、`--pitch [-12,12]`、`--loudness-rate [-50,100]`。
- `--emotion/--emotion-scale`：仅部分多情感音色支持。
建议同一段文案生成几组参数对比后再定。

## 计费
按字符计费（语音指令不计）；相同文案+参数尽量缓存避免重复扣字；建议设置余额预警。

接口、参数、响应、字幕结构、错误码详见 [references/api.md](references/api.md)。
