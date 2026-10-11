#!/usr/bin/env python3
"""人物抠图 + 统一暖调 + 手账白边（整对情侣合成一张贴纸）。
用法: python cutout.py in.jpg out.png [--width 1080] [--model auto] [--sticker-frac 0.6] [--grade none|film-warm]（v9 默认 none：保留原片颜色）
输出: out.png（带白边贴纸）、out.mask.png（源图分辨率 mask）和 out.check.json（v7 人物完整性检查）。
- v7：抠完立即跑 person_check（姿态关键点 + mask 连通性 + 边缘裁切）。不通过就依次换 rembg 模型（u2net_human_seg / isnet-general-use / birefnet-portrait / u2net）和合并距离（0.12 → 0.30 对角线），全部失败退出码 3：必须换素材。
- --model auto：低饱和（黑白/棕褐，sat<0.09）或很暗（平均亮度<0.20）时用 u2net_human_seg，否则 isnet-general-use。暗光婚礼照、深色西装用 isnet 会被抠掉。
- 合并：保留最大连通域 + 靠近它的较大连通域（≥3% 面积，距离 ≤12% 对角线），再逐步加大白边闭运算，直到白边是一整块——两个人永远是一张贴纸。
- 调色（v9 默认 none = 保留原色；只有 style.personGrade="film-warm" 时才传 --grade film-warm）film-warm：所有人物照统一成同一种胶片暖调；黑白/棕褐照片会被着成暖色，彩色照降饱和后叠同一套暖色曲线，避免片中一张彩一张黑白。
白边 = 成片宽 0.97%（换算到贴纸在成片中的尺寸），外圈 1.5px rgba(0,0,0,.25) 暗边。依赖: pillow, numpy, scipy；rembg（--no-rembg 时输入须为带 alpha 的 PNG）。"""
import argparse, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

def film_warm(rgb):
    a=rgb.astype(np.float32)/255; L=(0.299*a[...,0]+0.587*a[...,1]+0.114*a[...,2])[...,None]
    sat=(a.max(2)-a.min(2)).mean()
    sh=np.array([0.22,0.15,0.12]); hi=np.array([1.0,0.94,0.84])
    tone=sh+(hi-sh)*np.clip(L*1.05,0,1)
    k=0.80 if sat<0.08 else 0.18            # 黑白/棕褐照几乎全靠着色；彩色照轻叠
    col=L+(a-L)*0.90                         # 降饱和 10%
    out=col*(1-k)+tone*k
    out=0.03+out*0.95                        # 压暗部/高光，胶片感
    return (np.clip(out,0,1)*255).astype(np.uint8), sat

def pick_model(rgb):
    a=rgb.astype(np.float32)/255; L=a.mean(2); sat=(a.max(2)-a.min(2)).mean()
    return "u2net_human_seg" if (sat<0.09 or L.mean()<0.20) else "isnet-general-use"   # 黑白/棕褐/暗光 → human_seg

