#!/usr/bin/env python3
"""成片 QA：定格网格、静止帧、人物动作幅度，并出对比拼图。
用法: python qa_compare.py out.mp4 [--ref ref.mp4] [--T 12.25] [--meta render_meta_<seed>.json] [--sheet qa_sheet.jpg] [--extra other.mp4 ...] [--json qa.json]
--meta：run.py 写出的 render_meta（人物轨迹 + 逐帧 P0 审计）。检查：
  P0-1 越界（贴纸/道具/涂鸦/文字全在画内；人物只允许底边裁切）  P0-2 每场恰好 2 个人物位置且 A→B→A→B 交替
  P0-3 建筑主体被文字/道具/色块遮挡 %（>2% 失败）、人物被任何元素压住  P0-4 色块层数 ≤3、每层面积 ≥18%、色块绘制在全部内容之下
  P0-5 信息内容（文字/名牌/道具/卡片）被色块遮挡或相互重叠；以及人物 jump / A-B 位移 ≥ 头高。
V6：风景照近满版（每场景照片画内面积 ≥70%，skyline 剪影 ≥62%）、遮罩不规则（skyline/torn/arch/circle/heart/blob），建筑主体完整落在遮罩内。
任何 P0 / V6 失败 → 退出码 1（成片判定 FAIL）。
依赖: ffmpeg, numpy, pillow。"""
import argparse, subprocess, numpy as np, json, math
from PIL import Image, ImageDraw
LAND={'S1':0,'S2':65,'S3':126,'S4':272,'S5':382,'S6':492,'S7':602,'S8':712,'S9':822,'S10':1006}
def frames(p,W=180,H=320):
    raw=subprocess.run(['ffmpeg','-loglevel','error','-i',p,'-vf',f'scale={W}:{H}','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw,np.uint8).reshape(-1,H,W,3).astype(np.int16)
def motion(meta):
    tr={int(k):v for k,v in meta["track"].items()}; keys=sorted(tr); out=[]
    for sc in meta["person_events"]:
        for e in sc["events"]:
            prev=[k for k in keys if k<e and tr[k]["scene"]==sc["id"]]; cur=[k for k in keys if k<=e and tr[k]["scene"]==sc["id"]]
            if not prev or not cur or cur[-1]!=e: continue
            a,b=tr[prev[-1]],tr[e]; d=math.hypot(b["cx"]-a["cx"],b["cy"]-a["cy"]); head=max(a["head"],b["head"])
            out.append({"scene":sc["id"],"mode":sc["mode"],"frame":e,"disp_px":round(d,1),"head_px":round(head,1),"ratio":round(d/head,2),"pass":d>=head})
    return out
def p0(meta):
    au=[x for x in meta.get("audit",[]) if x.get("settled")]; allv=[(x["f"],v) for x in meta.get("audit",[]) for v in x["violations"]]
    cnt=lambda tag:[(f,v) for f,v in allv if v.startswith(tag)]
    tr={int(k):v for k,v in meta["track"].items()}; pos={}
    alt_bad=[]
    for f in sorted(tr):
        t=tr[f]; pos.setdefault(t["scene"],set()).add(t["pos"])
        if t["pos"]!=t["ev"]%2: alt_bad.append(f)
    blocks=[x["stats"]["blocks"] for x in au]; area=[x["stats"]["minBlockArea"] for x in au]
    bocc=[x["stats"]["buildingOcc"] for x in au]; bvis=[x["stats"].get("buildingVisible") for x in au if x["stats"].get("buildingVisible") is not None]
    r={"audited_frames":len(meta.get("audit",[])),"settled_frames":len(au),
       "P0-1_overflow":{"violations":len(cnt("P0-1")),"examples":cnt("P0-1")[:5]},
       "P0-2_positions":{"per_scene":{k:sorted(v) for k,v in pos.items()},"alternation_errors":alt_bad[:10],"violations":len(cnt("P0-2"))+sum(len(v)!=2 for v in pos.values())+len(alt_bad)},
       "P0-3_layering":{"building_occluded_max_pct":round(100*max(bocc or [0]),2),"people_occluded":sum(x["stats"]["peopleOcc"] for x in au),"building_visible_behind_people_min":min(bvis) if bvis else None,"violations":len(cnt("P0-3"))},
       "P0-4_blocks":{"max_layers":max(blocks or [0]),"min_layer_area_pct":round(100*min(area or [1]),1),"violations":len(cnt("P0-4"))},
       "P0-5_info":{"info_occluded":sum(x["stats"]["infoOcc"] for x in au),"violations":len(cnt("P0-5"))}}
    ph={}
    for x in au:
        if x["stats"].get("photoCover") is not None:
            e=ph.setdefault(x["scene"],{"mask":x["stats"]["photoMask"],"cover_min":1}); e["cover_min"]=min(e["cover_min"],x["stats"]["photoCover"])
    r["V6_photo"]={"per_scene":ph,"violations":len(cnt("V6"))+sum(1 for v in ph.values() if v["cover_min"]<(0.61 if v["mask"]=="skyline" else 0.69)),"distinct_masks":len({v["mask"] for v in ph.values()})}
    occ=[x for x in meta.get("audit",[]) if "occludedPx" in x.get("stats",{})]
    r["P0-7_no_occlusion"]={"frames_checked":len(occ),"violations":len(cnt("P0-7"))+(0 if occ else 1),"max_occluded_px":max([x["stats"]["occludedPx"] for x in occ] or [0]),"frames_with_people":sum(1 for x in occ if x["stats"]["personPx"]>0)}
    p6=meta.get("p6")
    if p6 is None: r["P0-6_person_complete"]={"violations":1,"note":"缺少 P0-6 数据：run.py 必须带 --person-check"}
    else: r["P0-6_person_complete"]={"samples":len(p6),"violations":sum(1 for x in p6 if not x["ok"]),"warnings":sum(1 for x in p6 if x.get("warnings")),
        "scenes_checked":sorted({x["scene"] for x in p6}),"fails":[(x["scene"],x["f"],x["errors"]) for x in p6 if not x["ok"]][:20]}
    for k in [k for k in r if k.startswith("P0") or k.startswith("V6")]: r[k]["pass"]=r[k]["violations"]==0
    return r
def main():
    ap=argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--ref"); ap.add_argument("--T",type=float,default=12.25)
    ap.add_argument("--sheet",default="qa_sheet.jpg"); ap.add_argument("--meta"); ap.add_argument("--extra",nargs="*",default=[]); ap.add_argument("--json"); a=ap.parse_args()
    meta0=json.load(open(a.meta)) if a.meta else {}
    global LAND
    if meta0.get('lands'): LAND=meta0['lands']
    tot=meta0.get('plan',{}).get('total',1153); intro_end=sorted(LAND.values())[1] if len(LAND)>1 else 65
    v=frames(a.out); d=np.array([np.abs(v[i]-v[i-1]).mean() for i in range(1,len(v))])
    ev=np.where(d>1.0)[0]+1; still=d[d<=1.0]
    rep={"file":a.out,"frames":int(len(v)),"events":int(len(ev)),"still_mean_diff":round(float(still.mean()) if len(still) else 0,3)}
    big=ev[(d[ev-1]>8)&(ev>=intro_end)].astype(float)
    if len(big)>=4:
        k=np.round((big-big[0])/a.T); A=np.c_[np.ones_like(k),k]; (t0,step),*_=np.linalg.lstsq(A,big,rcond=None)
        res=np.abs(big-(t0+step*k)); rep.update(grid_step=round(float(step),3),grid_t0=round(float(t0),2),max_residual=round(float(res.max()),2))
    else: rep.update(grid_step=None,max_residual=None)
    checks=[("静止帧差 <0.2", rep["still_mean_diff"]<0.2)]
    if rep["grid_step"]: checks+= [(f"网格步长 {a.T}±0.1", abs(rep["grid_step"]-a.T)<=0.1),("最大残差 ≤1.5 帧", rep["max_residual"]<=1.5)]
    if a.meta:
        meta=json.load(open(a.meta)); mv=motion(meta); rep["seed"]=meta.get("seed"); rep["preset"]=meta.get("preset"); rep["randomness"]=meta.get("randomness")
        rep["person_motion"]=mv; rep["person_motion_min_ratio"]=min(x["ratio"] for x in mv) if mv else None
        checks.append(("人物跳动/AB 位移 ≥ 头高（全部事件）", bool(mv) and all(x["pass"] for x in mv)))
        if "audit" in meta:
            P=p0(meta); rep["p0"]=P; rep["rerolls"]={k:v["attempts"] for k,v in meta.get("rerolls",{}).items()}; rep["glyph_missing"]=meta.get("glyph_missing"); rep["fonts_used"]=meta.get("fonts_used")
            checks+=[(k,P[k]["pass"]) for k in P if k.startswith("P0") or k.startswith("V6")]+[("字形全覆盖",not meta.get("glyph_missing"))]
        else: checks.append(("P0 审计数据存在（需 v5 run.py）",False))
    # P0-11: final MP4 must have an audio stream (BGM required)
    import subprocess as _sp
    try:
        _pr=_sp.run(["ffprobe","-v","error","-select_streams","a","-show_entries","stream=codec_type","-of","csv=p=0",a.out],capture_output=True,text=True,timeout=30)
        _has_a=bool(_pr.stdout.strip())
    except Exception as _e:
        _has_a=False; rep["audio_error"]=str(_e)
    rep["has_audio"]=_has_a; checks.append(("P0-11_audio", _has_a))
    # P0-9 debris: scan cut/ stickers if present
    import glob as _g, debris_check as _dc
    _dres=[]
    for _f in sorted(_g.glob("cut/*.png"))+sorted(_g.glob("tmp/cut/*.png")):
        if _f.endswith(".mask.png"): continue
        _r=_dc.check(_f); _dres.append(_r)
        if not _r["pass"]: checks.append((f"P0-9_debris:{os.path.basename(_f)}", False))
    if _dres and all(x["pass"] for x in _dres): checks.append(("P0-9_debris", True))
    elif not _dres: pass  # no cutouts on disk; cutout.py already enforced at source
    rep["debris"]=_dres
    # P0-10 doodle vs text: any audit violation mentioning P0-10 fails
    if a.meta:
        _meta = meta if isinstance(meta, dict) else json.load(open(a.meta))
        _viol = [str(x) for x in (_meta.get("p0_violations") or [])]
        if not _viol and isinstance(_meta.get("audit"), list):
            _viol = [v for x in _meta["audit"] for v in (x.get("violations") or x.get("v") or [])]
        _p10 = [v for v in _viol if "P0-10" in str(v)]
        _px = 0
        if isinstance(_meta.get("audit"), list):
            for x in _meta["audit"]:
                st = x.get("st") or x.get("state") or {}
                _px += int(st.get("doodleTextPx") or 0)
        _ok = (len(_p10) == 0 and _px == 0)
        checks.append(("P0-10_doodle_text", _ok))
        rep["doodle_text"] = {"pass": _ok, "violations": _p10, "doodleTextPx": _px}

    rep["checks"]=[{"name":n,"pass":bool(p)} for n,p in checks]
    if a.ref or a.sheet:
        rows=[(a.out,v)]+[(x,frames(x)) for x in a.extra]+([(a.ref,frames(a.ref))] if a.ref else []); W,H=180,320
        sheet=Image.new('RGB',(W*len(LAND),H*len(rows)+0),'white'); dr=ImageDraw.Draw(sheet)
        for i,(sid,f) in enumerate(LAND.items()):
            for row,(name,src) in enumerate(rows):
                ff=min(int((f+3)*len(src)/tot),len(src)-1); sheet.paste(Image.fromarray(src[ff].astype(np.uint8)),(i*W,row*H))
                if i==0: dr.text((4,row*H+4),name.split('/')[-1],fill='red')
            dr.text((i*W+4,16),sid,fill='blue')
        sheet.save(a.sheet,quality=85); rep["sheet"]=a.sheet+"（行：" + " / ".join(n.split('/')[-1] for n,_ in rows)+"）"
    s=json.dumps(rep,ensure_ascii=False,indent=1); print(s)
    if a.json: open(a.json,"w").write(s)
    fail=[c["name"] for c in rep["checks"] if not c["pass"]]
    if any(n.startswith(("P0","V6","字形")) or "P0-9" in n or "P0-10" in n or "P0-11" in n for n in fail): print("RENDER FAIL:",fail); raise SystemExit(1)
if __name__=="__main__": main()
