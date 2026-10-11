#!/usr/bin/env python3
"""成片 QA（video-style-distill 的 qa_harness 改写）。本风格：--T 0.04 --stopmotion 0 --no-grid（不是定格网格风格），节奏改由 CHECKS 里的逐镜切点对比判定。
原骨架说明：用法:
  python qa_harness.py out.mp4 --T 0.408 [--meta meta.json] [--ref-analysis ref/analysis.json] [--out qa/]
1) 用 analyze_video.py 拆自己的成片 → 节拍：事件落在 T 网格 ±1.5 帧的比例 ≥85%、事件间静止 ≥90%（定格风格）、T 误差 ≤3%
2) meta.json 里渲染器的逐帧 P0 审计（越界/遮挡/文字重叠/…）必须为 0
3) 给了参考 analysis → 结构对比：场景数、换姿势场景、硬切数、boil 态数
4) 输出 qa.json + 场景拼图 qa_sheet.jpg（交付前必须自己看一遍图）。任何 FAIL → 退出码 1。
蒸馏出的 skill 在 CHECKS 里追加风格专属检查（字体字形、抠图完整、色板偏差……）。"""
import argparse,json,os,subprocess,sys
H=os.path.dirname(os.path.abspath(__file__))
CHECKS=[]  # 追加: def f(ctx)->(name,ok,detail)
import re,csv
import numpy as np
sys.path.insert(0,H)
from common import grab,detect_arc,arc_ok
def _cuts(ctx):
    if "cuts" not in ctx:
        log=subprocess.run(["ffmpeg","-hide_banner","-i",ctx["video"],"-vf","select='gt(scene,0.08)',metadata=print","-an","-f","null","-"],capture_output=True,text=True).stderr
        sc={round(float(t)*25):float(v) for t,v in re.findall(r"pts_time:([\d.]+)\s*\n.*?scene_score=([\d.]+)",log)}
        ctx["ref"]=[int(r["start_f"]) for r in csv.DictReader(open(ctx["args"].ref_shots))][1:]
        ctx["total"]=round(float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",ctx["video"]],capture_output=True,text=True).stdout)*25)
        k=ctx["total"]/500;hits,dev=[],[]
        for r in ctx["ref"]:
            near=[(abs(f-r*k),f) for f,v in sc.items() if abs(f-r*k)<=3 and v>=0.1]
            if near: d,f=min(near);hits.append(f);dev.append(d)
            else: dev.append(99)
        ctx["hits"]=hits;ctx["dev"]=dev
        ctx["extras"]=[f for f,v in sc.items() if v>=0.3 and all(abs(f-h)>3 for h in hits)]
        ctx["cuts"]=sorted(hits)
    return ctx
def c_cut_count(ctx):
    _cuts(ctx);n=len(ctx["hits"]);x=ctx["extras"]
    return ("P0-3 硬切：参考切点命中 ≥33/34 且多余强切 ≤2",n>=len(ctx["ref"])-1 and len(x)<=2,f"命中 {n}/{len(ctx['ref'])}，多余 {x}")
def c_cut_dev(ctx):
    _cuts(ctx);d=[x for x in ctx["dev"] if x<99]
    return ("P0-3 命中切点偏差 ≤2 帧",bool(d) and max(d)<=2,f"max {max(d) if d else None} 帧")
def c_arc(ctx):
    _cuts(ctx);b=[0]+ctx["cuts"]+[ctx["total"]];S=[]
    for i in range(len(b)-2):
        g=grab(ctx["video"],(b[i]+b[i+1])/50);r=detect_arc(g) if g is not None else None;S.append(r if arc_ok(r)[0] else None)
    good=[r for r in S if r];rate=len(good)/max(1,len(S));ys=[r["apex_y"] for r in good]
    j=[abs(p["apex_y"]-q["apex_y"]) for p,q in zip(S,S[1:]) if p and q];p90=float(np.percentile(j,90)) if j else 1
    ok=bool(ys) and rate>=.65 and .42<=np.median(ys)<=.54 and p90<=.10
    return ("P0-1 弧线连续（合格率≥0.65、中位y 0.42–0.54、相邻跳变P90≤0.10）",bool(ok),f"rate {rate:.2f} median {np.median(ys) if ys else None} p90 {p90:.3f}")
def c_end(ctx):
    _cuts(ctx);g=grab(ctx["video"],max(0,ctx["total"]/25-.1))
    return ("P0-6 末帧停在光弧上（不黑场）",g is not None and g.mean()>=25,f"末帧亮度 {None if g is None else round(g.mean(),1)}")
CHECKS+=[c_cut_count,c_cut_dev,c_arc,c_end]
def main():
    ap=argparse.ArgumentParser();ap.add_argument("video");ap.add_argument("--T",type=float,required=True);ap.add_argument("--meta")
    ap.add_argument("--ref-analysis");ap.add_argument("--out",default="qa");ap.add_argument("--stopmotion",type=int,default=1);ap.add_argument("--no-grid",action="store_true");ap.add_argument("--ref-shots",default=os.path.join(H,"..","references","reference_shots.csv"));ap.add_argument("--allow-diff",default="",help="逗号分隔，用户要求的有意偏离（如 pose_swap_scenes），只 WARN");a=ap.parse_args()
    os.makedirs(a.out,exist_ok=True)
    subprocess.run([sys.executable,f"{H}/analyze_video.py",a.video,"--out",a.out],check=True,capture_output=True)
    A=json.load(open(f"{a.out}/analysis.json"));R=[]
    g=A["grid"] or {}
    if not a.no_grid: R.append(("T 误差 ≤3%",bool(g) and abs(g["T_sec"]-a.T)/a.T<=0.03,f"测得 {g.get('T_sec')} 期望 {a.T}"))
    if not a.no_grid: R.append(("事件在网格上 ≥85%",bool(g) and g["on_grid_ratio_1p5f"]>=0.85,f"{g.get('on_grid_ratio_1p5f')}"))
    if a.stopmotion: R.append(("事件间静止 ≥90%",A["hold_ratio_between_events"]>=0.9,f"{A['hold_ratio_between_events']}"))
    if a.meta:
        M=json.load(open(a.meta));v=M.get("p0_violations",[]);R.append(("渲染器 P0 审计 = 0",len(v)==0,f"{len(v)} 帧违规 {v[:2]}"))
    if a.ref_analysis:
        B=json.load(open(a.ref_analysis))
        allow=set(a.allow_diff.split(","))
        for k in ("scene_count","boil_loop_states","pose_swap_scenes"):
            if A.get(k) is None: print("WARN",k,"成片里测不出（样本不足），人工看图");continue
            same=A.get(k)==B.get(k); R.append((f"结构一致: {k}"+("（有意偏离）" if k in allow else ""),same or k in allow,f"成片 {A.get(k)} 参考 {B.get(k)}"))
        R.append(("结构一致: 硬切数"+("（有意偏离）" if "hard_cut_sec" in allow else ""),len(A["hard_cut_sec"])==len(B["hard_cut_sec"]) or "hard_cut_sec" in allow,f"{A['hard_cut_sec']} vs {B['hard_cut_sec']}"))
    ctx=dict(video=a.video,analysis=A,args=a)
    for f in CHECKS:R.append(f(ctx))
    subprocess.run([sys.executable,f"{H}/contact_sheet.py",a.video,"--analysis",f"{a.out}/analysis.json","--out",f"{a.out}/qa_sheet.jpg"],capture_output=True)
    ok=all(r[1] for r in R)
    for n,o,d in R:print("PASS" if o else "FAIL",n,"|",d)
    json.dump(dict(ok=bool(ok),checks=[dict(name=n,ok=bool(o),detail=str(d)) for n,o,d in R]),open(f"{a.out}/qa.json","w"),ensure_ascii=False,indent=1)
    print("QA","PASS" if ok else "FAIL","→ 看",f"{a.out}/qa_sheet.jpg");sys.exit(0 if ok else 1)
if __name__=="__main__":main()
