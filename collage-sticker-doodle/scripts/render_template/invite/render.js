// collage-stopmotion-invite v5 renderer. render(ctx,f) is a pure function of f; all randomness fixed in init(seed).
// P0 rules are enforced twice: (1) every seeded layout is AUDITED over all its boil/position states and re-rolled on any
// violation; (2) every rendered frame is audited again (frameAudit) and run.py exits non-zero if any P0 check fails.
const W=1080,H=1920,MARGIN=12;
const GRID=[];for(let k=0;k<100;k++)GRID.push(Math.round(3.4+12.22*k));
const SCENES=[
 {id:"S1",land:0,start:0,end:64,intro:{on:3,flicker:[5,6,11,13,15,16,18,20,21,23,25,26],screenOn:28,push:[40,52,65]}},
 {id:"S2",land:65,start:65,end:100,person:"jump"},
 {id:"S3",land:126,start:101,end:247,enter:{dir:"left",steps:[101,114,126],stepFrac:0.24}},
 {id:"S4",land:272,start:248,end:357,person:"jump",enter:{dir:"up",steps:[248,260,272],stepFrac:0.18}},
 {id:"S5",land:382,start:358,end:467,person:"ab",ab:[395,407,419,431,444,456],enter:{dir:"down",steps:[358,370,382],stepFrac:0.18}},
 {id:"S6",land:492,start:468,end:577,person:"ab",ab:[505,517,529,541,554,566],enter:{dir:"down",steps:[468,480,492],stepFrac:0.18}},
 {id:"S7",land:602,start:578,end:687,person:"ab",ab:[615,627,639,651,664,676],enter:{dir:"down",steps:[578,590,602],stepFrac:0.18}},
 {id:"S8",land:712,start:688,end:821,person:"jump",enter:{dir:"down",steps:[688,700,712],stepFrac:0.18}},
 {id:"S9",land:822,start:822,end:980,person:"jump",enter:{type:"cut"}},
 {id:"S10",land:1006,start:981,end:1152,person:"jump",enter:{dir:"right",steps:[981,994,1006],stepFrac:0.24}}];
