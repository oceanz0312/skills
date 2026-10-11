"""用法: python run.py <all|f1,f2,..> <outdir> [--seed N] [--manifest path] [--meta path]
seed 缺省随机；写 render_meta（seed、预设、重掷记录、版式摘要、人物轨迹、逐帧 P0 审计）。同 seed 逐像素复现。
P0 审计在每个唯一帧的真实绘制调用上执行；任何 P0 违规 -> 退出码 3（渲染判定失败）。字形缺失 -> 退出码 2。
--person-check（v7 P0-6，交付前必跑）：采样每场景落位帧 + 每个 A/B / 跳动帧，导出人物层并跑 person_check.check_frame；违规 -> 退出码 4。--person-sheet 输出逐场景拼图供人工复核。"""
import asyncio,json,sys,os,base64,shutil,http.server,threading,functools,random,argparse
from playwright.async_api import async_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def serve(port,root):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*a): pass
    h=functools.partial(Q,directory=root)
    s=http.server.ThreadingHTTPServer(("127.0.0.1",port),h); threading.Thread(target=s.serve_forever,daemon=True).start()
async def main(a):
    seed=a.seed if a.seed is not None else random.randint(1,2**31-1); print("SEED",seed)
    port=random.randint(20000,40000); serve(port,ROOT); os.makedirs(a.outdir,exist_ok=True)
    man=json.load(open(a.manifest)); man.setdefault("style",{})["seed"]=seed
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1080,"height":1920})
        pg.on("console",lambda m:print("console:",m.text)); pg.on("pageerror",lambda e:print("PAGEERR",e))
        await pg.goto(f"http://127.0.0.1:{port}/render/index.html")
        await pg.evaluate("()=>Promise.all([...document.fonts].map(f=>f.load()))")
        meta=await pg.evaluate("([m,s])=>init(m,s)",[man,seed])
        print("rerolls:",{k:v["attempts"] for k,v in meta["rerolls"].items()})
        print("plan:",json.dumps(meta["plan"],ensure_ascii=False))
        frames=list(range(meta["plan"]["total"])) if a.frames=="all" else [int(x) for x in a.frames.split(",")]
        last=None;lastfile=None;n=0;track={};audits=[]
        for i in frames:
            key=await pg.evaluate("i=>stateKey(i)",i); fn=f"{a.outdir}/{i:05d}.png"
            if key!=last: track[i]=await pg.evaluate("i=>personTrack(i)",i)
            if key==last and lastfile: shutil.copy(lastfile,fn); continue
            data,au=await pg.evaluate("i=>renderAudit(i)",i); audits.append(au)
            open(fn,"wb").write(base64.b64decode(data.split(",")[1])); last=key;lastfile=fn;n+=1
        p6=None
        if a.person_check:
            sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","scripts")); sys.path.insert(0,os.path.join(ROOT,"skill_scripts"))
            import person_check as pc
            ld=a.outdir.rstrip("/")+"_person_layers"; os.makedirs(ld,exist_ok=True); p6=[]
            exp={}
            for smp in await pg.evaluate("()=>personSamples()"):
                f=smp["f"]; fn=f"{a.outdir}/{f:05d}.png"
                if not os.path.exists(fn): continue
                d=await pg.evaluate("i=>personLayer(i)",f)
                if not d: continue
                lp=f"{ld}/{f:05d}.png"; open(lp,"wb").write(base64.b64decode(d["url"].split(",")[1]))
                src=d.get("src") or {}; ph,mk=os.path.join(ROOT,src.get("photo","-")),os.path.join(ROOT,src.get("mask","-"))
                ok,rep=pc.check_frame(fn,lp,src.get("people_count",2),ph if os.path.exists(ph) else None,mk,d["xf"],d["size"])
                smp.update(ok=ok,key=d["key"],errors=rep.get("errors",[]),warnings=rep.get("warnings",[]),mapped=rep.get("mapped",[]),layer=lp,frame=fn); p6.append(smp)
                print("P0-6",smp["scene"],f,smp["tag"],"OK" if ok else "FAIL",rep.get("errors",[]),rep.get("warnings",[])[:1])
            meta["p6"]=p6
            if pc._det: pc._det.close(); pc._det=None
            if a.person_sheet: pc.contact_sheet(p6,a.person_sheet)
        bad=await pg.evaluate("()=>assertGlyphs()"); fonts=await pg.evaluate("()=>usedFonts()"); print("fonts used:",fonts,"glyph missing:",bad)
        ev=await pg.evaluate("()=>SCENES.filter(s=>s.person).map(s=>({id:s.id,mode:s.person,events:s.person=='ab'?s.ab:s.jumps}))")
        viol=[(x["f"],v) for x in audits for v in x["violations"]]
        meta.update(unique_frames=n,person_events=ev,track={k:v for k,v in track.items() if v},glyph_missing=bad,fonts_used=fonts,audit=audits,p0_violations=viol)
        json.dump(meta,open(a.meta or f"{a.outdir}/../render_meta_{seed}.json","w"),ensure_ascii=False,indent=1)
        json.dump(man,open(a.outdir+"/../manifest_seed_%d.json"%seed,"w"),ensure_ascii=False,indent=1)
        print("rendered unique",n,"of",len(frames),"| P0 violations:",len(viol)); [print("  ",x) for x in viol[:30]]
        await b.close()
        if bad: sys.exit(2)
        if viol: sys.exit(3)
        if p6 and any(not x["ok"] for x in p6): print("P0-6 FAIL:",[(x["scene"],x["f"],x["errors"]) for x in p6 if not x["ok"]]); sys.exit(4)
if __name__=="__main__":
    ap=argparse.ArgumentParser(); ap.add_argument("frames"); ap.add_argument("outdir"); ap.add_argument("--seed",type=int); ap.add_argument("--manifest",default=os.path.join(ROOT,"manifest.json")); ap.add_argument("--meta"); ap.add_argument("--person-check",action="store_true",help="P0-6：渲染后对每场景落位帧+每个 A/B/跳动帧做人物完整性检查（失败退出码 4）"); ap.add_argument("--person-sheet",help="P0-6 人物检查拼图输出路径")
    asyncio.run(main(ap.parse_args()))
