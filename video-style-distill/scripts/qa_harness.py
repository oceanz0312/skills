#!/usr/bin/env python3
"""成片自动 QA 骨架。用法:
  python qa_harness.py out.mp4 --T 0.408 [--meta meta.json] [--ref-analysis ref/analysis.json] [--out qa/]
1) 用 analyze_video.py 拆自己的成片 → 节拍：事件落在 T 网格 ±1.5 帧的比例 ≥85%、事件间静止 ≥90%（定格风格）、T 误差 ≤3%
2) meta.json 里渲染器的逐帧 P0 审计（越界/遮挡/文字重叠/…）必须为 0
3) 给了参考 analysis → 结构对比：场景数、换姿势场景、硬切数、boil 态数
4) 输出 qa.json + 场景拼图 qa_sheet.jpg（交付前必须自己看一遍图）。任何 FAIL → 退出码 1。
蒸馏出的 skill 在 CHECKS 里追加风格专属检查（字体字形、抠图完整、色板偏差……）。"""
import argparse,json,os,subprocess,sys
H=os.path.dirname(os.path.abspath(__file__))
CHECKS=[]  # 追加: def f(ctx)->(name,ok,detail)
def main():
    ap=argparse.ArgumentParser();ap.add_argument("video");ap.add_argument("--T",type=float,required=True);ap.add_argument("--meta")
    ap.add_argument("--ref-analysis");ap.add_argument("--out",default="qa");ap.add_argument("--stopmotion",type=int,default=1);ap.add_argument("--allow-diff",default="",help="逗号分隔，用户要求的有意偏离（如 pose_swap_scenes），只 WARN");a=ap.parse_args()
    os.makedirs(a.out,exist_ok=True)
    subprocess.run([sys.executable,f"{H}/analyze_video.py",a.video,"--out",a.out],check=True,capture_output=True)
    A=json.load(open(f"{a.out}/analysis.json"));R=[]
    g=A["grid"] or {}
    R.append(("T 误差 ≤3%",bool(g) and abs(g["T_sec"]-a.T)/a.T<=0.03,f"测得 {g.get('T_sec')} 期望 {a.T}"))
    R.append(("事件在网格上 ≥85%",bool(g) and g["on_grid_ratio_1p5f"]>=0.85,f"{g.get('on_grid_ratio_1p5f')}"))
    if a.stopmotion: R.append(("事件间静止 ≥90%",A["hold_ratio_between_events"]>=0.9,f"{A['hold_ratio_between_events']}"))
    if a.meta:
        M=json.load(open(a.meta));v=M.get("p0_violations",[]);R.append(("渲染器 P0 审计 = 0",len(v)==0,f"{len(v)} 帧违规 {v[:2]}"))
    if a.ref_analysis:
        B=json.load(open(a.ref_analysis))
        allow=set(a.allow_diff.split(","))
        for k in ("scene_count","boil_loop_states","pose_swap_scenes"):
            if A.get(k) is None: print("WARN",k,"成片里测不出（样本不足），人工看图");continue
            same=A.get(k)==B.get(k); R.append((f"结构一致: {k}"+("（有意偏离）" if k in allow else ""),same or k in allow,f"成片 {A.get(k)} 参考 {B.get(k)}"))
        R.append(("结构一致: 硬切数",len(A["hard_cut_sec"])==len(B["hard_cut_sec"]),f"{A['hard_cut_sec']} vs {B['hard_cut_sec']}"))
    ctx=dict(video=a.video,analysis=A,args=a)
    for f in CHECKS:R.append(f(ctx))
    subprocess.run([sys.executable,f"{H}/contact_sheet.py",a.video,"--analysis",f"{a.out}/analysis.json","--out",f"{a.out}/qa_sheet.jpg"],capture_output=True)
    ok=all(r[1] for r in R)
    for n,o,d in R:print("PASS" if o else "FAIL",n,"|",d)
    json.dump(dict(ok=ok,checks=[dict(name=n,ok=o,detail=d) for n,o,d in R]),open(f"{a.out}/qa.json","w"),ensure_ascii=False,indent=1)
    print("QA","PASS" if ok else "FAIL","→ 看",f"{a.out}/qa_sheet.jpg");sys.exit(0 if ok else 1)
if __name__=="__main__":main()