// P0-2: jump scenes switch A<->B every 2T on the grid (A/B scenes every 1T per event table). Exactly 2 positions.
for(const s of SCENES){if(s.person=="jump"){const g=GRID.filter(x=>x>=s.land+10&&x<=s.end-4);s.jumps=g.filter((x,i)=>i%2==0)}}
const PERSON_H=0.50*H, MIN_SCRIPT=118, MIN_CJK=46, JIT_MAX=16, ROT_JIT=1.2;   // NEVER randomized
let IMG={},M=null,NOISE=[],P=null,LV=null,SEED=0,LAYOUT={},REROLLS={},TVS=null,AUD=null,USED={};
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const seeded=s=>mulberry32(hash(SEED+"|"+s));
const rr=(r,a,b)=>a+(b-a)*r(); const pick=(r,a)=>a[Math.floor(r()*a.length)];
function boilOf(f){let n=0;for(const g of GRID){if(g<=f)n++;else break}return n%3}
function load(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(src);i.src=src})}
const slot=(sid,k)=>M.scenes.find(s=>s.id==sid).slots[k];
// ---------- audit list: every drawn element registers its device-space polygon ----------
function tf(ctx,pts){const T=ctx.getTransform();return pts.map(([a,b])=>[T.a*a+T.c*b+T.e,T.b*a+T.d*b+T.f])}
function reg(ctx,cat,id,x,y,w,h,extra){if(!AUD)return;AUD.push({cat,id,poly:tf(ctx,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]),...(extra||{})})}
function regPoly(ctx,cat,id,pts,extra){if(!AUD)return;AUD.push({cat,id,poly:tf(ctx,pts),...(extra||{})})}
function useFont(font,text){(USED[font]=USED[font]||new Set());for(const ch of text)USED[font].add(ch)}
// ---------- colour helpers ----------
function hex2rgb(h){return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16))}
function rgb2hex(c){return "#"+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("")}
function mix(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);return rgb2hex(A.map((v,i)=>v+(B[i]-v)*t))}
function lum(hex){const c=hex2rgb(hex).map(v=>v/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
function contrast(l1,l2){const a=Math.max(l1,l2),b=Math.min(l1,l2);return (a+0.05)/(b+0.05)}
// ---------- shapes ----------
function wobblyPath(ctx,pts,close=true){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(close)ctx.closePath()}
function shapePts(kind,cx,cy,rx,ry,seed,wob){const r=seeded("shape|"+seed);const pts=[];const N=120;const amp=wob*Math.min(rx,ry)*0.018;
  const ph=[r()*6,r()*6,r()*6];const noise=t=>amp*(Math.sin(t*5+ph[0])*0.6+Math.sin(t*11+ph[1])*0.3+Math.sin(t*23+ph[2])*0.25);
  for(let i=0;i<N;i++){const t=i/N*Math.PI*2;let x,y;
    if(kind=="circle"){x=Math.cos(t);y=Math.sin(t)}
    else if(kind=="heart"){x=16*Math.sin(t)**3/17;y=-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/17}
    else {const b=1+0.12*Math.sin(t*2+ph[0])+0.06*Math.sin(t*3+ph[1]);x=Math.cos(t)*b;y=Math.sin(t)*b}
    const n=noise(t);pts.push([cx+x*rx+Math.cos(t)*n,cy+y*ry+Math.sin(t)*n])}return pts}
function tornLine(x0,y0,x1,y1,r,amp){const pts=[];const L=Math.hypot(x1-x0,y1-y0),n=Math.max(3,Math.round(L/14));const nx=-(y1-y0)/L,ny=(x1-x0)/L;let d=0;
  for(let i=0;i<=n;i++){const t=i/n;d=d*0.55+(r()-0.5)*2*amp*0.8;const w=Math.sin(t*Math.PI*2.3+amp)*amp*0.7;pts.push([x0+(x1-x0)*t+nx*(d+w),y0+(y1-y0)*t+ny*(d+w)])}return pts}
function tornPts(x,y,w,h,seed,amp){const r=seeded("torn|"+seed);const c=Math.min(w,h)*0.05;
  return [...tornLine(x+c,y,x+w-c*0.5,y,r,amp),...tornLine(x+w,y+c*0.7,x+w,y+h-c,r,amp),...tornLine(x+w-c,y+h,x+c*0.8,y+h,r,amp),...tornLine(x,y+h-c*0.6,x,y+c,r,amp)]}
function polyArea(p){let a=0;for(let i=0;i<p.length;i++){const [x1,y1]=p[i],[x2,y2]=p[(i+1)%p.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
function clipFrame(poly){let out=poly;const edges=[[p=>p[0]>=0,(a,b)=>{const t=(0-a[0])/(b[0]-a[0]);return [0,a[1]+t*(b[1]-a[1])]}],[p=>p[0]<=W,(a,b)=>{const t=(W-a[0])/(b[0]-a[0]);return [W,a[1]+t*(b[1]-a[1])]}],
  [p=>p[1]>=0,(a,b)=>{const t=(0-a[1])/(b[1]-a[1]);return [a[0]+t*(b[0]-a[0]),0]}],[p=>p[1]<=H,(a,b)=>{const t=(H-a[1])/(b[1]-a[1]);return [a[0]+t*(b[0]-a[0]),H]}]];
  for(const [inside,cut] of edges){const inp=out;out=[];for(let i=0;i<inp.length;i++){const a=inp[i],b=inp[(i+1)%inp.length];const ia=inside(a),ib=inside(b);if(ia)out.push(a);if(ia!=ib)out.push(cut(a,b))}if(!out.length)break}return out}
function cover(ctx,img,x,y,w,h,fx=0.5,fy=0.5,zoom=1){const s=Math.max(w/img.width,h/img.height)*zoom;const sw=w/s,sh=h/s;const sx=(img.width-sw)*fx,sy=(img.height-sh)*fy;ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);return {s,sx,sy}}
// ---------- P0-4/6: colour blocks = big stacked paper sheets (bottom layer only) ----------
function paperTex(ctx,clipPath,sid,id,boil,alpha=0.28){ctx.save();clipPath();ctx.clip();const r=seeded(sid+"|tex|"+id+"|"+boil);ctx.globalCompositeOperation="multiply";ctx.globalAlpha=alpha;ctx.filter="grayscale(1) contrast(1.1) brightness(1.25)";
  const t=IMG.crumpled;ctx.drawImage(t,rr(r,0,t.width-700),rr(r,0,t.height-1245),700,1245,-60,-60,W+120,H+120);ctx.filter="none";
  ctx.globalCompositeOperation="overlay";ctx.globalAlpha=0.07;ctx.fillStyle=ctx.createPattern(NOISE[boil],"repeat");ctx.fillRect(-60,-60,W+120,H+120);ctx.restore()}
function basePaper(ctx,color,boil,sid){ctx.fillStyle=color;ctx.fillRect(-60,-60,W+120,H+120);paperTex(ctx,()=>{ctx.beginPath();ctx.rect(-60,-60,W+120,H+120)},sid,"base",boil,0.30);
  regPoly(ctx,"block",sid+"base",[[0,0],[W,0],[W,H],[0,H]])}
function sheetPts(b){const r=seeded("sheet|"+b.id);const A=b.amp;let pts;
  if(b.kind=="diag"){const yl=b.y0,yr=b.y1;const e=tornLine(-50,yl,W+50,yr,r,A);pts=b.keep=="below"?[...e,[W+60,H+60],[-60,H+60]]:[...e,[W+60,-60],[-60,-60]]}
  else if(b.kind=="side"){const e=tornLine(b.x0,-50,b.x1,H+50,r,A);pts=b.keep=="left"?[...e,[-60,H+60],[-60,-60]]:[...e,[W+60,H+60],[W+60,-60]]}
  else{pts=[];const N=160;for(let i=0;i<N;i++){const t=i/N*Math.PI*2;const d=(r()-0.5)*A*1.6;pts.push([b.cx+Math.cos(t)*(b.R+d),b.cy+Math.sin(t)*(b.R*b.ry+d)])}}
  return pts}
function sheet(ctx,b,sid,boil){const pts=sheetPts(b);const r=seeded("fib|"+b.id);
  // white paper fibres along the torn edge: wide white under-stroke + hair fibres, then the coloured sheet on top
  ctx.save();ctx.shadowColor="rgba(0,0,0,0.16)";ctx.shadowBlur=6;ctx.shadowOffsetY=2;wobblyPath(ctx,pts);ctx.strokeStyle=P.light;ctx.lineWidth=b.rim*2;ctx.lineJoin="round";ctx.stroke();ctx.restore();
  ctx.save();ctx.strokeStyle="rgba(255,253,248,0.85)";ctx.lineWidth=1.2;for(let i=0;i<pts.length;i+=2){const [x,y]=pts[i];const a=r()*Math.PI*2,l=rr(r,3,b.rim*1.6);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke()}ctx.restore();
  ctx.save();ctx.fillStyle=b.color;wobblyPath(ctx,pts);ctx.fill();ctx.restore();paperTex(ctx,()=>wobblyPath(ctx,pts),sid,b.id,boil,0.26);
  regPoly(ctx,"block",b.id,pts)}
function makeSheets(sid,r){const pal=P.scenes[sid];const out=[];const n=r()<0.45+0.2*LV.extra?2:1;   // + base = 2..3 layers (P0-4)
  const kinds=[...P.shapes].sort(()=>r()-0.5);
  for(let i=0;i<n;i++){const k=kinds[i%kinds.length];const color=i==0?pal[1]:mix(pal[0],P.light,0.42);const id=sid+"sh"+i;const amp=rr(r,7,12)*LV.wobble;const rim=rr(r,4,7);
    if(k=="diag"){const below=r()<0.6;const y=below?rr(r,0.38,0.62)*H:rr(r,0.30,0.52)*H;const t=rr(r,0.06,0.16)*H*(r()<0.5?-1:1)*LV.tilt;out.push({id,kind:k,color,amp,rim,keep:below?"below":"above",y0:y-t,y1:y+t})}
    else if(k=="side"){const left=r()<0.5;const x=left?rr(r,0.45,0.66)*W:rr(r,0.34,0.55)*W;const t=rr(r,0.06,0.16)*W*(r()<0.5?-1:1)*LV.tilt;out.push({id,kind:k,color,amp,rim,keep:left?"left":"right",x0:x-t,x1:x+t})}
    else{const R=rr(r,0.62,0.85)*W;out.push({id,kind:k,color,amp,rim,R,ry:rr(r,0.95,1.15),cx:r()<0.5?rr(r,-0.05,0.25)*W:rr(r,0.75,1.05)*W,cy:r()<0.5?rr(r,0.05,0.25)*H:rr(r,0.75,0.95)*H})}}
  return out}
// ---------- photo pieces (landscape/building) ----------
function gradeColor(ctx,sid,w,h){ctx.globalCompositeOperation="soft-light";ctx.globalAlpha=0.30;ctx.fillStyle=P.scenes[sid][0];ctx.fillRect(-20,-20,w+40,h+40);
  ctx.globalCompositeOperation="multiply";ctx.globalAlpha=0.10;ctx.fillStyle="#E8B98A";ctx.fillRect(-20,-20,w+40,h+40);ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over"}
const FILM="sepia(0.22) saturate(0.72) contrast(0.94) brightness(1.04)";       // ONE grade for every landscape (approved #3)
function piece(ctx,p,sid,boil,cat){const r=seeded(sid+"|"+p.id+"|"+boil);const j=(p.jit??8)*LV.offset;const dx=rr(r,-j,j),dy=rr(r,-j,j),dr=(p.jit===0?0:rr(r,-0.5,0.5))*Math.PI/180;
  ctx.save();ctx.translate(p.x+p.w/2+dx,p.y+p.h/2+dy);ctx.rotate((p.rot||0)*Math.PI/180+dr);ctx.translate(-p.w/2,-p.h/2);
  const amp=(p.amp||9)*LV.wobble;const path=()=>wobblyPath(ctx,tornPts(0,0,p.w,p.h,p.id,amp));
  ctx.save();ctx.translate(-5,-5);ctx.scale((p.w+10)/p.w,(p.h+10)/p.h);path();ctx.fillStyle=P.light;ctx.shadowColor="rgba(0,0,0,0.2)";ctx.shadowBlur=4;ctx.shadowOffsetY=2;ctx.fill();ctx.restore();
  ctx.save();path();ctx.clip();
  if(p.color){ctx.fillStyle=p.color;ctx.fillRect(-20,-20,p.w+40,p.h+40)}
  if(p.img){ctx.filter=p.grade??FILM;const cv=cover(ctx,IMG[p.img],0,0,p.w,p.h,p.fx??0.5,p.fy??0.5,p.zoom||1);ctx.filter="none";if(p.grade==null)gradeColor(ctx,sid,p.w,p.h);
    if(p.subject){const im=IMG[p.img],u=p.subject;const x=(u.u*im.width-cv.sx)*cv.s,y=(u.v*im.height-cv.sy)*cv.s;ctx.restore();reg(ctx,"subject",p.id+"subj",x,y,u.w*im.width*cv.s,u.h*im.height*cv.s);ctx.save();path();ctx.clip()}}
  if(p.tex){ctx.globalCompositeOperation="multiply";ctx.globalAlpha=p.texA||0.5;cover(ctx,IMG[p.tex],0,0,p.w,p.h)}
  ctx.restore();reg(ctx,cat||"photo",p.id,-amp-6,-amp-6,p.w+2*amp+12,p.h+2*amp+12);ctx.restore()}
function grain(ctx,boil){ctx.save();ctx.globalAlpha=0.04;ctx.globalCompositeOperation="overlay";ctx.fillStyle=ctx.createPattern(NOISE[boil],"repeat");ctx.fillRect(0,0,W,H);ctx.restore()}
// ---------- text (handwritten only) ----------
const FONTK={"Reenie Beanie":{k:1.25,lh:0.80},"Nothing You Could Do":{k:0.78,lh:1.05},"Homemade Apple":{k:0.70,lh:1.15},"Caveat":{k:1.05,lh:0.88},"Dancing Script":{k:0.92,lh:1.0}};
function wrapLines(ctx,lines,font,size,maxW){const out=[];ctx.font=`${size}px "${font}"`;for(const l of lines){if(ctx.measureText(l).width<=maxW){out.push(l);continue}
  const ws=l.split(" ");let cur="";for(const w of ws){const t=cur?cur+" "+w:w;if(ctx.measureText(t).width>maxW&&cur){out.push(cur);cur=w}else cur=t}if(cur)out.push(cur)}return out}
// v8 fountain-pen ink: per-glyph size/rotation/baseline jitter, pressure gradient (heavy start -> light end),
// per-glyph darkness, noise-modulated stroke alpha, variable stroke weight, slight bleed, edge pooling, multiply onto paper.
// INK: v8.1 heavy fountain/marker ink (user: darker, heavier, subtle pressure)
const INK={wgt:[0.028,0.050],dark:[0.97,1.0],lift:[0.84,0.93],noise:0.25,bleed:0.16,rim:0.25};
const CJK=/[\u3000-\u9fff\uff00-\uffef]/;let INKNOISE=null;
function inkNoiseInv(){if(window._INV)return window._INV;const a=inkNoise();const c=document.createElement("canvas");c.width=c.height=256;const x=c.getContext("2d");const d=a.getContext("2d").getImageData(0,0,256,256);for(let i=3;i<d.data.length;i+=4)d.data[i]=255-d.data[i];x.putImageData(d,0,0);return window._INV=c}
function inkNoise(){if(INKNOISE)return INKNOISE;const c=document.createElement("canvas");c.width=c.height=256;const x=c.getContext("2d");const r=seeded("inknoise");const d=x.createImageData(256,256);
  const g=[];for(let i=0;i<33*33;i++)g.push(r());const at=(u,v)=>g[(v%33)*33+(u%33)];
  for(let y=0;y<256;y++)for(let X=0;X<256;X++){let n=0,a=0.55;for(const s of [8,4,2]){const u=X/s,v=y/s,u0=Math.floor(u),v0=Math.floor(v),fu=u-u0,fv=v-v0;n+=a*((at(u0,v0)*(1-fu)+at(u0+1,v0)*fu)*(1-fv)+(at(u0,v0+1)*(1-fu)+at(u0+1,v0+1)*fu)*fv);a*=0.5}
    const k=(y*256+X)*4;d.data[k]=d.data[k+1]=d.data[k+2]=0;d.data[k+3]=Math.round(255*Math.min(1,0.55+0.55*n))}
  x.putImageData(d,0,0);return INKNOISE=c}
const GLC=document.createElement("canvas");
function inkGlyph(ctx,ch,font,size,color,r){const S=Math.ceil(size*1.6);GLC.width=GLC.height=S;const g=GLC.getContext("2d");g.clearRect(0,0,S,S);
  g.font=`${size}px "${font}"`;g.textAlign="center";g.textBaseline="alphabetic";g.fillStyle=color;g.strokeStyle=color;g.lineJoin="round";
  const ox=S/2,oy=S*0.78;const wgt=rr(r,INK.wgt[0],INK.wgt[1])*size;          // stroke weight: dilation (always heavier than the font)
  g.fillText(ch,ox,oy);if(wgt>0){g.lineWidth=wgt;g.strokeText(ch,ox,oy)}
  if(wgt<0){g.globalCompositeOperation="destination-out";g.lineWidth=-wgt;g.strokeText(ch,ox,oy)}
  // pressure: strokes start top/left heavy and lift toward bottom/right
  g.globalCompositeOperation="destination-in";const a=rr(r,0.35,1.2);const gr=g.createLinearGradient(ox-Math.cos(a)*S/2,oy-S*0.45-Math.sin(a)*S/2,ox+Math.cos(a)*S/2,oy-S*0.45+Math.sin(a)*S/2);
  const dark=rr(r,INK.dark[0],INK.dark[1]),lift=rr(r,INK.lift[0],INK.lift[1]);gr.addColorStop(0,`rgba(0,0,0,${dark})`);gr.addColorStop(0.55,`rgba(0,0,0,${(dark+lift)/2+0.06})`);gr.addColorStop(1,`rgba(0,0,0,${lift})`);g.fillStyle=gr;g.fillRect(0,0,S,S);
  // ink flow noise inside strokes
  g.save();g.globalAlpha=1;g.translate(-r()*200,-r()*200);g.globalCompositeOperation="destination-out";g.globalAlpha=INK.noise;g.fillStyle=g.createPattern(inkNoiseInv(),"repeat");g.fillRect(0,0,S+256,S+256);g.restore();g.globalCompositeOperation="destination-in";
  // pooling: darker rim where ink collects at stroke edges
  g.globalCompositeOperation="source-atop";g.globalAlpha=INK.rim;g.lineWidth=Math.max(1,size*0.018);g.strokeStyle=mix(color,"#000000",0.45);g.strokeText(ch,ox,oy);g.globalAlpha=1;g.globalCompositeOperation="source-over";
  ctx.save();ctx.globalCompositeOperation="multiply";ctx.globalAlpha=INK.bleed;ctx.filter=`blur(${(size*0.025).toFixed(2)}px)`;ctx.drawImage(GLC,-ox,-oy);   // bleed / feathering into paper
  ctx.filter="none";ctx.globalAlpha=1;ctx.drawImage(GLC,-ox,-oy);ctx.restore()}
function inkText(ctx,txt,font,size,align,color,key){ctx.font=`${size}px "${font}"`;const r=seeded("ink|"+SEED+"|"+key+"|"+txt);
  const chars=[...txt];const adv=chars.map(c=>ctx.measureText(c).width*rr(r,0.94,1.02));const tw=adv.reduce((a,b)=>a+b,0);let x=align=="center"?-tw/2:align=="right"?-tw:0;
  const drift=rr(r,-0.012,0.012)*size;                                  // whole-line baseline drift (handwriting walks)
  chars.forEach((c,i)=>{const w=adv[i];if(c.trim()){const s=size*rr(r,0.90,1.08);ctx.save();ctx.translate(x+w/2,rr(r,-0.045,0.045)*size+drift*i);ctx.rotate(rr(r,-3.2,3.2)*Math.PI/180);inkGlyph(ctx,c,font,s,color,r);ctx.restore()}x+=w});return tw}
function textAt(ctx,txt,font,size,x,y,rot,color,align="center",id="t",cat="text",weight=""){
  if(CJK.test(txt)&&!weight){ctx.save();ctx.translate(x,y);ctx.rotate(rot*Math.PI/180);const tw=inkText(ctx,txt,font,size,align,P.penInk||color,id);const x0=align=="center"?-tw/2:align=="right"?-tw:0;
    reg(ctx,cat,id,x0-6,-size*1.0,tw+12,size*1.3);useFont(font,txt);ctx.restore();return}
  ctx.save();ctx.font=`${weight}${size}px "${font}"`;ctx.fillStyle=color;ctx.textAlign=align;ctx.translate(x,y);ctx.rotate(rot*Math.PI/180);ctx.fillText(txt,0,0);
  const m=ctx.measureText(txt);reg(ctx,cat,id,-m.actualBoundingBoxLeft-3,-m.actualBoundingBoxAscent-3,m.actualBoundingBoxLeft+m.actualBoundingBoxRight+6,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent+6);useFont(font,txt);ctx.restore()}
function drawScript(ctx,t,sid){t.lines.forEach((l,i)=>textAt(ctx,l,t.font,t.size,W/2+t.dx+(i-(t.lines.length-1)/2)*t.stairs,t.y+i*t.size*t.lh,t.rot,t.color,"center",sid+"script"+i,"text",t.weight||""))}
function ransom(ctx,R){for(const g of R.glyphs){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rot);ctx.fillStyle=g.bg;ctx.shadowColor="rgba(0,0,0,.22)";ctx.shadowBlur=3;ctx.shadowOffsetY=2;
   const w=g.w,h=g.h;const pts=g.shape=="round"?shapePts("circle",0,-h*0.32,w*0.55,h*0.6,g.id,2):g.shape=="torn"?tornPts(-w/2,-h*0.92,w,h*1.15,g.id,5):shapePts("blob",0,-h*0.32,w*0.55,h*0.6,g.id,3);
   wobblyPath(ctx,pts);ctx.fill();ctx.shadowColor="transparent";regPoly(ctx,"text",g.id+"patch",pts);
   ctx.font=`${g.wt} ${g.sz}px "${g.f}"`;ctx.fillStyle=g.fg;ctx.textAlign="center";ctx.fillText(g.ch,0,0);useFont(g.f,g.ch);ctx.restore()}}
// ---------- doodles ----------
function doodleBox(d){const s=d.s;return d.kind=="hearts"?[-0.6*s-8,-0.6*s-8,1.2*s+70+0.4*s+16,130+0.95*s+16]:d.kind=="wave"?[-8,-26,3*s+16,52]:[-1.35*s-8,-0.95*s-8,2.7*s+16,1.9*s+16]}
function doodle(ctx,d){ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);ctx.strokeStyle=d.color;ctx.fillStyle=d.color;ctx.lineWidth=7;ctx.lineCap="round";
  if(d.kind=="hearts"){for(const [dx,dy,k] of [[0,0,1],[70,80,.7],[-40,130,.55]]){const c=d.s*k;ctx.save();ctx.translate(dx,dy);wobblyPath(ctx,shapePts("heart",0,0,c*0.5,c*0.5,d.id+dx,1));ctx.fill();ctx.restore()}}
  else if(d.kind=="wave"){ctx.beginPath();for(let i=0;i<=40;i++){const t=i/40;const px=d.s*3*t,py=Math.sin(t*Math.PI*4)*16;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke()}
  else{ctx.lineWidth=6;ctx.beginPath();for(let i=0;i<=90;i++){const t=i/90*Math.PI*2*1.7;const q=d.s*(0.9+0.12*Math.sin(t*3));const px=Math.cos(t)*q*1.2,py=Math.sin(t)*q*0.75;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke()}
  const b=doodleBox(d);reg(ctx,"doodle",d.id,b[0],b[1],b[2],b[3]);ctx.restore()}
function propH(p){const im=IMG[p.key];return p.w*im.height/im.width}
function prop(ctx,p,sid,boil){const im=IMG[p.key];const h=propH(p);const r=seeded(sid+"|"+p.id+"|"+boil);const j=8*LV.offset;
  ctx.save();ctx.translate(p.x+rr(r,-j,j),p.y+rr(r,-j,j));ctx.rotate(p.rot*Math.PI/180);ctx.shadowColor="rgba(0,0,0,0.25)";ctx.shadowBlur=3;ctx.shadowOffsetX=1;ctx.shadowOffsetY=2;ctx.drawImage(im,-p.w/2,-h/2,p.w,h);ctx.shadowColor="transparent";
  reg(ctx,"prop",p.id,-p.w/2-3,-h/2-3,p.w+6,h+6);ctx.restore()}
// ---------- people (TOP layer; exactly 2 positions A/B; feet on the ground line) ----------
function personGeom(key,pos,L){const im=IMG[key];const s=pos.s*(L.pscale||1);let h=PERSON_H*s,w=im.width*h/im.height;if(w>0.92*W*s){w=0.92*W*s;h=im.height*w/im.width}
  return {w,h,cx:W/2+pos.dx,by:L.feet+pos.dy,rot:pos.rot}}
function personState(s,f){if(!s.person)return null;const sid=s.id;const L=LAYOUT[sid];
  if(s.person=="ab"){const n=s.ab.filter(a=>a<=f).length;const B=n%2;return {key:sid+(B?"_B":"_A"),posIdx:B,pos:L.pos[B],ev:n}}
  const n=s.jumps.filter(a=>a<=f).length;const B=n%2;return {key:sid+"_person",posIdx:B,pos:L.pos[B],ev:n}}
function jit(sid,boil){const r=seeded(sid+"|person|"+boil);const mag=rr(r,6,JIT_MAX),ang=r()*Math.PI*2;return {dx:Math.cos(ang)*mag,dy:Math.sin(ang)*mag*0.5,dr:rr(r,-ROT_JIT,ROT_JIT)}}
function drawPerson(ctx,s,f,boil){const st=personState(s,f);if(!st)return;const L=LAYOUT[s.id];const g=personGeom(st.key,st.pos,L);const J=jit(s.id,boil);
  if(L.feet<H-8){ctx.save();ctx.fillStyle="rgba(40,24,18,0.42)";ctx.filter="blur(9px)";ctx.beginPath();ctx.ellipse(g.cx+J.dx,L.feet+4,g.w*0.38,22,0,0,Math.PI*2);ctx.fill();ctx.restore()}  // contact shadow on the ground (stays on ground during jumps)
  ctx.save();ctx.translate(g.cx+J.dx,g.by+J.dy);ctx.rotate((g.rot+J.dr)*Math.PI/180);if(PREC)PREC.push({t:ctx.getTransform(),key:st.key,x:-g.w/2,y:-g.h,w:g.w,h:g.h});ctx.drawImage(IMG[st.key],-g.w/2,-g.h,g.w,g.h);reg(ctx,"person",s.id+st.key,-g.w/2,-g.h,g.w,g.h,{posIdx:st.posIdx});ctx.restore()}
function personTrack(f){const s=sceneAt(f);const st=personState(s,f);if(!st||!sceneSettled(s,f))return null;const g=personGeom(st.key,st.pos,LAYOUT[s.id]);
  return {scene:s.id,key:st.key,ev:st.ev,pos:st.posIdx,cx:g.cx,cy:g.by-g.h*0.5,h:g.h,head:Math.max(0.10*H,0.14*g.h)}}
// worst-case half-width / top of a rotated sticker incl. boil jitter (pivot = bottom centre)
function worst(g){const t=(Math.abs(g.rot)+ROT_JIT)*Math.PI/180;return {hw:g.w/2*Math.cos(t)+g.h*Math.sin(t)+JIT_MAX,top:g.by-g.h*Math.cos(t)-g.w/2*Math.sin(t)-JIT_MAX*0.5}}
function placePeople(sid,L,r){const sc=SCENES.find(x=>x.id==sid);const kA=sc.person=="ab"?sid+"_A":sid+"_person",kB=sc.person=="ab"?sid+"_B":kA;
  for(const ps0 of [1,0.94,0.88,0.82,0.76,0.7,0.64].filter(x=>x<=L.pcap+1e-6)){const ps=ps0*(BASE[sid]?0.92:1);L.pscale=ps;const rot=rr(r,2.5,5)*LV.tilt;const side=r()<0.5?1:-1;
    const gA=personGeom(kA,{dx:0,dy:0,s:1,rot},L),gB=personGeom(kB,{dx:0,dy:0,s:0.96,rot},L);const head=Math.max(0.10*H,0.14*gA.h)*1.08;
    const mA=W/2-MARGIN-worst(gA).hw,mB=W/2-MARGIN-worst(gB).hw;const dx=Math.min((BASE[sid]?0.2:0.16)*W,mA,mB);if(dx<0)continue;
    let dy=0;if(2*dx<head){if(sc.person=="jump")dy=Math.sqrt(head*head-4*dx*dx);else{if(2*dx<0.55*head)continue;dy=Math.min(0.075*H,Math.sqrt(head*head-4*dx*dx))}}   /* A/B: B gets a small hop when the side shift alone is < head height */
    L.pos=[{dx:-side*dx,dy:0,s:1,rot:-side*rot},{dx:side*dx,dy:-dy,s:0.96,rot:side*rot}];return true}
  L.pos=[{dx:0,dy:0,s:1,rot:0},{dx:0,dy:-0.1*H,s:1,rot:0}];return false}
// ---------- per-scene base: building photo (centred, full silhouette), ground line, text band ----------
// subject = building/landmark main silhouette in SOURCE-normalised coords (from manifest slot landscape_subject or default);
// ground = fraction of the photo piece height where the walkable ground (street/beach/grass) is: feet go there.
const BASE={S4:{img:"L4",subject:{u:.42,v:.03,w:.52,h:.55},ground:.90},S5:{img:"L5",subject:{u:.15,v:.10,w:.10,h:.55},ground:.93},
 S6:{img:"L6",subject:{u:.20,v:.33,w:.36,h:.52},ground:.95},S7:{img:"L7",subject:{u:.26,v:.04,w:.48,h:.86},ground:.96},S8:{img:"L8",subject:{u:.50,v:.08,w:.36,h:.56},ground:.95}};
// v6: near full-bleed background photo (bleeds off left/right/bottom; ≥70% of frame after masking)
const PIECE={x:-40,y:330,w:W+80,h:H-330+40},MIN_PHOTO_COVER=0.70;
const minCover=m=>m=="skyline"?0.62:MIN_PHOTO_COVER;   // skyline cut removes the sky on purpose → slightly lower floor
const MASKS=["skyline","torn","arch","circle","heart","blob"];const MASKUSE={};
// sky detection: flood from the top row over pixels close to the sky colour -> per-column skyline (source-normalised y)
const SKY={};
function skyOf(key){if(key in SKY)return SKY[key];const im=IMG[key];const w=160,h=Math.round(160*im.height/im.width);const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");x.filter="blur(1px)";x.drawImage(im,0,0,w,h);
  const d=x.getImageData(0,0,w,h).data;const px=(i,j)=>{const k=(j*w+i)*4;return [d[k],d[k+1],d[k+2]]};const top=[];for(let i=0;i<w;i++)top.push(px(i,1));const med=[0,1,2].map(k=>top.map(t=>t[k]).sort((a,b)=>a-b)[w>>1]);
  const sky=new Uint8Array(w*h);const q=[];for(let i=0;i<w;i++){const p=px(i,0);if(Math.hypot(p[0]-med[0],p[1]-med[1],p[2]-med[2])<60){sky[i]=1;q.push([i,0])}}
  while(q.length){const [i,j]=q.pop();for(const [a,b] of [[i+1,j],[i-1,j],[i,j+1]]){if(a<0||a>=w||b>=h||sky[b*w+a])continue;const p=px(a,b),o=px(i,j);const lum=(p[0]+p[1]+p[2])/3;
    if(Math.hypot(p[0]-o[0],p[1]-o[1],p[2]-o[2])<14&&Math.hypot(p[0]-med[0],p[1]-med[1],p[2]-med[2])<95&&(p[2]>=p[0]-10||lum>170)){sky[b*w+a]=1;q.push([a,b])}}}
  let line=[];for(let i=0;i<w;i++){let j=0;while(j<h&&sky[j*w+i])j++;line.push(j/h)}
  line=line.map((v,i)=>{const a=line.slice(Math.max(0,i-3),i+4).sort((p,q)=>p-q);return a[a.length>>1]});const mean=line.reduce((a,b)=>a+b,0)/w;
  return SKY[key]=(mean>0.08&&mean<0.65&&Math.min(...line)>0.02)?{line,mean}:null}
function pinPoly(pt,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>pt[1])!=(yj>pt[1]))&&(pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi))c=!c}return c}
function maskPts(p){const r=seeded("mask|"+p.id);const w=p.w,h=p.h;const A=7*LV.wobble;
  if(p.mask=="skyline"){const sk=skyOf(p.img);const im=IMG[p.img];const s=Math.max(w/im.width,h/im.height)*p.zoom;const sw=w/s,sh=h/s;const sx=(im.width-sw)*p.fx,sy=(im.height-sh)*p.fy;
    const top=[];const N=sk.line.length;for(let x=0;x<=w;x+=6){const u=(sx+x/s)/im.width;const k=Math.max(0,Math.min(N-1,Math.round(u*N)));const y=(sk.line[k]*im.height-sy)*s;top.push([x,Math.max(0,Math.min(h,y))+(r()-0.5)*3])}
    return [...top,[w,h],[0,h]]}
  if(p.mask=="torn"){const t0=rr(r,0.0,0.16)*h,t1=rr(r,0.0,0.16)*h;return [...tornLine(0,t0,w,t1,r,A*1.6),[w,h],[0,h]]}
  if(p.mask=="arch"){const R=w/2,pts=[[0,h]];for(let i=0;i<=60;i++){const a=Math.PI+i/60*Math.PI;pts.push([w/2+Math.cos(a)*R,R*0.75+Math.sin(a)*R*0.75+(r()-0.5)*A*0.6])}pts.push([w,h]);return pts}
  if(p.mask=="circle")return shapePts("circle",w/2,h*0.58,w*0.62,h*0.60,p.id,LV.wobble*2);
  if(p.mask=="heart")return shapePts("heart",w/2,h*0.53,w*0.80,h*0.62,p.id,LV.wobble);
  return shapePts("blob",w/2,h*0.54,w*0.68,h*0.58,p.id,LV.wobble*3)}
function bgPhoto(ctx,p,sid,boil){const r=seeded(sid+"|"+p.id+"|"+boil);const j=(p.jit??5)*LV.offset;ctx.save();ctx.translate(p.x+rr(r,-j,j),p.y+rr(r,-j,j));
  const pts=p.pts;ctx.save();ctx.shadowColor="rgba(0,0,0,0.22)";ctx.shadowBlur=8;ctx.shadowOffsetY=3;wobblyPath(ctx,pts);ctx.strokeStyle=P.light;ctx.lineWidth=12;ctx.lineJoin="round";ctx.stroke();ctx.restore();
  ctx.save();wobblyPath(ctx,pts);ctx.clip();ctx.filter=FILM;const cv=cover(ctx,IMG[p.img],0,0,p.w,p.h,p.fx,p.fy,p.zoom);ctx.filter="none";gradeColor(ctx,sid,p.w,p.h);ctx.restore();
  const im=IMG[p.img],u=p.subject;reg(ctx,"subject",p.id+"subj",(u.u*im.width-cv.sx)*cv.s,(u.v*im.height-cv.sy)*cv.s,u.w*im.width*cv.s,u.h*im.height*cv.s);
  regPoly(ctx,"photo",p.id,pts,{mask:p.mask});ctx.restore()}
function landmarkPiece(sid,r){const b=BASE[sid];const im=IMG[b.img];const sub=slot(sid,"landscape_subject")||b.subject;const ground=slot(sid,"landscape_ground")||b.ground;
  // P0-3: centre the landmark. Smallest zoom (1..1.7) whose crop window can be centred on the subject while containing it fully.
  const pa=PIECE.w/PIECE.h,ia=im.width/im.height;const cu=sub.u+sub.w/2,cv=sub.v+sub.h/2;let best=null;
  for(let z=1;z<=1.7001;z+=0.05){const cw=Math.min(1,pa/ia)/z,ch=Math.min(1,ia/pa)/z;const x0=cu-cw/2,y0=Math.max(0,Math.min(1-ch,cv-ch/2));
    if(sub.w>cw*0.92||sub.v<y0-1e-6||sub.v+sub.h>y0+ch+1e-6)continue;const xc=Math.max(0,Math.min(1-cw,x0));const off=Math.abs((xc+cw/2)-cu)/cw;best={z,fx:cw>=1?0.5:xc/(1-cw),fy:ch>=1?0.5:y0/(1-ch),off};if(off<0.04)break}
  if(!best)best={z:1,fx:0.5,fy:0.5,off:1};
  // v6: mask type is seeded per scene; candidates are tried in seeded order, first one that keeps the subject whole and covers ≥70% wins
  const forced=slot(sid,"landscape_mask");const pool=(forced?[forced]:MASKS.filter(m=>m!="skyline"||skyOf(b.img))).map(m=>[m,r()+(MASKUSE[m]||0)-(m=="skyline"?0.5:0)]).sort((x,y)=>x[1]-y[1]).map(x=>x[0]);let p=null;   /* masks already used in earlier scenes sort later → variety across the film */
  for(const mask of pool){p={id:sid+"main",img:b.img,...PIECE,fx:best.fx,fy:best.fy,zoom:best.z,subject:sub,ground,mask,jit:5,centerOff:+best.off.toFixed(3),tried:pool.indexOf(mask)+1};p.pts=maskPts(p);
    const s_=Math.max(p.w/im.width,p.h/im.height)*p.zoom,sx=(im.width-p.w/s_)*p.fx,sy=(im.height-p.h/s_)*p.fy;const bx=(sub.u*im.width-sx)*s_,by=(sub.v*im.height-sy)*s_,bw=sub.w*im.width*s_,bh=sub.h*im.height*s_;
    const h_=p.h;const ins=0.04;const cs=mask=="skyline"?[[bx+bw*ins,by+bh*(1-ins)],[bx+bw*(1-ins),by+bh*(1-ins)]]:[[bx+bw*ins,by+bh*ins],[bx+bw*(1-ins),by+bh*ins],[bx+bw*ins,by+bh*(1-ins)],[bx+bw*(1-ins),by+bh*(1-ins)],[bx+bw/2,by+bh*ins]];
    // stretch the mask upward (about the bottom edge) until the whole subject is inside; the shape then bleeds past the frame top at its sides
    const base=p.pts;for(let k=1;k<=1.8;k+=0.05){p.pts=base.map(([x,y])=>[x,h_-(h_-y)*k]);p.stretch=+k.toFixed(2);if(mask=="skyline"||cs.every(c=>pinPoly(c,p.pts)))break}
    p.subjectInside=cs.every(c=>pinPoly(c,p.pts));p.cover=+(polyArea(clipFrame(p.pts.map(([x,y])=>[x+p.x,y+p.y])))/(W*H)).toFixed(3);if(p.subjectInside&&p.cover>=minCover(mask))break}
  return p}
const BAND={S2:[110,820],S4:[80,560],S5:[80,560],S6:[80,560],S7:[80,560],S8:[80,560]};
function makeLayout(sid,attempt){const r=seeded(sid+"|layout|"+attempt);const L={attempt,sheets:makeSheets(sid,r),pieces:[],props:[],doodles:[]};const sc=SCENES.find(x=>x.id==sid);
  if(sid=="S1")Object.assign(L,s1Text(r));
  if(BASE[sid]){const p=landmarkPiece(sid,r);L.pieces.push(p);L.feet=p.y+p.h*p.ground}else L.feet=H-22;   // feet may be cut by the bottom edge only
  L.pcap=Math.max(0.64,1-0.03*Math.max(0,attempt-8));   /* re-rolls may shrink people (keeps building + info visible) */
  if(sc.person&&!placePeople(sid,L,r))L.peopleFail=true;
  // one line of script text (approved #4); wraps only when needed; fully inside frame (P0-1)
  if(BASE[sid]){const font=pick(r,P.en);const k=FONTK[font];const raw=slot(sid,"quote_en").split("\n");const c=document.createElement("canvas").getContext("2d");
    const band=BAND[sid];let sz=Math.round(rr(r,170,215)*k.k),lines;const maxW=W-2*MARGIN-90;
    for(;;){const A=wrapLines(c,raw,font,sz,maxW),B=wrapLines(c,[raw.join(" ")],font,sz,maxW);lines=(A.length>raw.length&&B.length<A.length)||A.length>3?B:A;if(sz*k.lh*lines.length+sz*0.35<=band[1]-band[0]||sz<=MIN_SCRIPT*k.k)break;sz-=6}
    const th=sz*k.lh*lines.length;const y0=rr(r,band[0],Math.max(band[0],band[1]-th-sz*0.3))+sz*0.78;
    L.script={font,size:sz,lines,y:y0,lh:k.lh,dx:rr(r,-16,16)*LV.offset,rot:rr(r,-2.5,2.5)*LV.tilt,stairs:sid=="S8"?rr(r,30,55):0,color:null}}
  // ≤1 real-object prop + ≤1 doodle, placed by rejection sampling; final legality is decided by the audit
  const fixedProp={S2:"polaroid",S3:"flowers",S9:"car"}[sid];const optional=!fixedProp&&sid!="S1"&&sid!="S10"&&r()<0.5;
  if(fixedProp||optional){const key=fixedProp||pick(r,P.props.filter(k=>IMG[k]));const pw=(key=="car"?rr(r,230,290):rr(r,190,260))*Math.max(0.62,1-0.012*attempt);/* fixed props shrink on re-roll until they fit */L.props.push({id:sid+"p0",key,x:0,y:0,w:pw,rot:(r()<0.5?-1:1)*rr(r,5,14)*LV.tilt,optional});}
  if(["S2","S4","S6","S8","S9"].includes(sid)&&r()<0.5+0.25*LV.extra)L.doodles.push({id:sid+"d",kind:sid=="S2"?"hearts":pick(r,P.doodles),x:0,y:0,s:rr(r,60,90),rot:rr(r,-0.4,0.4),color:pick(r,[P.scenes[sid][1],P.ink,mix(P.scenes[sid][1],P.ink,0.3)])});
  L.rand=r;return L}
// ---------- the audit: evaluated on real draw calls ----------
const INFO=["text","prop","info","tag","doodle"];
function aabb(p){const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)}}
function inter(a,b){return Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0))}
function auditList(A,settled){const v=[];const st={blocks:0,minBlockArea:1,overflow:0,buildingOcc:0,infoOcc:0,peopleOcc:0,positions:[]};A.forEach((e,i)=>{e.i=i;e.bb=aabb(e.poly)});
  const blocks=A.filter(e=>e.cat=="block");st.blocks=blocks.length;
  if(!settled)  // P0-10: doodles must not cross/cover readable text
  let doodleTextPx=0; const dls=A.filter(e=>e.cat=="doodle"); const txs=A.filter(e=>e.cat=="text"||e.cat=="tag");
  for(const d of dls) for(const t of txs){ const o=inter(d.bb,t.bb); if(o>0){ doodleTextPx+=o; v.push(`P0-10 doodle ${d.id} overlaps text ${t.id} (${Math.round(o)}px)`);} }
  st.doodleTextPx=doodleTextPx;
return {v,st};
  for(const b of blocks){const a=polyArea(clipFrame(b.poly))/(W*H);st.minBlockArea=Math.min(st.minBlockArea,a);if(a<0.18)v.push(`P0-4 small block ${b.id} ${(a*100).toFixed(1)}%`)}
  if(blocks.length>3)v.push(`P0-4 ${blocks.length} block layers`);
  const firstContent=A.findIndex(e=>e.cat!="block");for(const b of blocks)if(firstContent>=0&&b.i>firstContent)v.push(`P0-4 block ${b.id} drawn above content`);
  for(const e of A){if(e.cat=="block"||e.cat=="subject"||e.cat=="photo")continue;const b=e.bb;
    if(e.cat=="person"){if(b.x0<-0.5||b.x1>W+0.5||b.y0<-0.5){v.push(`P0-1 person ${e.id} out L/R/T (${b.x0|0},${b.y0|0},${b.x1|0})`);st.overflow++}}
    else if(b.x0<-0.5||b.y0<-0.5||b.x1>W+0.5||b.y1>H+0.5){v.push(`P0-1 ${e.cat} ${e.id} overflow (${b.x0|0},${b.y0|0},${b.x1|0},${b.y1|0})`);st.overflow++}}
  for(const s of A.filter(e=>e.cat=="subject")){const sa=(s.bb.x1-s.bb.x0)*(s.bb.y1-s.bb.y0);let occ=0;
    for(const e of A)if(e.i>s.i&&(INFO.includes(e.cat)||e.cat=="block"))occ+=inter(s.bb,e.bb);st.buildingOcc=Math.max(st.buildingOcc,occ/sa);
    const ph=A.find(e=>e.cat=="photo"&&s.id.startsWith(e.id));if(ph){const b=s.bb,iw=(b.x1-b.x0)*0.04,ih=(b.y1-b.y0)*0.04;const cs=ph.mask=="skyline"?[[b.x0+iw,b.y1-ih],[b.x1-iw,b.y1-ih]]:[[b.x0+iw,b.y0+ih],[b.x1-iw,b.y0+ih],[b.x0+iw,b.y1-ih],[b.x1-iw,b.y1-ih]];
      if(!cs.every(c=>pinPoly(c,ph.poly)))v.push("P0-3 building silhouette cut by photo mask");st.photoCover=+(polyArea(clipFrame(ph.poly))/(W*H)).toFixed(3);st.photoMask=ph.mask;if(st.photoCover<minCover(ph.mask)-0.01)v.push(`V6 photo cover ${st.photoCover}<${minCover(ph.mask)}`)}
    if(s.bb.x0<0||s.bb.x1>W||s.bb.y0<0||s.bb.y1>H)v.push("P0-3 building silhouette out of frame");}
  if(st.buildingOcc>0.02)v.push(`P0-3 building covered ${(st.buildingOcc*100).toFixed(1)}% by text/props`);
  for(const e of A)if(INFO.includes(e.cat))for(const b of blocks)if(b.i>e.i&&inter(e.bb,b.bb)>0){st.infoOcc++;v.push(`P0-5 block over ${e.id}`)}
  const tx=A.filter(e=>(e.cat=="text"||e.cat=="tag")&&!/patch$/.test(e.id));for(let i=0;i<tx.length;i++)for(let j=i+1;j<tx.length;j++){const a=tx[i],b=tx[j];if(a.id.replace(/t$/,"")==b.id.replace(/t$/,"")||(/script\d$/.test(a.id)&&/script\d$/.test(b.id))||(/^S1title/.test(a.id)&&/^S1title/.test(b.id)))continue;const o=inter(a.bb,b.bb);if(o>0.04*Math.min((a.bb.x1-a.bb.x0)*(a.bb.y1-a.bb.y0),(b.bb.x1-b.bb.x0)*(b.bb.y1-b.bb.y0))){v.push(`P0-5 info ${a.id} overlaps ${b.id}`);st.infoOcc++}}
  for(const s of A.filter(e=>e.cat=="subject")){const sa=(s.bb.x1-s.bb.x0)*(s.bb.y1-s.bb.y0);let o=0;for(const p of A.filter(e=>e.cat=="person"))o+=inter(s.bb,p.bb);st.buildingVisible=+(1-o/sa).toFixed(3)}
  const pe=A.filter(e=>e.cat=="person");for(const p of pe){st.positions.push(p.posIdx);for(const e of A)if(e.i>p.i&&e.cat!="person"&&inter(p.bb,e.bb)>0){st.peopleOcc++;v.push(`P0-3 ${e.id} over person`)}}
  if(pe.length>1)v.push("P0-2 more than one person sticker in frame");
  // info content must stay readable: people may not sit on top of text / name tags / swatches (cards themselves may be overlapped)
  for(const p of pe)for(const e of A)if((e.cat=="text"||e.cat=="tag"||(e.cat=="info"&&!/card|letter/.test(e.id)))&&inter(p.bb,e.bb)>0.02*(e.bb.x1-e.bb.x0)*(e.bb.y1-e.bb.y0)){st.infoOcc++;v.push(`P0-5 person over info ${e.id}`)}
  return {v,st}}