def merge_mask(al, keep_frac=0.03, dist_frac=0.12):
    arr=al>127; lab,n=ndimage.label(arr)
    if n==0: return arr
    sizes=ndimage.sum(arr,lab,range(1,n+1)); big=int(np.argmax(sizes))+1
    objs=ndimage.find_objects(lab); y0,x0=objs[big-1][0].start,objs[big-1][1].start; y1,x1=objs[big-1][0].stop,objs[big-1][1].stop
    diag=np.hypot(*arr.shape); keep=[big]
    for i in range(1,n+1):
        if i==big or sizes[i-1]<keep_frac*sizes[big-1]: continue
        sy,sx=objs[i-1]; dy=max(0,y0-sy.stop,sy.start-y1); dx=max(0,x0-sx.stop,sx.start-x1)
        if np.hypot(dx,dy)<=dist_frac*diag: keep.append(i)
    return np.isin(lab,keep)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--width",type=int,default=1080); ap.add_argument("--no-rembg",action="store_true")
    ap.add_argument("--border",type=int,default=None); ap.add_argument("--model",default="auto")
    ap.add_argument("--sticker-frac",type=float,default=0.6,help="贴纸在成片中的宽度占比；A/B 必须同值")
    ap.add_argument("--grade",default="none",choices=["none","film-warm"])   # v9: people keep original colours by default (style.personGrade="film-warm" -> pass --grade film-warm)
    ap.add_argument("--expect",type=int,default=2,help="照片里应完整出现的人数（情侣=2）"); ap.add_argument("--no-check",action="store_true"); a=ap.parse_args()
    src=Image.open(a.inp); stem=a.out.rsplit(".",1)[0]
    # v7: completeness check (person_check.judge) with fallback over models / merge params; report -> <out>.check.json
    tries=[];best=None
    if src.mode!="RGBA" and not a.no_rembg:
        from rembg import remove, new_session
        rgb0=np.asarray(src.convert("RGB")); first=pick_model(rgb0) if a.model=="auto" else a.model
        models=[first]+([m_ for m_ in ["u2net_human_seg","isnet-general-use","birefnet-portrait","u2net"] if m_!=first] if a.model=="auto" else [])
    else: models=["alpha-input"]
    import json,sys as _s,os as _o; _s.path.insert(0,_o.path.dirname(_o.path.abspath(__file__)))
    for model in models:
        im=src if model=="alpha-input" else remove(src.convert("RGB"), session=new_session(model))
        im=im.convert("RGBA"); al=np.asarray(im)[...,3]
        for dist in (0.12,0.30):
            m=merge_mask(al,dist_frac=dist)
            if a.no_check: ok,rep=True,{"skipped":True}
            else:
                import person_check as pc; ok,rep=pc.judge(np.asarray(src.convert("RGB")),m,a.expect)
            tries.append({"model":model,"merge_dist":dist,"ok":ok,"errors":rep.get("errors"),"warnings":rep.get("warnings")})
            score=(ok,-len(rep.get("errors",[])),-len(rep.get("warnings",[]) or []))
            if best is None or score>best[0]: best=(score,im,m,model,rep)
            if ok: break
        if ok: break
    _,im,m,model,rep=best
    json.dump({"input":a.inp,"pass":best[0][0],"chosen_model":model,"tries":tries,"report":rep},open(stem+".check.json","w"),ensure_ascii=False,indent=1)
    rgb=np.asarray(im)[...,:3]
    Image.fromarray((m*255).astype(np.uint8)).save(stem+".mask.png")
    m=ndimage.binary_erosion(m,iterations=1)
    if a.grade=="film-warm": rgb,sat=film_warm(rgb)
    scale=im.width/(a.sticker_frac*a.width)
    b=a.border if a.border is not None else max(1,round(0.0097*a.width*scale))
    pad=b*4+8; H,W=m.shape[0]+2*pad,m.shape[1]+2*pad
    base=np.zeros((H,W),bool); base[pad:pad+m.shape[0],pad:pad+m.shape[1]]=m
    r=b; white=None
    while True:      # 加大闭运算直到白边成为一整块
        yy,xx=np.ogrid[-r:r+1,-r:r+1]; se=xx*xx+yy*yy<=r*r
        white=ndimage.binary_dilation(base,se)
        if r>b: white=ndimage.binary_erosion(white,np.ones((2*(r-b)+1,)*2,bool)[se.shape[0]//2-(r-b):se.shape[0]//2+(r-b)+1,:][:, :]) if False else ndimage.binary_erosion(ndimage.binary_dilation(base,se),iterations=r-b)|ndimage.binary_dilation(base,iterations=b)
        if ndimage.label(white)[1]<=1 or r>b*8: break
        r+=b
    white=ndimage.binary_fill_holes(white)
    white=np.asarray(Image.fromarray((white*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1)))>100
    rim=ndimage.binary_dilation(white,iterations=max(1,round(1.5*scale)))
    out=np.zeros((H,W,4),np.uint8); out[rim]=(0,0,0,64); out[white]=(247,245,242,255)
    body=np.zeros((H,W,3),np.uint8); body[pad:pad+m.shape[0],pad:pad+m.shape[1]]=rgb
    mm=np.zeros((H,W),bool); mm[pad:pad+m.shape[0],pad:pad+m.shape[1]]=m
    out[mm,:3]=body[mm]; out[mm,3]=255
    o=Image.fromarray(out); o=o.crop(o.getbbox()); o.save(a.out)
    print(f"saved {a.out} size={o.size} model={model} border={b}px pieces={ndimage.label(white)[1]} person_check={'PASS' if best[0][0] else 'REJECT'} {rep.get('errors')} warn={rep.get('warnings')}")
    if not best[0][0]: print("REJECT: 所有模型/参数都不完整——换一张素材（见 .check.json）"); raise SystemExit(3)
if __name__=="__main__": main()
