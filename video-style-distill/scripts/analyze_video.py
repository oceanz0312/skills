#!/usr/bin/env python3
"""视频节奏/结构拆解。用法:
  python analyze_video.py ref.mp4 --out analysis/ [--width 180] [--thr 1.0]
输出 analysis/analysis.json + analysis/analysis.md（每条结论都标【实测】）。
测什么：逐帧帧差 → 事件；事件间是否完全静止（定格 hold）；视觉网格周期 T（相位一致性搜索，取最长的有效周期）；
N 态 boil 循环；场景切分；A/B 姿势闪（新状态 == 两个状态前）；步进摇镜（相邻状态位移）；开场快闪段；硬切。
依赖: numpy, ffmpeg。"""
import argparse, json, os, subprocess, math
import numpy as np

def probe(path):
    o = subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries",
        "stream=width,height,r_frame_rate:format=duration","-of","json",path],capture_output=True,text=True).stdout
    j = json.loads(o); s = j["streams"][0]; n,d = s["r_frame_rate"].split("/")
    has_a = subprocess.run(["ffprobe","-v","error","-select_streams","a","-show_entries","stream=index","-of","csv=p=0",path],capture_output=True,text=True).stdout.strip()!=""
    return dict(width=s["width"],height=s["height"],fps=float(n)/float(d),duration=float(j["format"]["duration"]),has_audio=has_a)

def frames(path,w,h):
    p = subprocess.Popen(["ffmpeg","-v","error","-i",path,"-vf",f"scale={w}:{h}","-f","rawvideo","-pix_fmt","rgb24","-"],stdout=subprocess.PIPE)
    sz = w*h*3; out=[]
    while True:
        b = p.stdout.read(sz)
        if len(b)<sz: break
        out.append(np.frombuffer(b,np.uint8).reshape(h,w,3))
    return np.stack(out)

def chg(a,b,t=12):  # 变化像素占比 %
    return float((np.abs(a.astype(np.int16)-b.astype(np.int16)).max(-1)>t).mean()*100)

def bbox(a,b,t=12):
    m = np.abs(a.astype(np.int16)-b.astype(np.int16)).max(-1)>t
    if not m.any(): return None
    ys,xs = np.where(m); H,W = m.shape
    return [round(xs.min()/W,2),round(ys.min()/H,2),round((xs.max()+1)/W,2),round((ys.max()+1)/H,2)]