function drawFor(x,sid,f,b){if(sid=="S1")drawS1(x,f);else drawSceneLayers(x,sid,f,b)}
function auditState(sid,f,boil){const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");AUD=[];drawFor(x,sid,f,boil);const A=AUD;AUD=null;return auditList(A,true)}
function sceneStates(s){if(s.id=="S1")return [0,s.intro.screenOn];const fs=[s.land];if(s.person=="ab")fs.push(s.ab[0]);if(s.person=="jump"&&s.jumps.length)fs.push(s.jumps[0]);return fs}
function softChecks(sid,L){const e=[];for(const p of L.pieces){if(p.cover<minCover(p.mask))e.push(`photo cover ${p.cover}<${minCover(p.mask)} (${p.mask})`);if(!p.subjectInside)e.push(`P0-3 subject outside ${p.mask} mask`)}if(L.peopleFail)e.push("P0-2/P0-1 cannot fit two positions");if(L.script&&L.script.size<MIN_SCRIPT*FONTK[L.script.font].k-0.5)e.push("script too small");
  // text/props must stay off the people's union box (both positions)
  return e}
// place prop/doodle by rejection sampling against already-registered elements (+ people boxes of both positions)
function placeFree(sid,L,obj,box){const r=L.rand;const sc=SCENES.find(x=>x.id==sid);const occ=[];
  for(const f of sceneStates(sc))for(let b=0;b<3;b++){const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");AUD=[];drawFor(x,sid,f,b);for(const e of AUD)if(e.cat!="block"&&e.cat!="photo"&&!(e.cat=="info"&&/card|letter/.test(e.id))&&e.id!=obj.id){const b=aabb(e.poly);b.person=e.cat=="person";occ.push(b)}AUD=null}
  for(let t=0;t<60;t++){obj.x=rr(r,MARGIN,W-MARGIN);obj.y=rr(r,MARGIN,H-MARGIN);const bb=box(obj);const pad=14;
    if(bb.x0<MARGIN+pad||bb.y0<MARGIN+pad||bb.x1>W-MARGIN-pad||bb.y1>H-MARGIN-pad)continue;const ar=(bb.x1-bb.x0)*(bb.y1-bb.y0);
    // props may tuck partly behind a person (people are on top, so nothing covers people) but stay ≥70% visible; nothing may touch text/info
    if(occ.some(o=>o.person?inter(o,bb)>(obj.key?0.4:0)*ar:inter(o,{x0:bb.x0-pad,y0:bb.y0-pad,x1:bb.x1+pad,y1:bb.y1+pad})>0))continue;return true}
  return false}
function propBox(p){const h=propH(p),t=Math.abs(p.rot)*Math.PI/180;const hw=(p.w*Math.cos(t)+h*Math.sin(t))/2+10,hh=(p.w*Math.sin(t)+h*Math.cos(t))/2+10;return {x0:p.x-hw,y0:p.y-hh,x1:p.x+hw,y1:p.y+hh}}
function dBox(d){const b=doodleBox(d);return {x0:d.x+b[0]-30,y0:d.y+b[1]-30,x1:d.x+b[0]+b[2]+30,y1:d.y+b[1]+b[3]+30}}
function chooseScriptColor(sid,L){const c=document.createElement("canvas");c.width=W/4;c.height=H/4;const x=c.getContext("2d");x.scale(0.25,0.25);
  const saved=L.script;L.script=null;drawSceneLayers(x,sid,SCENES.find(s=>s.id==sid).land,0,true);L.script=saved;
  const y0=Math.max(0,(L.script.y-L.script.size)/4),hh=Math.max(1,Math.min(H/4-y0,L.script.size*L.script.lh*L.script.lines.length/4));const d=x.getImageData(0,y0,W/4,hh).data;const ls=[];
  for(let i=0;i<d.length;i+=16)ls.push(lum(rgb2hex([d[i],d[i+1],d[i+2]])));ls.sort((a,b)=>a-b);const med=ls[Math.floor(ls.length*0.5)];
  const pal=P.scenes[sid];const cands=[P.ink,P.light,pal[1],mix(pal[1],P.ink,0.45)];let best=null,bc=0;for(const col of cands){const cr=contrast(lum(col),med);if(cr>bc+0.4||(best==null)){if(cr>bc){bc=cr;best=col}}}
  return {color:best,ratio:bc}}
function buildLayouts(){for(const s of [...SCENES.slice(1),SCENES[0]]){let L,errs,att;
  for(att=0;att<40;att++){L=makeLayout(s.id,att);LAYOUT[s.id]=L;errs=softChecks(s.id,L);
    if(!errs.length&&L.script){const cc=chooseScriptColor(s.id,L);L.script.color=cc.color;L.script.contrast=+cc.ratio.toFixed(2);if(cc.ratio<3.0)errs.push("contrast "+cc.ratio.toFixed(2))}
    if(!errs.length)for(const p of [...L.props])if(!placeFree(s.id,L,p,propBox)){if(p.optional)L.props=L.props.filter(q=>q!=p);else errs.push("no room for prop "+p.key)}
    if(!errs.length)for(const d of [...L.doodles])if(!placeFree(s.id,L,d,dBox))L.doodles=L.doodles.filter(q=>q!=d);
    let vis=[];if(!errs.length)for(const f of sceneStates(s))for(let b=0;b<3;b++){const a=auditState(s.id,f,b);errs.push(...a.v);if(a.st.buildingVisible!=null)vis.push(a.st.buildingVisible)}
    if(!errs.length&&vis.length&&Math.max(...vis)<0.35)errs.push("building hidden behind people in both positions (max visible "+Math.max(...vis).toFixed(2)+")");
    if(!errs.length)break}
  for(const p of L.pieces)MASKUSE[p.mask]=(MASKUSE[p.mask]||0)+1;
  REROLLS[s.id]={attempts:att+1,lastErrors:[...new Set(errs)]};delete L.rand}}
function buildRansom(){const r=seeded("ransom");const fonts=P.ransomFonts;const c=document.createElement("canvas").getContext("2d");
  const lines=slot("S2","headline").split("\n");const glyphs=[];const shapes=["torn","round","blob"];
  const bases=lines.map(l=>Math.min(250,(W-2*MARGIN-80)/Math.max(3.2,l.length*0.74)));let y=180+bases[0]*0.75;
  for(const [li,line] of lines.entries()){let ws=[],tot=0;const base=bases[li];
    for(const ch of line){const f=pick(r,fonts);const sz=base*rr(r,0.9,1.12);const wt=f=="Kalam"?"400":"500";c.font=`${wt} ${sz}px "${f}"`;const w=ch==" "?base*0.32:Math.max(c.measureText(ch).width+base*0.26,base*0.66);ws.push({ch,f,sz,w,wt});tot+=w}
    const k=Math.min(1,(W-2*MARGIN-80)/tot);let x=W/2-tot*k/2;
    for(const g of ws){if(g.ch!=" "){const bg=pick(r,[P.scenes.S2[1],P.light,P.ink,mix(P.scenes.S2[1],P.ink,0.3),"#EEA4BA"]);const fg=lum(bg)>0.35?P.ink:P.light;
        glyphs.push({id:"rg"+glyphs.length,ch:g.ch,f:g.f,wt:g.wt,sz:g.sz*k,x:x+g.w*k/2,y:y+rr(r,-16,16)*LV.offset,w:g.w*k*0.98,h:g.sz*k*0.9,rot:(r()<0.5?-1:1)*rr(r,3,10)*LV.tilt*Math.PI/180,shape:pick(r,shapes),bg,fg})}x+=g.w*k}
    y+=base*0.5+(bases[li+1]||0)*0.95+28}
  return {glyphs}}
async function init(manifest,seed){M=manifest;SEED=seed;const st=M.style||{};P=Object.assign({},PRESETS[st.preset||"retro-warm"]);if(st.zhBody)P.zhBody=st.zhBody;if(st.zhTitle)P.zhTitle=st.zhTitle;if(st.penInk)P.penInk=st.penInk;LV=LEVELS[st.randomness||"medium"];
  const files={tv:"../cut/props/tv.png",polaroid:"../cut/props/polaroid.png",flowers:"../cut/props/flowers.png",car:"../cut/props/car.png",champ:"../cut/props/champagne.png",coupe:"../cut/props/coupe.png",vinyl:"../cut/props/vinyl.png",wine:"../cut/props/wine.png",camera:"../cut/props/camera.png",
   crumpled:"../raw/tex/crumpled.jpg",kraft:"../raw/tex/kraft.png"};
  for(const n of [4,5,6,7,8])files["L"+n]="../assets/S"+n+"_landscape.jpg";
  for(const p of ["S2_person","S4_person","S5_A","S5_B","S6_A","S6_B","S7_A","S7_B","S8_person","S9_person","S10_person"])files[p]="../cut/"+p+".png";
  for(const k in files)IMG[k]=await load(files[k]);
  TVS=await (await fetch("../"+(slot("S1","prop_tv_screen")||"cut/props/tv.screen.json"))).json();
  for(let b=0;b<3;b++){const c=document.createElement("canvas");c.width=c.height=512;const x=c.getContext("2d");const im=x.createImageData(512,512);const r=mulberry32(77+b);for(let i=0;i<im.data.length;i+=4){const v=r()*255;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255}x.putImageData(im,0,0);NOISE.push(c)}
  await document.fonts.ready;RANSOM=buildRansom();buildLayouts();
  return {seed:SEED,preset:st.preset||"retro-warm",randomness:st.randomness||"medium",rerolls:REROLLS,tv_screen:TVS,
    layout:Object.fromEntries(Object.entries(LAYOUT).map(([k,v])=>[k,{sheets:v.sheets.map(b=>b.kind+" "+b.color),props:v.props.map(p=>p.key+"@"+Math.round(p.x)+","+Math.round(p.y)),doodles:v.doodles.map(d=>d.kind),
      script:v.script?{font:v.script.font,size:v.script.size,lines:v.script.lines,color:v.script.color,contrast:v.script.contrast}:null,feet:Math.round(v.feet),pscale:v.pscale,photo:v.pieces.map(p=>({mask:p.mask,cover:p.cover,zoom:+p.zoom.toFixed(2)})),pos:v.pos}]))}}
let RANSOM=null;
// ---------- scene drawing: base sheet → stacked sheets → building photo → info cards → text → doodle → prop → contact shadow → people ----------
function drawSceneLayers(ctx,sid,f,boil,noPeople){const L=LAYOUT[sid];const pal=P.scenes[sid];const s=SCENES.find(x=>x.id==sid);
  basePaper(ctx,pal[0],boil,sid);L.sheets.forEach(b=>sheet(ctx,b,sid,boil));L.pieces.forEach(p=>bgPhoto(ctx,p,sid,boil));
  EXTRA[sid]&&EXTRA[sid].cards&&EXTRA[sid].cards(ctx,f,boil,L);
  if(L.script&&L.script.color)drawScript(ctx,L.script,sid);
  EXTRA[sid]&&EXTRA[sid].text&&EXTRA[sid].text(ctx,f,boil,L);
  L.doodles.forEach(d=>doodle(ctx,d));L.props.forEach(p=>prop(ctx,p,sid,boil));
  if(!noPeople)drawPerson(ctx,s,f,boil)}
function card(ctx,id,x,y,w,h,rot,color,tex,boil,sid){piece(ctx,{id,x,y,w,h,rot,color,tex,texA:0.45,jit:0,amp:7},sid,boil,"info")}
function nameTag(ctx,t,x,y,r,id){ctx.save();ctx.translate(x,y);ctx.rotate(r*Math.PI/180);ctx.fillStyle=P.light;ctx.shadowColor="rgba(0,0,0,.2)";ctx.shadowBlur=4;ctx.shadowOffsetY=2;const pts=tornPts(-170,-58,340,104,"tag"+t,4);wobblyPath(ctx,pts);ctx.fill();ctx.shadowColor="transparent";
  ctx.fillStyle="rgba(238,164,186,0.75)";ctx.save();ctx.rotate(-0.25);ctx.fillRect(-190,-70,70,28);ctx.restore();regPoly(ctx,"tag",id,pts);ctx.restore();textAt(ctx,t,"Caveat",70,x,y+14,r,P.ink,"center",id+"t")}
const EXTRA={
 S2:{text:(ctx,f,b,L)=>ransom(ctx,RANSOM)},
 S3:{cards:(ctx,f,b,L)=>card(ctx,"S3letter",70,150,940,1620,-1.2,P.scenes.S3[2],"kraft",b,"S3"),
     text:(ctx,f,b,L)=>{const Ls=slot("S3","letter_zh").split("\n");ctx.save();ctx.translate(540,0);ctx.rotate(-1.2*Math.PI/180);Ls.forEach((l,i)=>textAt(ctx,l,P.zhBody,56,0,330+i*56*1.8,0,P.ink,"center","S3l"+i));ctx.restore()}},
 S9:{cards:(ctx,f,b,L)=>card(ctx,"S9card",300,120,720,620,2.5,P.scenes.S9[2],null,b,"S9"),
     text:(ctx,f,b,L)=>{ctx.save();ctx.translate(660,0);ctx.rotate(2.5*Math.PI/180);textAt(ctx,slot("S9","schedule_title"),P.zhTitle,104,0,300,0,P.ink,"center","S9t");
       slot("S9","schedule").forEach((l,i)=>textAt(ctx,l,P.zhBody,62,0,440+i*96,0,P.ink,"center","S9s"+i));ctx.restore()}},
 S10:{cards:(ctx,f,b,L)=>card(ctx,"S10card",40,50,1000,700,-0.8,P.scenes.S10[2],null,b,"S10"),
     text:(ctx,f,b,L)=>{ctx.save();ctx.translate(0,0);ctx.rotate(-0.8*Math.PI/180);
       textAt(ctx,slot("S10","date"),P.zhBody,MIN_CJK+8,100,170,0,P.ink,"left","S10d");textAt(ctx,slot("S10","venue"),P.zhBody,MIN_CJK+8,100,256,0,P.ink,"left","S10v");
       textAt(ctx,slot("S10","hall"),P.zhTitle,92,100,372,0,mix(P.scenes.S10[0],P.ink,0.25),"left","S10h");
       // polished swatch strip: torn paper chips on one baseline, hex labels in small handwriting
       slot("S10","swatches").forEach((c,i)=>{const x=110+i*176,y=440;ctx.save();ctx.fillStyle=c;ctx.shadowColor="rgba(0,0,0,.18)";ctx.shadowBlur=3;ctx.shadowOffsetY=2;const pts=tornPts(x,y,140,120,"sw"+i,3);wobblyPath(ctx,pts);ctx.fill();ctx.restore();regPoly(ctx,"info","S10sw"+i,pts);
         textAt(ctx,c.toUpperCase(),"Caveat",34,x+70,y+152,0,P.ink,"center","S10swl"+i)});
       ctx.restore();
       textAt(ctx,slot("S10","closing_en"),"Dancing Script",92,W/2,712,-1.5,P.ink,"center","S10c");
       nameTag(ctx,M.names.groom_tag,270,845,-4,"tagG");nameTag(ctx,M.names.bride_tag,810,850,3,"tagB")}}};
// ---------- S1: real retro TV, screen = detected glass, push-in aligned to it ----------
function tvGeom(){const tv=IMG.tv;const tw=640,k=tw/tv.width,th=tv.height*k,tx=(W-tw)/2,ty=560;const [bx,by,bw,bh]=TVS.bbox;return {tx,ty,tw,th,sx:tx+bx*k,sy:ty+by*k,sw:bw*k,sh:bh*k,rad:TVS.corner_radius*k}}
let S1PM=null;
function drawS1(ctx,f,noScreenScene){S1PM=null;const b=boilOf(f);const L=LAYOUT.S1;basePaper(ctx,P.scenes.S1[0],b,"S1");L.sheets.forEach(x=>sheet(ctx,x,"S1",b));
  const T=tvGeom(),I=SCENES[0].intro;ctx.save();ctx.shadowColor="rgba(0,0,0,.28)";ctx.shadowBlur=14;ctx.shadowOffsetY=6;ctx.drawImage(IMG.tv,T.tx,T.ty,T.tw,T.th);ctx.restore();reg(ctx,"prop","S1tv",T.tx,T.ty,T.tw,T.th);
  ctx.save();ctx.beginPath();ctx.roundRect(T.sx,T.sy,T.sw,T.sh,T.rad);ctx.clip();
  if(f>=I.screenOn&&!noScreenScene){ctx.fillStyle="#000";ctx.fillRect(T.sx,T.sy,T.sw,T.sh);const k=T.sw/W;ctx.translate(T.sx,T.sy+T.sh/2-H*k/2);ctx.scale(k,k);const sv=AUD;AUD=null;ctx.save();drawSceneLayers(ctx,"S2",65,boilOf(65),true);ctx.restore();S1PM=ctx.getTransform();AUD=sv}
  else if(f<I.on){ctx.fillStyle="rgba(20,18,15,0.88)";ctx.fillRect(T.sx,T.sy,T.sw,T.sh)}
  else{const fl=I.flicker.filter(x=>x<=f);const st=fl.length%3;if(st==0){ctx.fillStyle="#0b0b0b";ctx.fillRect(T.sx,T.sy,T.sw,T.sh)}else if(st==1){ctx.fillStyle="#1b2a5a";ctx.fillRect(T.sx,T.sy,T.sw,T.sh);ctx.font='64px "Caveat"';useFont("Caveat","CH 0123456789");ctx.fillStyle="#7CFC7C";ctx.fillText("CH "+(100+fl.length%7),T.sx+T.sw-170,T.sy+80)}else{ctx.drawImage(NOISE[fl.length%3],0,0,120,120,T.sx,T.sy,T.sw,T.sh)}}
  // glass reflection so it reads as a real CRT
  const g=ctx.createLinearGradient(T.sx,T.sy,T.sx+T.sw,T.sy+T.sh);g.addColorStop(0,"rgba(255,255,255,0.16)");g.addColorStop(0.35,"rgba(255,255,255,0)");ctx.fillStyle=g;ctx.fillRect(T.sx,T.sy,T.sw,T.sh);ctx.restore();
  const sz=L.title.size;L.title.lines.forEach((l,i)=>textAt(ctx,l,L.title.font,sz,W/2+(i?40:-30),L.title.y+i*sz*L.title.lh*0.95,-2,P.ink,"center","S1title"+i));
  textAt(ctx,slot("S1","names_line"),"Dancing Script",L.names.size,W/2,L.names.y,-2,P.ink,"center","S1names");
  // P0-7: the S2 couple on the screen is drawn LAST (above glass reflection, TV bezel, title, names) so nothing ever covers them
  if(S1PM){const sv=AUD;AUD=null;ctx.save();ctx.setTransform(S1PM);drawPerson(ctx,SCENES[1],65,boilOf(65));ctx.restore();AUD=sv}}
function s1Text(r){const c=document.createElement("canvas").getContext("2d");const t=slot("S1","title_en");const font=pick(r,["Reenie Beanie","Caveat","Nothing You Could Do","Dancing Script"]);const k=FONTK[font];let sz=Math.round(150*k.k);
  let lines=wrapLines(c,[t],font,sz,W-2*MARGIN-80);if(lines.length==1&&t.includes(" "))lines=t.split(" ").length==2?t.split(" "):lines;for(const l of lines){c.font=`${sz}px "${font}"`;sz=Math.min(sz,sz*(W-2*MARGIN-80)/c.measureText(l).width)}
  let ns=120;c.font=`${ns}px "Dancing Script"`;ns=Math.min(ns,ns*(W-2*MARGIN-60)/c.measureText(slot("S1","names_line")).width);return {title:{font,lines,lh:k.lh,size:Math.floor(sz),y:120+sz*0.8},names:{size:Math.floor(ns),y:1740}}}
// ---------- composition ----------
function sceneAt(f){return SCENES.find(x=>f>=x.start&&f<=x.end)}
function stepsDone(s,f){return s.enter&&s.enter.steps?s.enter.steps.filter(x=>x<=f).length:3}
function sceneSettled(s,f){if(s.id=="S1")return f<s.intro.push[0];return !s.enter||s.enter.type=="cut"||stepsDone(s,f)>=3}
function drawScene(ctx,sid,f){ctx.save();if(sid=="S1")drawS1(ctx,f);else drawSceneLayers(ctx,sid,f,boilOf(f));ctx.restore()}
function render(ctx,f){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);const s=sceneAt(f);
  if(s.id=="S1"){const n=SCENES[0].intro.push.filter(x=>x<=f).length;const T=tvGeom();const cx=T.sx+T.sw/2,cy=T.sy+T.sh/2;const full=Math.max(W/T.sw,H/T.sh);
    const sc=Math.pow(full,n/3)*(n?1:1);const k=Math.min(1,n/2);const tx=cx+(W/2-cx)*k,ty=cy+(H/2-cy)*k;   // push-in centred on the glass, glass centre → frame centre
    ctx.save();ctx.translate(tx,ty);ctx.scale(sc,sc);ctx.translate(-cx,-cy);drawS1(ctx,f);ctx.restore()}
  else if(sceneSettled(s,f)){drawScene(ctx,s.id,f)}
  else{const i=SCENES.indexOf(s),prev=SCENES[i-1];const n=stepsDone(s,f);const d=s.enter.dir;const horiz=(d=="left"||d=="right");const size=horiz?W:H;
    const off=(3-n)*s.enter.stepFrac*size;const sign=(d=="left"||d=="up")?1:-1;const nv=sign*off,pv=nv-sign*size;
    const draw=(id,v)=>{ctx.save();horiz?ctx.translate(v,0):ctx.translate(0,v);drawScene(ctx,id,id==prev.id?prev.end:s.land);ctx.restore()};
    draw(prev.id,pv);draw(s.id,nv)}
  if(!NOGRAIN)grain(ctx,boilOf(f))}
// frame audit used by run.py on every unique rendered frame (P0 QA)
// P0-7 (v8): pixel-level person occlusion. Re-render the frame without grain while recording every person drawImage
// (full transform incl. scene pans / TV push-in); redraw those stickers alone; every opaque sticker pixel must match the frame.
let PREC=null,NOGRAIN=false;
function occlusion(f){const A=document.createElement("canvas");A.width=W;A.height=H;PREC=[];NOGRAIN=true;render(A.getContext("2d"),f);const rec=PREC;PREC=null;NOGRAIN=false;
  if(!rec.length)return {px:0,total:0};const B=document.createElement("canvas");B.width=W;B.height=H;const b=B.getContext("2d");
  for(const r of rec){b.setTransform(r.t);b.drawImage(IMG[r.key],r.x,r.y,r.w,r.h)}
  const a=A.getContext("2d").getImageData(0,0,W,H).data,d=b.getImageData(0,0,W,H).data;let px=0,tot=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]<255)continue;tot++;if(Math.abs(a[i]-d[i])>3||Math.abs(a[i+1]-d[i+1])>3||Math.abs(a[i+2]-d[i+2])>3)px++}
  return {px,total:tot}}
