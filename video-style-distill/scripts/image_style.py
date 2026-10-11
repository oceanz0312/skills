#!/usr/bin/env python3
"""非视频输入（图片、设计稿导出、品牌手册页、海报、截图）的风格测量 + 推导动效默认值。
  python image_style.py imgs/*.png [--pdf brand.pdf] --out analysis/ 
测【实测】：画幅比、色板（调用 palette.py 同一算法）、平涂面积占比、边缘密度、颗粒/噪点强度、饱和度、留白率、
  明暗对比、主要构图重心、是否有描边/白边（亮边环）。
推【推】：没有时间轴时的节奏与动效默认值（T、场景长度、转场、boil 幅度），规则写在 references/non_video_inputs.md，
  这里按测量结果给出一份 derived_defaults，所有值都要在 SKILL 里标成"可调默认"，不是硬锁。"""
import argparse,json,os,subprocess,glob,sys
import numpy as np
from PIL import Image,ImageFilter
import importlib.util
spec=importlib.util.spec_from_file_location("palette",os.path.join(os.path.dirname(os.path.abspath(__file__)),"palette.py"));pl=importlib.util.module_from_spec(spec);spec.loader.exec_module(pl)
def measure(im):
    im=im.convert("RGB"); im.thumbnail((720,720)); a=np.asarray(im).astype(float)/255; g=a.mean(-1)
    ed=np.asarray(im.convert("L").filter(ImageFilter.FIND_EDGES)).astype(float)/255
    blur=np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(2))).astype(float)/255
    mx,mn=a.max(-1),a.min(-1); sat=np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0)
    _,flat,fr=pl.analyse(im)
    white=float(((g>0.92)&(sat<0.08)).mean())
    ys,xs=np.mgrid[:g.shape[0],:g.shape[1]]; w=ed+1e-6
    return dict(size=im.size,aspect=round(im.size[0]/im.size[1],3),edge_density=round(float((ed>0.15).mean()),3),
        grain=round(float(np.median(np.abs(g-blur)[ed<0.05])) if (ed<0.05).any() else 0.0,4),saturation=round(float(sat.mean()),3),whitespace=round(white,3),
        contrast=round(float(g.std()),3),flat_area_ratio=round(fr,3),
        visual_center=[round(float((xs*w).sum()/w.sum()/g.shape[1]),2),round(float((ys*w).sum()/w.sum()/g.shape[0]),2)])
def derive(ms):
    m={k:float(np.median([x[k] for x in ms])) for k in ("edge_density","grain","saturation","whitespace","flat_area_ratio","contrast")}
    d={"source":"推导自静态图（无时间轴）——全部是可调默认，不是硬锁"}
    # 节奏：画面越"满"、越硬朗 → 越快；越留白、越柔 → 越慢
    busy=m["edge_density"]+0.5*m["saturation"]-0.6*m["whitespace"]
    d["T_sec"]=0.33 if busy>0.35 else (0.42 if busy>0.18 else 0.55)
    d["scene_len_T"]=8 if d["T_sec"]<0.5 else 6
    d["motion_mode"]="stop-motion boil（定格换帧）" if m["grain"]>0.02 else "平滑缓动（矢量/扁平 UI 风）"
    d["boil_px_at_1080w"]=round(4+min(10,m["grain"]*300),1) if "boil" in d["motion_mode"] else 0
    d["transition"]="硬切 + 分拍推移" if m["contrast"]>0.22 else "遮罩擦除 / 色块推入"
    d["text_density"]="一屏一句" if m["whitespace"]>0.25 else "可承载 2–3 行信息"
    d["texture"]="叠纸纹/颗粒" if m["grain"]>0.02 else "干净平涂"
    d["measured_median"]={k:round(v,4) for k,v in m.items()}
    return d
def main():
    ap=argparse.ArgumentParser();ap.add_argument("imgs",nargs="*");ap.add_argument("--pdf");ap.add_argument("--out",default="analysis");a=ap.parse_args()
    os.makedirs(a.out,exist_ok=True); paths=list(a.imgs)
    if a.pdf:
        subprocess.run(["pdftoppm","-r","72","-png",a.pdf,os.path.join(a.out,"pdfpage")],check=True); paths+=sorted(glob.glob(os.path.join(a.out,"pdfpage*.png")))
    ms=[]; per={}
    for p in paths: r=measure(Image.open(p)); per[os.path.basename(p)]=r; ms.append(r)
    subprocess.run([sys.executable,os.path.join(os.path.dirname(os.path.abspath(__file__)),"palette.py"),*paths,"--out",os.path.join(a.out,"palette.json"),"--swatch",os.path.join(a.out,"palette.png")])
    res=dict(per_image=per,derived_defaults=derive(ms)); json.dump(res,open(os.path.join(a.out,"image_style.json"),"w"),ensure_ascii=False,indent=1)
    print(json.dumps(res["derived_defaults"],ensure_ascii=False,indent=1))
if __name__=="__main__":main()
