#!/usr/bin/env python3
"""人物抠图 + 手账白边。用法: python cutout.py in.jpg out.png [--width 1080] [--no-rembg]
白边 = 输出画面宽度的 0.97%（720 宽→7px，1080 宽→10px）【实测】；外圈 1.5px rgba(0,0,0,.25) 暗边【实测：几乎无投影】。
依赖: pillow, numpy；rembg 可选（不装或 --no-rembg 时要求输入已是带 alpha 的 PNG）。"""
import argparse, numpy as np
from PIL import Image, ImageFilter

def dilate(mask, r):
    return mask.filter(ImageFilter.MaxFilter(2*r+1)) if r>0 else mask

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--width",type=int,default=1080,help="成片宽度，用来换算白边 px"); ap.add_argument("--no-rembg",action="store_true")
    ap.add_argument("--border",type=int,default=None); a=ap.parse_args()
    im=Image.open(a.inp)
    if not a.no_rembg and im.mode!="RGBA":
        from rembg import remove, new_session
        im=remove(im, session=new_session("isnet-general-use"))
    im=im.convert("RGBA")
    al=im.split()[3].point(lambda v:255 if v>127 else 0)
    al=al.filter(ImageFilter.MinFilter(3))                         # 腐蚀 1px 去毛边
    # 白边 px 以"人物在成片里的尺寸"为准：假设人物贴纸宽度约 0.5W
    scale=im.width/(0.5*a.width)
    b=a.border if a.border is not None else max(1,round(0.0097*a.width*scale))
    pad=b+4; W,H=im.width+2*pad,im.height+2*pad
    base=Image.new("L",(W,H),0); base.paste(al,(pad,pad))
    white=dilate(base,b).filter(ImageFilter.GaussianBlur(1)).point(lambda v:255 if v>100 else 0)  # 圆角
    rim=dilate(white,max(1,round(1.5*scale))); out=Image.new("RGBA",(W,H),(0,0,0,0))
    out.paste(Image.new("RGBA",(W,H),(0,0,0,64)),(0,0),rim)
    out.paste(Image.new("RGBA",(W,H),(247,245,242,255)),(0,0),white)
    body=Image.new("RGBA",(W,H),(0,0,0,0)); body.paste(im,(pad,pad)); m=Image.new("L",(W,H),0); m.paste(al,(pad,pad))
    out.paste(body,(0,0),m); out.save(a.out)
    print(f"saved {a.out} size={out.size} border={b}px(源图尺度)")
if __name__=="__main__": main()