function renderAudit(f){const c=document.getElementById("c");AUD=[];render(c.getContext("2d"),f);const A=AUD;AUD=null;const s=sceneAt(f);const settled=sceneSettled(s,f);const r=auditList(A,settled);
  const o=occlusion(f);r.st.occludedPx=o.px;r.st.personPx=o.total;if(o.px>0)r.v.push(`P0-7 person occluded ${o.px}px of ${o.total}`);
  return [c.toDataURL("image/png"),{f,scene:s.id,settled,violations:r.v,stats:r.st}]}
function frameAudit(f){const s=sceneAt(f);const c=document.createElement("canvas");c.width=W;c.height=H;AUD=[];render(c.getContext("2d"),f);const A=AUD;AUD=null;const settled=sceneSettled(s,f);
  const r=auditList(A,settled);return {f,scene:s.id,settled,violations:r.v,stats:r.st}}
function stateKey(f){const s=sceneAt(f);const ps=personState(s,f);let k=[s.id,boilOf(f),ps?ps.ev:"-",stepsDone(s,f)];
  if(s.id=="S1"){const I=s.intro;k.push(f<I.on?-1:f<I.screenOn?I.flicker.filter(x=>x<=f).length:99,I.push.filter(x=>x<=f).length)}return k.join("|")}
