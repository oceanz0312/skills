#!/usr/bin/env python3
"""Validate an agent-written storyboard plan against its manifest.
用法: python validate_plan.py plan.json manifest.json [--root DIR] [--list-elements]
检查：schema（字段/类型/枚举）、引用（place 索引、person id、A/B 闪法需要成对素材）、文案长度、贴纸名或标签能在元素库里找到、
拍数能否装进 BGM（估算）、所有文字在风格包字体里有字形（fontTools）。REJECT → 退出码 1。"""
import json, os, re, sys, argparse
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from validate_manifest import PACKS, FONT_FILES
SRC = open(os.path.join(HERE, "render_template", "collage.js"), encoding="utf-8").read()
def lib(name):
    body = re.search(r"const %s=\{(.*?)\};" % name, SRC, re.S).group(1)
    return {k: re.findall(r'"([^"]+)"', v) for k, v in re.findall(r'(\w+):\[([^\]]*)\]', body)}
ELEM, DOOD = lib("ELEMENTS"), lib("DOODLES")
TAGS = {t for v in list(ELEM.values()) + list(DOOD.values()) for t in v} | set(ELEM) | set(DOOD)
TYPES = {"place": (6, 10), "solo": (5, 9), "note": (8, 12), "list": (8, 11), "ransom": (4, 7)}
INTROS = {"tv", "badge", "ransom", "polaroid"}; OUTROS = {"card", "wall", "stamp", "filmstrip"}
FLASH = {"ab", "ab2", "stutter", "jump"}; TRANS = re.compile(r"^(cut|stamp|pan(-(left|right|up|down))?|tear(-(left|right|up|down))?)$")
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("plan", nargs="?"); ap.add_argument("manifest", nargs="?"); ap.add_argument("--root"); ap.add_argument("--list-elements", action="store_true"); a = ap.parse_args()
    if a.list_elements:
        for k, v in {**ELEM, **{"~" + k: v for k, v in DOOD.items()}}.items(): print(f"{k:14s} {', '.join(v)}")
        return
    p = json.load(open(a.plan, encoding="utf-8")); m = json.load(open(a.manifest, encoding="utf-8")); root = a.root or os.path.dirname(os.path.abspath(a.manifest))
    out = []; R = lambda l, s: out.append((l, s)); texts = []
    pack = p.get("pack") or m.get("style", {}).get("pack")
    R("OK" if pack in PACKS else "REJECT", f"pack = {pack}")
    for k in ("occasion", "mood"): R("OK" if isinstance(p.get(k), str) and p[k].strip() else "WARN", f"{k}: {p.get(k)!r}（自由文本，写清场合与情绪）")
    if "palette_bias" in p and not all(re.match(r"^#[0-9A-Fa-f]{6}$", c) for c in p["palette_bias"]): R("REJECT", "palette_bias 必须是 #RRGGBB 列表")
    if p.get("boil") not in (None, 0.5, 1): R("REJECT", "boil 只能是 1 或 0.5")
    people = {x["id"]: x for x in m.get("people", [])}; nplace = len(m.get("places", []))
    def person(where, v, flash):
        if v in (None, "auto"): return
        if v not in people: R("REJECT", f"{where}: person {v!r} 不在 manifest.people"); return
        if flash in ("ab", "ab2", "stutter") and "B" not in people[v]: R("WARN", f"{where}: {flash} 需要 A/B 对，{v} 是单张 → 渲染时降级为 jump")
    def stickers(where, lst):
        for s in lst or []:
            if str(s).lower() not in TAGS: R("REJECT", f"{where}: 贴纸 {s!r} 在元素库里找不到（python validate_plan.py --list-elements）")
        if len(lst or []) > 5: R("WARN", f"{where}: {len(lst)} 个贴纸偏多（P0-5 放不下会被丢掉）")
    def txt(where, s, mx):
        if not isinstance(s, str) or not s.strip(): R("REJECT", f"{where}: 缺文字"); return
        texts.append(s)
        if len(s) > mx: R("WARN", f"{where}: {s!r} 有 {len(s)} 字符（建议 ≤{mx}）")
    I = p.get("intro", {}); O = p.get("outro", {})
    if I.get("layout") and I["layout"] not in INTROS: R("REJECT", f"intro.layout {I['layout']} ∉ {sorted(INTROS)}")
    if I.get("layout") == "tv" and not (m.get("props") or {}).get("tv"): R("REJECT", "intro tv 需要 manifest.props.tv")
    txt("intro.title", I.get("title"), 22); person("intro", I.get("person"), "jump"); stickers("intro", I.get("stickers"))
    beats = (I.get("beats") or 5) + (O.get("beats") or 10)
    for i, s in enumerate(p.get("scenes", [])):
        w = f"scenes[{i}]"; t = s.get("type")
        if t not in TYPES: R("REJECT", f"{w}: type {t!r} ∉ {sorted(TYPES)}"); continue
        lo, hi = TYPES[t]; b = s.get("beats", (lo + hi) // 2); beats += b
        if not lo <= b <= hi: R("REJECT", f"{w}: beats {b} 超出 {lo}–{hi}")
        if s.get("transition") and not TRANS.match(s["transition"]): R("REJECT", f"{w}: transition {s['transition']!r}")
        if s.get("flash") and s["flash"] not in FLASH: R("REJECT", f"{w}: flash {s['flash']!r}")
        if t == "place" and not (isinstance(s.get("place"), int) and 0 <= s["place"] < nplace): R("REJECT", f"{w}: place 索引无效（0..{nplace-1}）")
        if t in ("place", "solo"): txt(w + ".text", s.get("text"), 30)
        if t == "ransom": txt(w + ".text", s.get("text"), 16)
        if t == "note":
            ls = s.get("lines") or []; [txt(f"{w}.lines", l, 14) for l in ls]
            if not 2 <= len(ls) <= 8: R("REJECT", f"{w}: note 需要 2–8 行")
            if s.get("person"): R("WARN", f"{w}: note 场景不放人物，person 被忽略")
        if t == "list":
            txt(w + ".title", s.get("title"), 10); its = s.get("items") or []; [txt(f"{w}.items", l, 14) for l in its]
            if not 2 <= len(its) <= 4: R("REJECT", f"{w}: list 需要 2–4 项")
        person(w, s.get("person"), s.get("flash")); stickers(w, s.get("stickers"))
    if O.get("layout") and O["layout"] not in OUTROS: R("REJECT", f"outro.layout {O['layout']} ∉ {sorted(OUTROS)}")
    txt("outro.text", O.get("text"), 26); person("outro", O.get("person"), "jump"); stickers("outro", O.get("stickers"))
    for k in ("lines", "tags"):
        for l in O.get(k) or []: texts.append(l)
    if O.get("stamp"): txt("outro.stamp", O["stamp"], 14)
    bg = m.get("bgm", {}); T = bg.get("T", 12.25); avail = int((bg.get("duration_sec", 38.4) * 30 - bg.get("offset_frames", 3.4)) / T)
    R("OK" if beats <= avail else "WARN", f"计划约 {beats} 拍 / BGM 可用 {avail} 拍" + ("" if beats <= avail else "（渲染器会先压缩场景，再丢掉末尾场景）"))
    try:
        from fontTools.ttLib import TTFont
        zh, ens = PACKS.get(pack, PACKS["scrapbook"]); allt = "".join(texts)
        cjk = {c for c in allt if ord(c) >= 0x2E80 and c.strip()}; lat = {c for c in allt if ord(c) < 128 and c.isalnum()}
        for fam in [zh] + ens:
            fp = os.path.join(root, "fonts", FONT_FILES[fam])
            if not os.path.exists(fp): R("WARN", f"字体缺失 {fp}"); continue
            cm = TTFont(fp, fontNumber=0).getBestCmap(); miss = sorted(c for c in (cjk if fam == zh else lat) if ord(c) not in cm)
            R("REJECT" if miss and fam == zh else ("WARN" if miss else "OK"), f"字形 {fam}: " + ("缺 " + "".join(miss) if miss else "全覆盖"))
        sym = {c for c in allt if 0x2000 <= ord(c) < 0x2E80}
        if sym: R("REJECT", f"文字里有手写字体没有的符号 {''.join(sym)}")
    except ImportError: R("WARN", "未装 fontTools，跳过字形")
    for l, s in out: print(f"[{l}] {s}")
    n = sum(l == "REJECT" for l, _ in out); print(f"\n{n} REJECT, {sum(l=='WARN' for l,_ in out)} WARN"); sys.exit(1 if n else 0)
if __name__ == "__main__": main()
