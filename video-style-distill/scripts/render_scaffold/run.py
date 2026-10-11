#!/usr/bin/env python3
"""渲染器脚手架。用法: python run.py plan.json outdir [--seed N] [--meta meta.json] [--mp4 out.mp4 --bgm bgm.mp3]
逐帧调用 page.renderAudit(f)；stateKey 相同的帧直接复制（定格风格省 90% 时间）。任何 P0 审计违规 → 退出码 3。依赖: playwright(chromium), ffmpeg。"""
import asyncio,json,os,sys,base64,shutil,argparse,random,subprocess,http.server,threading,functools
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
def serve(port):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*a):pass
    s=http.server.ThreadingHTTPServer(("127.0.0.1",port),functools.partial(Q,directory=HERE));threading.Thread(target=s.serve_forever,daemon=True).start()
async def main(a):
    seed=a.seed if a.seed is not None else random.randint(1,2**31-1);print("SEED",seed)
    plan=json.load(open(a.plan,encoding="utf-8"));port=random.randint(20000,40000);serve(port);os.makedirs(a.out,exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={"width":plan["size"][0],"height":plan["size"][1]})
        pg.on("pageerror",lambda e:print("PAGEERR",e));await pg.goto(f"http://127.0.0.1:{port}/index.html")
        meta=await pg.evaluate("([p,s])=>init(p,s)",[plan,seed]);total=meta["plan"]["total"];last=None;bad=[];uniq=0
        for i in range(total):
            k=await pg.evaluate("i=>stateKey(i)",i);fn=f"{a.out}/{i:05d}.png"
            if k==last:shutil.copy(f"{a.out}/{i-1:05d}.png",fn);continue
            d,au=await pg.evaluate("i=>renderAudit(i)",i);open(fn,"wb").write(base64.b64decode(d.split(",")[1]));last=k;uniq+=1
            if au["bad"]:bad.append(au)
        await b.close()
    meta.update(seed=seed,unique_frames=uniq,p0_violations=bad)
    if a.meta:json.dump(meta,open(a.meta,"w"),ensure_ascii=False,indent=1)
    print("unique frames",uniq,"/",total,"P0 violations",len(bad))
    if a.mp4:
        cmd=["ffmpeg","-v","error","-y","-framerate",str(plan.get("fps",30)),"-i",f"{a.out}/%05d.png"]+(["-i",a.bgm,"-shortest"] if a.bgm else [])+["-c:v","libx264","-pix_fmt","yuv420p","-crf","18",a.mp4]
        subprocess.run(cmd,check=True)
    if bad:sys.exit(3)
if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("plan");ap.add_argument("out");ap.add_argument("--seed",type=int);ap.add_argument("--meta")
    ap.add_argument("--mp4");ap.add_argument("--bgm");asyncio.run(main(ap.parse_args()))
