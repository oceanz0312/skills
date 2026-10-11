#!/usr/bin/env python3
"""v9 P0-8 人物保留原色：比较每张人物贴纸（cut/<key>.png，去掉白边）与源照片同一 mask 区域（assets/<key>.jpg + cut/<key>.mask.png）的平均饱和度。
比值 sticker/source < 0.9 → FAIL（人物被调灰/降饱和）。style.personGrade="film-warm" 时跳过（用户明确要统一暖调）。
用法: python color_check.py [--root .] [--json color_check.json]；qa_compare.py 会自动调用。"""
import argparse,glob,json,os
import numpy as np
from PIL import Image
from scipy import ndimage
MIN_RATIO=0.9
def check(root="."):
    res={}
    for png in sorted(glob.glob(os.path.join(root,"cut","*.png"))):
        k=os.path.basename(png)[:-4]
        if k.endswith(".mask"): continue
        src=os.path.join(root,"assets",k+".jpg"); mk=os.path.join(root,"cut",k+".mask.png")
        if not (os.path.exists(src) and os.path.exists(mk)): continue
        s=Image.open(src).convert("RGB"); m=np.asarray(Image.open(mk).convert("L").resize(s.size))>127
        m=ndimage.binary_erosion(m,iterations=8)
        st=Image.open(png).convert("RGBA"); a=np.asarray(st)[...,3]; inner=ndimage.binary_erosion(a>250,iterations=40)  # skip the white border
        if m.sum()<500 or inner.sum()<500: continue
        hs=np.asarray(s.convert("HSV")).astype(float)[...,1][m].mean()/255
        hv=np.asarray(st.convert("RGB").convert("HSV")).astype(float)[...,1][inner].mean()/255
        r=hv/max(hs,1e-6); res[k]={"src_sat":round(float(hs),3),"sticker_sat":round(float(hv),3),"ratio":round(float(r),3),"pass":bool(r>=MIN_RATIO)}
    return res
if __name__=="__main__":
    ap=argparse.ArgumentParser(); ap.add_argument("--root",default="."); ap.add_argument("--json"); a=ap.parse_args()
    r=check(a.root); [print(k,v) for k,v in r.items()]
    if a.json: json.dump(r,open(a.json,"w"),indent=1)
    raise SystemExit(0 if all(v["pass"] for v in r.values()) else 1)
