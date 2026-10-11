#!/usr/bin/env python3
"""色板提取。输入：视频（配 --analysis 每场景取一帧，或 --every 秒）或任意图片/设计导出图（png/jpg/pdf 先转图）。
  python palette.py ref.mp4 --analysis analysis/analysis.json --out palette.json --swatch palette.png
  python palette.py a.png b.jpg --out palette.json
方法（和 collage 案例一致）：PIL median-cut 每图取前 8 色 + 平涂区采样（16px 块标准差 <3 的块，代表纯色色块/底色），
跨图合并相近色（ΔRGB<18），按出现图数和面积排序。输出每色 hex、面积占比、出现在哪些场景/图片。"""
import argparse,json,subprocess,io,sys
import numpy as np
from PIL import Image,ImageDraw
def grab(v,t):
    b=subprocess.run(["ffmpeg","-v","error","-ss",f"{t:.3f}","-i",v,"-frames:v","1","-vf","scale=360:-2","-f","image2pipe","-vcodec","png","-"],capture_output=True).stdout
    return Image.open(io.BytesIO(b)).convert("RGB")
def hx(c): return "#%02X%02X%02X"%tuple(int(x) for x in c)
def analyse(im):
    im=im.copy(); im.thumbnail((360,360)); q=im.quantize(10,method=Image.FASTOCTREE,kmeans=2); pal=q.getpalette()[:30]; cnt=sorted(q.getcolors(),reverse=True)
    main=[(np.array(pal[i*3:i*3+3]),c/(im.size[0]*im.size[1])) for c,i in cnt]
    a=np.asarray(im).astype(float); flat=[]
    for y in range(0,a.shape[0]-16,16):
        for x in range(0,a.shape[1]-16,16):
            b=a[y:y+16,x:x+16].reshape(-1,3)
            if b.std(0).max()<3: flat.append(b.mean(0))
    return main,flat,len(flat)*256/(a.shape[0]*a.shape[1])
def main():
    ap=argparse.ArgumentParser();ap.add_argument("src",nargs="+");ap.add_argument("--analysis");ap.add_argument("--every",type=float,default=2.0)
    ap.add_argument("--out",default="palette.json");ap.add_argument("--swatch");a=ap.parse_args()
    imgs=[]
    for s in a.src:
        if s.lower().endswith((".mp4",".mov",".webm",".mkv",".gif")):
            if a.analysis:
                for i,sc in enumerate(json.load(open(a.analysis))["scenes"]): imgs.append((f"S{i+1}",grab(s,(sc["start"]+sc["end"])/2)))
            else:
                d=float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",s],capture_output=True,text=True).stdout)
                imgs+= [(f"{t:.1f}s",grab(s,t)) for t in np.arange(0.5,d,a.every)]
        else: imgs.append((s.split("/")[-1],Image.open(s).convert("RGB")))
    bins=[]; flat_ratio={}
    for lab,im in imgs:
        main,flat,fr=analyse(im); flat_ratio[lab]=round(fr,3)
        for c,area in main:
            for b in bins:
                if np.abs(b["c"]-c).max()<18: b["area"]+=area; b["src"].add(lab); break
            else: bins.append(dict(c=c.astype(float),area=area,src={lab},flat=0))
        for c in flat:
            for b in bins:
                if np.abs(b["c"]-c).max()<18: b["flat"]+=1; b["c"]=b["c"]*0.8+c*0.2; break
    bins.sort(key=lambda b:(-len(b["src"]),-b["area"]))
    out=dict(colors=[dict(hex=hx(b["c"]),area=round(b["area"]/len(imgs),3),appears_in=sorted(b["src"]),flat_blocks=b["flat"]) for b in bins[:16]],
             flat_area_ratio=flat_ratio,note="flat_blocks>0 的颜色来自平涂色块（底色/大色块），最可信；只在照片里出现的颜色别当风格色")
    json.dump(out,open(a.out,"w"),ensure_ascii=False,indent=1)
    if a.swatch:
        S=Image.new("RGB",(80*min(16,len(bins)),110),"white");d=ImageDraw.Draw(S)
        for i,b in enumerate(bins[:16]): d.rectangle([i*80,0,i*80+79,80],fill=tuple(int(x) for x in b["c"])); d.text((i*80+4,86),hx(b["c"]),fill="black")
        S.save(a.swatch)
    for c in out["colors"][:12]: print(c["hex"],c["area"],len(c["appears_in"]),"flat" if c["flat_blocks"] else "")
if __name__=="__main__":main()
