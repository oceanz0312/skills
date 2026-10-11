#!/usr/bin/env python3
"""帧拼图（带时间码），给人/AI 看图用。用法:
  python contact_sheet.py ref.mp4 --analysis analysis/analysis.json --out scenes.jpg   # 每场景取中点一帧（+场景内换姿势的帧）
  python contact_sheet.py ref.mp4 --every 0.5 --out sheet_%d.jpg [--cols 6]             # 等间隔，每张图 ≤36 格
  python contact_sheet.py ref.mp4 --times 1.2,3.4 --out x.jpg
依赖: pillow, ffmpeg。"""
import argparse,json,subprocess,io
from PIL import Image,ImageDraw
def grab(v,t,w=240):
    b=subprocess.run(["ffmpeg","-v","error","-ss",f"{t:.3f}","-i",v,"-frames:v","1","-vf",f"scale={w}:-2","-f","image2pipe","-vcodec","png","-"],capture_output=True).stdout
    return Image.open(io.BytesIO(b)).convert("RGB")
def sheet(v,items,out,cols):
    ims=[(grab(v,t),lab) for t,lab in items]; w,h=ims[0][0].size; rows=(len(ims)+cols-1)//cols
    S=Image.new("RGB",(cols*w,rows*(h+22)),"white"); d=ImageDraw.Draw(S)
    for i,(im,lab) in enumerate(ims):
        x,y=i%cols*w,i//cols*(h+22); S.paste(im,(x,y+22)); d.text((x+4,y+4),lab,fill="black")
    S.save(out,quality=88); print("saved",out,len(ims))
def main():
    ap=argparse.ArgumentParser();ap.add_argument("video");ap.add_argument("--analysis");ap.add_argument("--every",type=float)
    ap.add_argument("--times");ap.add_argument("--out",default="sheet.jpg");ap.add_argument("--cols",type=int,default=6);a=ap.parse_args()
    if a.analysis:
        A=json.load(open(a.analysis)); items=[]
        for i,s in enumerate(A["scenes"]):
            items.append(((s["start"]+s["end"])/2,f"S{i+1} {(s['start']+s['end'])/2:.2f}s"))
        for x in A["events_detail"]:
            if x["kind"]=="pose_swap": items.append((x["t"]+0.05,f"pose {x['t']:.2f}s"))
        items.sort(); sheet(a.video,items[:48],a.out,a.cols)
    else:
        if a.times: ts=[float(x) for x in a.times.split(",")]
        else:
            d=float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",a.video],capture_output=True,text=True).stdout)
            ts=[i*a.every for i in range(int(d/a.every))]
        for k in range(0,len(ts),36):
            out=a.out.replace("%d",str(k//36)) if "%d" in a.out else a.out
            sheet(a.video,[(t,f"{t:.2f}s") for t in ts[k:k+36]],out,a.cols)
if __name__=="__main__":main()
