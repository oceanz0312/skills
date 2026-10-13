#!/usr/bin/env python3
"""豆包语音合成 2.0 (seed-tts-2.0) —— HTTP Chunked 单向流式，新版控制台 API Key 鉴权。
用法:
  export VOLC_TTS_API_KEY=xxxx
  python tts.py "要合成的文案" out.mp3
  python tts.py -f script.txt out.mp3 --subtitle out.srt
依赖: pip install requests
"""
import argparse, base64, json, os, re, sys, uuid
import requests

URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
RESOURCE_ID = "seed-tts-2.0"

# 默认预设（可通过命令行参数覆盖）：刘飞 2.0 + 演说博主语音指令 + 语速 10 + 音调 2
PRESET = {
    "speaker": "zh_male_liufei_uranus_bigtts",
    "context_text": "用自媒体演说博主的语气，激情澎湃、抑扬顿挫、富有感染力，关键词重读，节奏有起伏，像在台上发布重磅产品一样吸引人",
    "speech_rate": 10, "pitch": 2, "loudness_rate": 0,
    "format": "mp3", "sample_rate": 24000,
}
MAX_CHARS = 1000  # 单段建议上限（保守值，未在文档中核实具体硬上限）


def split_text(text, limit=MAX_CHARS):
    sents = re.split(r"(?<=[。！？!?；;\n])", text)
    out, buf = [], ""
    for s in sents:
        if len(buf) + len(s) > limit and buf:
            out.append(buf); buf = ""
        buf += s
    if buf.strip():
        out.append(buf)
    return [x.strip() for x in out if x.strip()]


def iter_json_objects(resp):
    """响应是连续 JSON 对象（可能换行分隔，也可能直接拼接），用增量解码兼容两种情况。"""
    dec, buf = json.JSONDecoder(), ""
    for chunk in resp.iter_content(chunk_size=None, decode_unicode=False):
        buf += chunk.decode("utf-8")
        while True:
            buf = buf.lstrip()
            if not buf:
                break
            try:
                obj, idx = dec.raw_decode(buf)
            except json.JSONDecodeError:
                break
            buf = buf[idx:]
            yield obj


def synth(text, api_key, p, subtitle=False, emotion=None, emotion_scale=None):
    audio_params = {"format": p["format"], "sample_rate": p["sample_rate"],
                    "speech_rate": p["speech_rate"], "loudness_rate": p["loudness_rate"]}
    if subtitle:
        audio_params["enable_subtitle"] = True  # TTS2.0 字幕；1.0 用 enable_timestamp
    if emotion:  # 刘飞不支持情感，仅多情感音色可用
        audio_params["emotion"] = emotion
        if emotion_scale:
            audio_params["emotion_scale"] = emotion_scale
    additions = {"post_process": {"pitch": p["pitch"]}}
    if p.get("context_text"):
        additions["context_texts"] = [p["context_text"]]  # 只有第一个值生效，不计费
    body = {"user": {"uid": "tts-user"},
            "req_params": {"text": text, "speaker": p["speaker"],
                           "audio_params": audio_params,
                           "additions": json.dumps(additions, ensure_ascii=False)}}  # additions 必须是 JSON 字符串
    headers = {"X-Api-Key": api_key, "X-Api-Resource-Id": RESOURCE_ID,
               "X-Api-Request-Id": str(uuid.uuid4()), "Content-Type": "application/json",
               "X-Control-Require-Usage-Tokens-Return": "*"}
    audio, subs = bytearray(), []
    with requests.post(URL, headers=headers, data=json.dumps(body, ensure_ascii=False).encode(),
                       stream=True, timeout=(10, 300)) as r:
        logid = r.headers.get("X-Tt-Logid")
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} logid={logid}: {r.text[:500]}")
        for obj in iter_json_objects(r):
            code = obj.get("code", 0)
            if obj.get("data"):
                audio += base64.b64decode(obj["data"])
            if obj.get("sentence"):
                subs.append(obj["sentence"])
            if code == 20000000:
                if obj.get("usage"):
                    print(f"  usage: {obj['usage']}", file=sys.stderr)
                break
            if code not in (0, 20000000):
                raise RuntimeError(f"TTS error code={code} msg={obj.get('message')} logid={logid}")
    return bytes(audio), subs


def fmt_ts(ms):
    ms = int(ms); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def subs_to_srt(segments):
    """segments: [(offset_ms, [sentence,...])]。sentence 结构未完全核实，实测字段为 text/words[startTime,endTime]（单位秒），兼容 start_time/end_time。"""
    lines, n = [], 0
    for offset, sents in segments:
        for s in sents:
            words = s.get("words") or []
            if not words:
                continue
            st = float(words[0].get("startTime", words[0].get("start_time", 0))); et = float(words[-1].get("endTime", words[-1].get("end_time", st)))
            scale = 1000 if et < 1000 else 1  # 秒或毫秒自适应
            n += 1
            lines += [str(n), f"{fmt_ts(offset + st*scale)} --> {fmt_ts(offset + et*scale)}",
                      s.get("text") or "".join(w.get("word", "") for w in words), ""]
    return "\n".join(lines)


def mp3_duration_ms(data):
    return len(data) * 8 / 64  # 粗估：按 64kbps CBR，仅用于多段字幕偏移


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text", nargs="?", help="文案；或用 -f")
    ap.add_argument("output")
    ap.add_argument("-f", "--file")
    ap.add_argument("--subtitle", help="字幕输出路径 (.srt)，另存原始 JSON 为 .json")
    ap.add_argument("--speaker"); ap.add_argument("--speech-rate", type=int)
    ap.add_argument("--pitch", type=int); ap.add_argument("--no-instruction", action="store_true")
    ap.add_argument("--instruction", help="自定义语音指令 context_texts，覆盖默认")
    ap.add_argument("--loudness-rate", type=int)
    ap.add_argument("--emotion"); ap.add_argument("--emotion-scale", type=int)
    a = ap.parse_args()
    key = os.environ.get("VOLC_TTS_API_KEY") or sys.exit("请设置环境变量 VOLC_TTS_API_KEY")
    text = open(a.file, encoding="utf-8").read() if a.file else a.text
    if not text: sys.exit("缺少文案")
    p = dict(PRESET)
    if a.speaker: p["speaker"] = a.speaker
    if a.speech_rate is not None: p["speech_rate"] = a.speech_rate
    if a.pitch is not None: p["pitch"] = a.pitch
    if a.instruction: p["context_text"] = a.instruction
    if a.loudness_rate is not None: p["loudness_rate"] = a.loudness_rate
    if a.no_instruction: p["context_text"] = None
    out, segs, offset = bytearray(), [], 0.0
    parts = split_text(text)
    for i, part in enumerate(parts, 1):
        print(f"[{i}/{len(parts)}] {len(part)} 字", file=sys.stderr)
        audio, subs = synth(part, key, p, bool(a.subtitle), a.emotion, a.emotion_scale)
        out += audio; segs.append((offset, subs)); offset += mp3_duration_ms(audio)
    open(a.output, "wb").write(out)
    print(f"已保存 {a.output} ({len(out)} bytes)", file=sys.stderr)
    if a.subtitle:
        open(a.subtitle, "w", encoding="utf-8").write(subs_to_srt(segs))
        json.dump(segs, open(os.path.splitext(a.subtitle)[0] + ".json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"字幕: {a.subtitle}", file=sys.stderr)


if __name__ == "__main__":
    main()
