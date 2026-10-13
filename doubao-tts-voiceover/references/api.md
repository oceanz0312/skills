# 豆包语音合成 2.0 API 参考

来源：火山引擎官方文档（2026-10 查阅）。标【未核实】的为推断。
- HTTP 单向流式：https://docs.volcengine.com/docs/DoubaoVoice/unidirectional-streaming-text-to-speech-http
- WebSocket 双向流式：https://docs.volcengine.com/docs/DoubaoVoice/bidirectional-streaming-text-to-speech-websocket
- 长文本异步：https://docs.volcengine.com/docs/DoubaoVoice/Tasksubmission

## 2. 鉴权
1. 控制台 → 豆包语音 → **API Key 管理** → 创建 API Key。
2. 存环境变量，勿入库：`export VOLC_TTS_API_KEY=xxx`
3. 请求头：
| Header | 必选 | 值 |
|---|---|---|
| `X-Api-Key` | 是 | 控制台 API Key（**不是** `Authorization: Bearer`） |
| `X-Api-Resource-Id` | 是 | `seed-tts-2.0`（2.0 官方音色）；复刻音色用 `seed-icl-2.0` |
| `X-Api-Request-Id` | 是（新版文档标必选） | UUID |
| `Content-Type` | 是 | `application/json` |
| `X-Control-Require-Usage-Tokens-Return` | 否 | `*` 返回计费字数 |
排查时记录响应头 `X-Tt-Logid` 提交工单。

## 3. 接口选择
| 场景 | 接口 | 说明 |
|---|---|---|
| **配音（推荐）** | `POST https://openspeech.bytedance.com/api/v3/tts/unidirectional` | HTTP Chunked，一次给全文，流式返回 base64 音频 |
| 实时（LLM 边生成边念） | `wss://openspeech.bytedance.com/api/v3/tts/bidirection` | 二进制帧协议，StartSession→TaskRequest→FinishSession，同一连接可多 session 但不能并行 |
| 一次输入的 WS | `wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream` | |
| 长文本非实时 | `POST /api/v3/tts/submit` + 轮询 `/api/v3/tts/query` | 单次最多 10 万字符；音频服务端保留 7 天，下载链接约 1 小时有效；submit/query 各占 1 并发，与其他 TTS 接口共享并发 |
注意域名是 `openspeech.bytedance.com`。

## 4. 请求体（默认预设示例）
```json
{
  "user": {"uid": "tts-user"},
  "req_params": {
    "text": "要合成的文案",
    "speaker": "zh_male_liufei_uranus_bigtts",
    "audio_params": {"format": "mp3", "sample_rate": 24000, "speech_rate": 10, "loudness_rate": 0},
    "additions": "{\"context_texts\":[\"用自媒体演说博主的语气，激情澎湃、抑扬顿挫、富有感染力，关键词重读，节奏有起伏，像在台上发布重磅产品一样吸引人\"],\"post_process\":{\"pitch\":2}}"
  }
}
```
⚠️ `additions` 必须是 **JSON 序列化后的字符串**，不是对象。

## 5. 参数表
| 参数 | 类型 | 范围/默认 | 说明 |
|---|---|---|---|
| req_params.text / ssml | string | 二选一 | ssml 优先 |
| speaker | string | — | 音色 ID |
| model | string | 默认 seed-tts-2.0-standard | 仅复刻音色需要；指定后不支持 context_texts |
| audio_params.format | string | mp3（默认）/ogg_opus/pcm/wav | 流式避免 wav（每块带头） |
| audio_params.sample_rate | int | 8000~48000，默认 24000 | |
| audio_params.speech_rate | int | [-50,100]，0 | 100=2 倍速，-50=0.5 倍 |
| audio_params.loudness_rate | int | [-50,100]，0 | 音量 |
| audio_params.emotion | string | — | 仅部分多情感音色；**刘飞不支持** |
| audio_params.emotion_scale | number | 1~5，默认 4 | 非线性 |
| audio_params.enable_subtitle | bool | false | **2.0 字幕**（字级时间戳）；`enable_timestamp` 仅 1.0，用错版本会被静默忽略 |
| additions.context_texts | string[] | — | 语音指令，仅 2.0 官方音色；只取第一个值；不计费 |
| additions.post_process.pitch | int | [-12,12]，0 | 音调，越大越亮 |
| additions.pronunciation_dict | object | — | 如 `{"tone":["北京/(bei3)(jing1)","omg/oh my god"]}` |
| additions.silence_duration | int(ms) | — | 末尾补静音 |
| additions.explicit_language | string | — | zh-cn/en/ja… |
| additions.section_id | string | — | 跨段语义保持（分段合成时可用）【未核实具体用法】 |