function assertGlyphs(){const c=document.createElement("canvas").getContext("2d");const bad=[];
  for(const font in USED)for(const ch of USED[font]){if(!ch.trim())continue;c.font=`40px "${font}", monospace`;const a=c.measureText(ch).width;c.font=`40px "${font}", serif`;const b=c.measureText(ch).width;if(Math.abs(a-b)>0.01)bad.push(font+":"+ch)}
  return bad}
function usedFonts(){return Object.fromEntries(Object.entries(USED).map(([k,v])=>[k,v.size]))}

// v7 P0-6: person-only layer for the post-render completeness check (same transform/jitter as the real frame)
function personLayer(f){const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");const s=sceneAt(f);if(!s.person||!sceneSettled(s,f))return null;
  const L=LAYOUT[s.id];const st=personState(s,f);const g=personGeom(st.key,st.pos,L);const J=jit(s.id,boilOf(f));
  x.translate(g.cx+J.dx,g.by+J.dy);x.rotate((g.rot+J.dr)*Math.PI/180);x.drawImage(IMG[st.key],-g.w/2,-g.h,g.w,g.h);
  return {url:c.toDataURL("image/png"),key:st.key,xf:{x:g.cx+J.dx,y:g.by+J.dy,w:g.w,h:g.h,rot:g.rot+J.dr},size:[IMG[st.key].width,IMG[st.key].height]}}
function personSamples(){const out=[];for(const s of SCENES){if(!s.person)continue;const ev=s.person=="ab"?s.ab:s.jumps;out.push({scene:s.id,f:s.land,tag:"land"});ev.forEach((e,i)=>out.push({scene:s.id,f:e,tag:(s.person=="ab"?"AB":"jump")+(i+1)}))}return out}