def coarse(a,g=12):
    h,w=a.shape[:2]; a=a[:h//g*g,:w//g*g].astype(np.float32).mean(-1)
    return a.reshape(h//g,g,w//g,g).mean((1,3))
def cdiff(a,b): return float(np.abs(coarse(a)-coarse(b)).mean())  # 粗粒度差：boil 小抖动被平均掉，换姿势/换画面保留

def pan_check(A,B,max_frac=0.45):
    """相位相关估位移，再在重叠区比对。返回 (dx,dy,overlap_diff%)；overlap 小 = 同一张画布在平移（步进摇镜），大 = 硬切。"""
    a=A.mean(-1);b=B.mean(-1);H,W=a.shape
    R=np.fft.ifft2(np.fft.fft2(a)*np.conj(np.fft.fft2(b)));y,x=np.unravel_index(np.abs(R).argmax(),R.shape)
    dy=y if y<H/2 else y-H; dx=x if x<W/2 else x-W
    if abs(dx)>W*max_frac or abs(dy)>H*max_frac: return dx,dy,100.0
    ya,yb=(slice(dy,H),slice(0,H-dy)) if dy>=0 else (slice(0,H+dy),slice(-dy,H))
    xa,xb=(slice(dx,W),slice(0,W-dx)) if dx>=0 else (slice(0,W+dx),slice(-dx,W))
    return dx,dy,chg(A[ya,xa],B[yb,xb],24)

def grid_period(ev_frames,fps,lo=0.15,hi=1.5):
    """相位一致性：对每个候选 T 求 |mean(exp(2πi f/T))|。T/2、T/3 也会高分，所以取分数 ≥0.9·max 的最长 T。"""
    f = np.array(ev_frames,float); best=[]
    for T in np.arange(lo*fps,hi*fps,0.01):
        z = np.exp(2j*np.pi*f/T).mean(); best.append((T,abs(z),np.angle(z)))
    mx = max(b[1] for b in best)
    cand = [b for b in best if b[1]>=0.9*mx]; T,sc,ph = max(cand,key=lambda b:b[0])
    # 局部精修
    loc = [b for b in best if abs(b[0]-T)<0.3]; T,sc,ph = max(loc,key=lambda b:b[1])
    t0 = (ph/(2*np.pi)*T)%T
    res = [((x-t0+T/2)%T)-T/2 for x in f]
    return dict(T_frames=round(T,2),T_sec=round(T/fps,4),coherence=round(sc,3),t0_frame=round(t0,2),
                bpm_if_eighth=round(60/(T/fps)/2,2),bpm_if_quarter=round(60/(T/fps),2),
                residual_frames_median=round(float(np.median(np.abs(res))),2),
                on_grid_ratio_1p5f=round(float(np.mean(np.abs(res)<=1.5)),3))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--out",default="analysis")
    ap.add_argument("--width",type=int,default=180); ap.add_argument("--thr",type=float,default=1.0)
    ap.add_argument("--cut",type=float,default=80.0,help="帧差%%≥此值且新画面不回到最近状态 → 硬切/大转场")
    a = ap.parse_args(); os.makedirs(a.out,exist_ok=True)
    m = probe(a.video); W=a.width; H=int(round(W*m["height"]/m["width"]/2)*2)
    F = frames(a.video,W,H); fps=m["fps"]; n=len(F)
    d = [0.0]+[chg(F[i],F[i-1]) for i in range(1,n)]
    ev = [i for i in range(1,n) if d[i]>a.thr]
    np.save(os.path.join(a.out,"diff.npy"),np.array(d))
    # 定格：非事件帧的帧差
    quiet = [d[i] for i in range(1,n) if d[i]<=a.thr]
    hold_ratio = float(np.mean(np.array(quiet)<0.2)) if quiet else 0
    # 开场快闪：前 2s 内间隔 ≤2 帧的事件
    intro=[e for e in ev if e<2*fps]; gaps=np.diff(intro) if len(intro)>1 else []
    fast=[intro[i+1] for i,g in enumerate(gaps) if g<=2]
    intro_end = (max(fast)+1) if len(fast)>=3 else 0
    body_ev=[e for e in ev if e>=intro_end]
    g = grid_period(body_ev,fps) if len(body_ev)>=6 else None
    # 每个事件后的"保持状态"
    states=[(e,F[min(e+1,n-1)]) for e in [0]+ev]
    info=[]
    for k in range(1,len(states)):
        e,S=states[k]; prev=[chg(S,states[k-j][1]) for j in range(1,min(7,k+1))]
        cprev=[cdiff(S,states[k-j][1]) for j in range(1,min(7,k+1))]
        info.append(dict(frame=e,t=round(e/fps,3),diff=round(d[e],1),bbox=bbox(F[e],F[e-1]),back=[round(x,1) for x in prev],cback=[round(x,1) for x in cprev]))
    # 分类
    Tf = g["T_frames"] if g else fps*0.4
    for x in info:
        cb=x["cback"]; x["new_content"]=min(cb)>=15
        if x["frame"]<intro_end: x["kind"]="intro_fx"
        elif x["diff"]>=50 and x["new_content"]: x["kind"]="transition_step"
        elif min(cb)<8 and cb[0]>=12: x["kind"]="pose_swap"            # 同场景里换姿势（粗粒度大变、但最近 6 个状态里有相似的）
        elif cb[0]<8 and x["diff"]>=8: x["kind"]="boil"                   # 全幅小抖动
        elif x["bbox"] and (x["bbox"][3]-x["bbox"][1])<0.5: x["kind"]="local"  # 局部（常是文字层自己的时钟）
        else: x["kind"]="other"
    # 转场分组：间隔 ≤1.5T 的连续 transition_step；≥2 步 = 步进摇镜/分拍转场，1 步 = 硬切
    groups=[]
    for x in info:
        if x["kind"]!="transition_step": continue
        if groups and x["frame"]-groups[-1][-1]["frame"]<=1.5*Tf: groups[-1].append(x)
        else: groups.append([x])
    pans=[];hard=[];steps=[]
    for gr in groups:
        for x in gr:
            dx,dy,ov=pan_check(F[x["frame"]-1],F[x["frame"]]); x["shift_px_at_src"]=[round(-dx*m["width"]/W),round(-dy*m["width"]/W)]; x["overlap_diff"]=round(ov,1)
        if len(gr)>=2: pans.append(gr); steps+= [float(np.hypot(*x["shift_px_at_src"])) for x in gr]
        else: hard.append(gr[0]["frame"])
    scene_starts=[0]+[gr[-1]["frame"] for gr in groups]
    ends=scene_starts[1:]+[n]
    scenes=[]
    for s0,s1 in zip(scene_starts,ends):
        inside=[x for x in info if s0<x["frame"]<s1]
        ps=[x for x in inside if x["kind"]=="pose_swap"]
        # 场景内不同"粗粒度状态"的数量
        sts=[F[min(s0+1,n-1)]]+[F[min(x["frame"]+1,n-1)] for x in inside if x["kind"] in ("pose_swap","boil")]
        uniq=[]
        for S in sts:
            if all(cdiff(S,u)>2.5 for u in uniq): uniq.append(S)
        scenes.append(dict(start=round(s0/fps,3),end=round(s1/fps,3),len_T=round((s1-s0)/Tf,1),pose_swaps=len(ps),
            pose_swap_region=ps[0]["bbox"] if ps else None,coarse_states=len(uniq),
            boil_events=sum(1 for x in inside if x["kind"]=="boil"),local_events=sum(1 for x in inside if x["kind"]=="local")))
    # boil 循环长度：只看 boil 事件连续的段，state[k] vs state[k+L]
    loop={}
    for L in (2,3,4):
        v=[chg(states[k][1],states[k+L][1]) for k in range(1,len(states)-L) if all(info[j]["kind"]=="boil" for j in range(k-1,k+L-1))]
        if v: loop[L]=round(float(np.median(v)),2)
    loopN=min(loop,key=loop.get) if loop else None
    # 局部层自己的时钟（如文字 boil）
    loc=[x["frame"] for x in info if x["kind"]=="local"]; li=[b_-a_ for a_,b_ in zip(loc,loc[1:]) if b_-a_<2*Tf]
    local_clock=round(float(np.median(li)),1) if li else None
    res=dict(meta=m,analysis_size=[W,H],n_frames=n,events=len(ev),hold_ratio_between_events=round(hold_ratio,3),
             intro_fast_segment_end_sec=round(intro_end/fps,3),grid=g,boil_loop_median_diff=loop,boil_loop_states=loopN,
             local_layer_clock_frames=local_clock,scene_count=len(scenes),scenes=scenes,
             pose_swap_scenes=[i+1 for i,x in enumerate(scenes) if x["pose_swaps"]>=2],
             stepped_transitions=[[round(x["frame"]/fps,3) for x in gr] for gr in pans],
             pan_step_px_median=round(float(np.median(steps)),1) if steps else None,
             hard_cut_sec=[round(f/fps,3) for f in hard],
             kind_counts={k:sum(1 for x in info if x["kind"]==k) for k in sorted({x["kind"] for x in info})},events_detail=info)
    json.dump(res,open(os.path.join(a.out,"analysis.json"),"w"),ensure_ascii=False,indent=1)
    L=[f"# 视频拆解【实测】 {os.path.basename(a.video)}",f"- 时长 {m['duration']:.2f}s，{m['width']}×{m['height']}，{fps:g}fps，音频={m['has_audio']}",
       f"- 事件（帧差>{a.thr}%）{len(ev)} 个；事件之间静止帧占比 {hold_ratio:.0%}（≥90% = 定格 hold，不是连续运动）",
       f"- 开场快闪段：0–{intro_end/fps:.2f}s" if intro_end else "- 无开场快闪段"]
    if g: L.append(f"- 视觉网格 T = {g['T_frames']} 帧 = {g['T_sec']}s（一致性 {g['coherence']}，{g['on_grid_ratio_1p5f']:.0%} 事件落在 ±1.5 帧内；若 T=八分音符 → {g['bpm_if_eighth']} BPM）")
    L+= [f"- boil 循环：{loopN} 态（state[k] vs state[k+L] 中位帧差 {loop}）；局部层（文字等）自有时钟 ≈{local_clock} 帧",
         f"- 场景 {len(scenes)} 个（S1…）；换姿势（A/B）的场景：{['S%d'%i for i in res['pose_swap_scenes']]}",
         f"- 分拍转场 {len(pans)} 组，步数 {[len(x) for x in pans]}，每步约 {res['pan_step_px_median']}px@原片；单步硬切 {res['hard_cut_sec']}",
         f"- 事件分类 {res['kind_counts']}","","| 场景 | 起 | 止 | 长(T) | 换姿势 | 粗状态数 | boil | 局部 |","|---|---|---|---|---|---|---|---|"]
    L+= [f"| S{i+1} | {x['start']} | {x['end']} | {x['len_T']} | {x['pose_swaps']} | {x['coarse_states']} | {x['boil_events']} | {x['local_events']} |" for i,x in enumerate(scenes)]
    open(os.path.join(a.out,"analysis.md"),"w").write("\n".join(L)+"\n"); print("\n".join(L))
if __name__=="__main__": main()