## 6. 响应格式
`Content-Type` 为分块流，内容是**连续 JSON 对象**（官方示例/第三方实测有的换行分隔、有的直接拼接，建议用增量 JSON 解码）：
```
{"code":0,"message":"","data":"<base64 音频块>"}
{"code":0,"message":"","data":null,"sentence":{...字幕...}}
{"code":20000000,"message":"ok","usage":{...}}
```
- `code=0`：`data` base64 解码后按顺序拼接即为 mp3
- `code=20000000`：结束
- 其他 code：错误

## 7. 字幕时间戳
- 开 `audio_params.enable_subtitle: true`，字幕随 `sentence` 字段返回（字级）。
- 【已实测 2026-10-14】`sentence` 结构为 `text` + `words[{word,startTime,endTime,confidence}]`，时间单位为秒。注意会额外返回一条合并整段文本、`words` 为空的 sentence，转 SRT 时需跳过。
- 分段合成时每段时间戳从 0 开始，需累加前段时长（脚本按 64kbps 粗估，精确请用 ffprobe）。

## 8. 错误码
| Code | 含义 | 处理 |
|---|---|---|
| 20000000 | 成功结束 | |
| 40000000 | 请求参数错误 | 看 message detail |
| 40000001 | 任务不存在或已过期（异步） | |
| 40000002 | 重复的 reqid | 每次换 UUID |
| 40402003 | 文本超长 | 分段 |
| 45000000 | 音色鉴权失败 / `quota exceeded for types: concurrency` 并发超限 | 检查 speaker 与 Resource-Id 匹配（2.0 音色须 seed-tts-2.0）；降并发重试 |
| 45000001 | 请求参数错误 | |
| 55000000/55000001/55000002 | 服务端错误 | 指数退避重试，带 logid 报障 |
| HTTP 401/403 | API Key 错或未开通【未核实具体状态码】 | |

## 9. 最佳实践
- **分段**：按句号/问号切成 ≤1000 字/段【单次硬上限未核实，保守值】，顺序合成后拼接；长视频也可走异步接口。
- **并发**：默认并发上限按 10 控制【未核实，以控制台配额为准】，超限报 45000000 concurrency。
- **重试**：仅对 5xxxxxxx 和并发限流做退避重试；每次新 Request-Id。
- **文案**：口语化短句、用标点控制停顿；数字/英文缩写可用 pronunciation_dict 修正读音。
- **指令**：context_texts 只取第一条；可另存几套预设 A/B 对比。
- **缓存**：相同文案+参数做 hash 缓存，避免重复扣字。
- **安全**：Key 只放环境变量/密钥管理；泄露立即在控制台删除重建。

## curl 验证
```bash
curl -sN -X POST https://openspeech.bytedance.com/api/v3/tts/unidirectional \
 -H "X-Api-Key: $VOLC_TTS_API_KEY" -H "X-Api-Resource-Id: seed-tts-2.0" \
 -H "X-Api-Request-Id: $(uuidgen)" -H "Content-Type: application/json" \
 -d '{"req_params":{"text":"你好","speaker":"zh_male_liufei_uranus_bigtts","audio_params":{"format":"mp3","sample_rate":24000}}}'
```
