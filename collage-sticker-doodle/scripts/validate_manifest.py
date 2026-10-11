#!/usr/bin/env python3
"""collage-sticker-doodle manifest + asset validator.
用法: python validate_manifest.py manifest.json [--root DIR]
检查：pack/theme 合法；BGM 存在且时长/拍长 T 可用（librosa 可选，自动测 T 并与 manifest 比较）；每个 place 的照片存在、subject 框合法、远景纵深（WARN）；
每个 person：抠图 PNG + mask 存在、P0-6 人物完整性（读 cut/<stem>.check.json，没有则现场跑 person_check）、A/B 同机位 + 姿势差异；
文案字形覆盖（pack 的中/英字体，fontTools）；素材数量够不够撑起 BGM 时长（WARN）。
输出 REJECT / WARN / OK，有 REJECT 退出码 1。"""
import json, os, sys, re, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _checks import ab_check, landscape_check
PACKS = {"scrapbook": ("Ma Shan Zheng", ["Reenie Beanie","Caveat","Homemade Apple","Nothing You Could Do","Dancing Script","Kalam"]),
         "magazine": ("ZCOOL KuaiLe", ["Kalam","Caveat","Dancing Script","Homemade Apple"]),
         "retro-poster": ("Zhi Mang Xing", ["Dancing Script","Homemade Apple","Caveat"]),
         "graffiti": ("ZCOOL KuaiLe", ["Kalam","Caveat","Reenie Beanie","Dancing Script"]),
         "zine": ("Long Cang", ["Nothing You Could Do","Reenie Beanie","Homemade Apple","Kalam","Caveat"])}
THEMES = ["wedding", "travel", "anniversary", "birthday", "vlog"]
FONT_FILES = {"Long Cang":"LongCang-Regular.ttf","Ma Shan Zheng":"MaShanZheng.ttf","ZCOOL KuaiLe":"ZCOOLKuaiLe-Regular.ttf","Zhi Mang Xing":"ZhiMangXing-Regular.ttf",
  "Reenie Beanie":"ReenieBeanie.ttf","Nothing You Could Do":"NothingYouCouldDo.ttf","Homemade Apple":"HomemadeApple.ttf","Caveat":"Caveat.ttf","Dancing Script":"DancingScript.ttf","Kalam":"Kalam.ttf"}
