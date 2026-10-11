#!/usr/bin/env python3
"""一键跑完测量阶段（第 1–2 步），生成 analysis/ 和一份待填的 style_analysis.md 草稿。
  python distill.py <输入...> --out work/analysis [--slug my-style]
输入可以混：视频（mp4/mov/webm/gif）、图片（png/jpg/webp）、PDF（品牌手册/设计稿导出）、.md/.txt（设计语言描述，原样附进草稿）。
视频 → analyze_video + audio_beat + palette + contact_sheet（场景拼图 + 每 0.5s 拼图）
图片/PDF → image_style（色板 + 测量 + 推导的动效默认值）
草稿里每条数字都已标【实测】或【推】；【估】的部分（签名、习惯、反模式）由 agent 看拼图后补写。"""
import argparse,os,subprocess,sys,json
H=os.path.dirname(os.path.abspath(__file__));PY=sys.executable
VID=(".mp4",".mov",".webm",".mkv",".gif",".m4v");IMG=(".png",".jpg",".jpeg",".webp",".bmp")
def run(*c):print("$"," ".join(c));subprocess.run([PY,*c],check=True)
def main():
    ap=argparse.ArgumentParser();ap.add_argument("inputs",nargs="+");ap.add_argument("--out",default="analysis");ap.add_argument("--slug",default="new-style");a=ap.parse_args()
    os.makedirs(a.out,exist_ok=True);vids=[x for x in a.inputs if x.lower().endswith(VID)];imgs=[x for x in a.inputs if x.lower().endswith(IMG)]
    pdfs=[x for x in a.inputs if x.lower().endswith(".pdf")];txt=[x for x in a.inputs if x.lower().endswith((".md",".txt"))]
    parts=[]
    for i,v in enumerate(vids):
        o=os.path.join(a.out,f"video{i+1}");os.makedirs(o,exist_ok=True)
        run(f"{H}/analyze_video.py",v,"--out",o);run(f"{H}/audio_beat.py",v,"--analysis",f"{o}/analysis.json","--out",f"{o}/audio.json")
        run(f"{H}/palette.py",v,"--analysis",f"{o}/analysis.json","--out",f"{o}/palette.json","--swatch",f"{o}/palette.png")
        run(f"{H}/contact_sheet.py",v,"--analysis",f"{o}/analysis.json","--out",f"{o}/scenes.jpg")
        run(f"{H}/contact_sheet.py",v,"--every","0.5","--out",f"{o}/sheet_%d.jpg")
        parts.append(("video",o,v))
    if imgs or pdfs:
        o=os.path.join(a.out,"stills");args=[f"{H}/image_style.py",*imgs,"--out",o]
        for p in pdfs[:1]:args+=["--pdf",p]
        run(*args);parts.append(("stills",o,imgs+pdfs))
    tpl=open(os.path.join(H,"..","templates","style_analysis.template.md"),encoding="utf-8").read().replace("{{slug}}",a.slug)
    auto=[]
    for kind,o,src in parts:
        if kind=="video":
            A=json.load(open(f"{o}/analysis.json"));U=json.load(open(f"{o}/audio.json"));Pl=json.load(open(f"{o}/palette.json"))
            auto.append(open(f"{o}/analysis.md",encoding="utf-8").read())
            auto.append(f"- 音乐：tempo≈{U.get('tempo')}，onset 自相关峰 {U.get('onset_autocorr_peaks_sec')}，切点到拍中位 {U.get('cut_to_beat_ms_median')}ms → **{U.get('verdict')}**【实测】")
            auto.append("- 色板【实测】："+"、".join(f"{c['hex']}({','.join(c['appears_in'][:4])})" for c in Pl["colors"][:10] if c["flat_blocks"]))
        else:
            S=json.load(open(f"{o}/image_style.json"));Pl=json.load(open(f"{o}/palette.json"))
            auto.append("## 静态输入测量【实测】\n```json\n"+json.dumps({k:v for k,v in S["per_image"].items()},ensure_ascii=False)[:3000]+"\n```")
            auto.append("## 推导的动效默认值【推】（无时间轴，全部可调）\n```json\n"+json.dumps(S["derived_defaults"],ensure_ascii=False,indent=1)+"\n```")
            auto.append("- 色板【实测】："+"、".join(c["hex"] for c in Pl["colors"][:10]))
    for t in txt: auto.append("## 用户提供的设计语言描述（原文）\n"+open(t,encoding="utf-8").read())
    open(os.path.join(a.out,"style_analysis.draft.md"),"w",encoding="utf-8").write(tpl.replace("{{AUTO_MEASUREMENTS}}","\n\n".join(auto)))
    print("草稿 →",os.path.join(a.out,"style_analysis.draft.md"))
if __name__=="__main__":main()
