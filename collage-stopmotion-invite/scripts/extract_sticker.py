#!/usr/bin/env python3
"""v9 用户道具贴纸（宠物等）：从一张"已抠好、带白边、放在纯色底上"的拼图里把每个贴纸抠成独立透明 PNG。
保留原有白边和原色（不调色）；背景色取四边中位色，按颜色距离分前景，开运算去噪，取最大的 N 个连通域，填洞，0.8px 羽化。
没有白边的普通照片：先用 cutout.py（同样 --grade none）再加白边。
用法: python extract_sticker.py sheet.png out_dir --names cat_a cat_b [--tol 22]（按从左到右顺序命名）"""
import argparse,os
import numpy as np
from PIL import Image,ImageFilter
from scipy import ndimage
ap=argparse.ArgumentParser(); ap.add_argument("sheet"); ap.add_argument("out"); ap.add_argument("--names",nargs="+",required=True); ap.add_argument("--tol",type=float,default=22); a=ap.parse_args()
img=Image.open(a.sheet).convert("RGB"); im=np.asarray(img).astype(float)
edge=np.concatenate([im[:10].reshape(-1,3),im[-10:].reshape(-1,3),im[:,:10].reshape(-1,3),im[:,-10:].reshape(-1,3)]); bg=np.median(edge,0)
fg=ndimage.binary_opening(np.linalg.norm(im-bg,axis=2)>a.tol,iterations=2)
lab,n=ndimage.label(fg); sizes=ndimage.sum(fg,lab,range(1,n+1)); top=np.argsort(sizes)[-len(a.names):]+1
objs=sorted([(np.where(lab==t)[1].mean(),ndimage.binary_fill_holes(lab==t)) for t in top],key=lambda o:o[0])
os.makedirs(a.out,exist_ok=True)
for name,(_,m) in zip(a.names,objs):
    m=ndimage.binary_erosion(m,iterations=1); ys,xs=np.where(m)
    al=Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)); rgba=img.copy(); rgba.putalpha(al)
    out=os.path.join(a.out,name+".png"); rgba.crop((max(0,xs.min()-3),max(0,ys.min()-3),xs.max()+4,ys.max()+4)).save(out); print(out)