def theme_copy(theme, here):
    src = open(os.path.join(here, "render_template", "themes.js"), encoding="utf-8").read()
    m = re.search(r"\n %s:\{(.*?)\},?\n [a-z]+:|\n %s:\{(.*?)\}\};" % (theme, theme), src, re.S)
    return (m.group(1) or m.group(2)) if m else ""
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("manifest"); ap.add_argument("--root"); a = ap.parse_args()
    root = a.root or os.path.dirname(os.path.abspath(a.manifest)); m = json.load(open(a.manifest, encoding="utf-8")); here = os.path.dirname(os.path.abspath(__file__))
    out = []; R = lambda lvl, msg: out.append((lvl, msg))
    pack = m.get("style", {}).get("pack", "scrapbook"); theme = m.get("theme", "vlog")
    R("OK" if pack in PACKS else "REJECT", f"style.pack = {pack}（可选 {', '.join(PACKS)}）")
    R("OK" if theme in THEMES else "REJECT", f"theme = {theme}（可选 {', '.join(THEMES)}）")
    bg = m.get("bgm", {}); bp = os.path.join(root, bg.get("file", "-"))
    if not os.path.exists(bp): R("REJECT", f"BGM 不存在 {bg.get('file')}")
    else:
        try:
            import librosa; y, sr = librosa.load(bp, sr=22050, mono=True); dur = len(y) / sr; tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            tempo = float(tempo if not hasattr(tempo, "__len__") else tempo[0]); T = 30 * 60 / tempo
            cand = [T * k for k in (0.5, 1, 2)]; T_best = min(cand, key=lambda t: abs(t - bg.get("T", T)))
            R("OK" if abs(T_best - bg.get("T", T)) < 0.6 else "WARN", f"BGM {dur:.1f}s，测得 {tempo:.1f} BPM → T≈{T_best:.2f} 帧（manifest T={bg.get('T')}）")
            if bg.get("duration_sec", dur) > dur + 0.1: R("REJECT", f"duration_sec {bg['duration_sec']} > BGM 时长 {dur:.1f}")
        except ImportError: R("WARN", "未安装 librosa，跳过 BGM 节拍检查")
    places = m.get("places", []); people = m.get("people", [])
    if not people: R("REJECT", "至少需要 1 个人物素材")
    for i, pl in enumerate(places):
        p = os.path.join(root, pl["file"])
        if not os.path.exists(p): R("REJECT", f"place[{i}] 不存在 {pl['file']}"); continue
        s = pl.get("subject")
        if not s or not all(0 <= s[k] <= 1 for k in "uvwh") or s["u"] + s["w"] > 1.001 or s["v"] + s["h"] > 1.001: R("REJECT", f"place[{i}] subject 框缺失或越界（u,v,w,h 为 0..1 的原图比例）")
        R(*landscape_check(f"place[{i}]", p))
    try:
        import person_check as pc
    except Exception: pc = None
    for pe in people:
        for side in ("A", "B"):
            if side not in pe: continue
            cut = os.path.join(root, pe[side]); src = pe["src" if side == "A" else "srcB"]
            ph, mk = os.path.join(root, src["photo"]), os.path.join(root, src["mask"])
            if not os.path.exists(cut) or not os.path.exists(mk): R("REJECT", f"{pe['id']}.{side} 缺抠图或 mask（先跑 cutout.py）"); continue
            cj = mk.replace(".mask.png", ".check.json")
            if os.path.exists(cj): j = json.load(open(cj)); ok, errs = j["pass"], j["report"].get("errors", [])
            elif pc: ok, rep = pc.check_cutout(ph, mk, src.get("people_count", 2)); errs = rep["errors"]
            else: R("WARN", f"{pe['id']}.{side} 未装 mediapipe，跳过 P0-6"); continue
            R("OK" if ok else "REJECT", f"{pe['id']}.{side} P0-6 人物完整性 " + ("通过" if ok else "失败: " + "; ".join(errs)))
        if "B" in pe:
            stem = os.path.basename(pe["src"]["mask"]).replace("_A.mask.png", "")
            lvl, msg = ab_check(os.path.join(root, pe["src"]["photo"]), os.path.join(root, pe["srcB"]["photo"]), root, stem, {})
            R(lvl, f"{pe['id']} " + msg)
    # glyph coverage: theme template + manifest copy/names/info must exist in the pack fonts
    try:
        from fontTools.ttLib import TTFont
        txt = theme_copy(theme, here) + json.dumps([m.get("copy", {}), m.get("names", {}), m.get("info", {})], ensure_ascii=False)
        cjk = {c for c in txt if ord(c) >= 0x2E80 and c.strip()} | set("0123456789:.&·："); lat = {c for c in txt if ord(c) < 128 and c.isalnum()}
        zh, ens = PACKS.get(pack, PACKS["scrapbook"])
        for fam in [zh] + ens:
            p = os.path.join(root, "fonts", FONT_FILES[fam])
            if not os.path.exists(p): R("REJECT", f"字体文件缺失 fonts/{FONT_FILES[fam]}"); continue
            cm = TTFont(p, fontNumber=0).getBestCmap(); need = cjk if fam == zh else lat
            miss = sorted(c for c in need if ord(c) not in cm)
            R("REJECT" if miss and fam == zh else ("WARN" if miss else "OK"), f"字形 {fam}: " + ("缺 " + "".join(miss[:30]) if miss else "全覆盖"))
    except ImportError: R("WARN", "未安装 fontTools，跳过字形检查")
    if bg.get("duration_sec", 38) > 20 and len(places) + len(people) < 4: R("WARN", "素材少于 4 组，长 BGM 会大量复用素材（建议 ≥3 张风景 + ≥2 组人物）")
    for lvl, msg in out: print(f"[{lvl}] {msg}")
    n = sum(1 for l, _ in out if l == "REJECT"); print(f"\n{n} REJECT, {sum(1 for l,_ in out if l=='WARN')} WARN"); sys.exit(1 if n else 0)
if __name__ == "__main__": main()
