#!/usr/bin/env python3
"""成片 QA：检查定格网格、静止帧、A/B 事件，并和参考片出对比拼图。
用法: python qa_compare.py out.mp4 [--ref ref.mp4] [--T 12.25] [--sheet qa_sheet.jpg]
依赖: ffmpeg, numpy, pillow。"""
import argparse, subprocess, numpy as np, json
from PIL import Image
LAND={'S1':0,'S2':65,'S3':126,'S4':272,'S5':382,'S6':492,'S7':602,'S8':712,'S9':822,'S10':1006}
def frames(p,W=180,H=320):
    raw=subprocess.run(['ffmpeg','-loglevel','error','-i',p,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw,np.uint8).reshape(-1,H,W,3).astype(np.int16)
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--ref"); ap.add_argument("--T",type=float,default=12.25); ap.add_argument("--sheet",default="qa_sheet.jpg"); a=ap.parse_args()
    v=frames(a.out); d=np.array([np.abs(v[i]-v[i-1]).mean() for i in range(1,len(v))])
    ev=np.where(d>1.0)[0]+1; still=d[d<=1.0]
    rep={"frames":int(len(v)),"events":int(len(ev)),"still_mean_diff":round(float(still.mean()) if len(still) else 0,3)}
    # 网格拟合：只用主 boil 级别的事件（帧差 >8）
    big=ev[(d[ev-1]>8)&(ev>=65)].astype(float)  # 跳过 TV 开场（不在网格上）
    if len(big)>=4:
        k=np.round((big-big[0])/a.T); A=np.c_[np.ones_like(k),k]; (t0,step),*_=np.linalg.lstsq(A,big,rcond=None)
        res=np.abs(big-(t0+step*k)); rep.update(grid_step=round(float(step),3),grid_t0=round(float(t0),2),max_residual=round(float(res.max()),2))
    else: rep.update(grid_step=None,max_residual=None)
    checks=[]
    checks.append(("静止帧差 <0.2", rep["still_mean_diff"]<0.2))
    if rep["grid_step"]: checks.append((f"网格步长 {a.T}±0.1", abs(rep["grid_step"]-a.T)<=0.1)); checks.append(("最大残差 ≤1.5 帧", rep["max_residual"]<=1.5))
    rep["checks"]=[{"name":n,"pass":bool(p)} for n,p in checks]
    if a.ref:
        r=frames(a.ref); W,H=180,320; sheet=Image.new('RGB',(W*10,H*2),'white')
        for i,(sid,f) in enumerate(LAND.items()):
            for row,src in enumerate((v,r)):
                ff=min(int((f+3)*len(src)/1153),len(src)-1); sheet.paste(Image.fromarray(src[ff].astype(np.uint8)),(i*W,row*H))
        sheet.save(a.sheet,quality=85); rep["sheet"]=a.sheet+"（上：成片，下：参考片）"
    print(json.dumps(rep,ensure_ascii=False,indent=1))
if __name__=="__main__": main()
