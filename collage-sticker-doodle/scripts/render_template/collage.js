// collage-sticker-doodle renderer (generalised from collage-stopmotion-invite v8). Helpers below are shared; scene plan is generated from the manifest + BGM + seed.
const W=1080,H=1920,MARGIN=12;
let GRID=[],BEATS=[],SCENES=[],TOTAL=0,PLAN=null;
const PERSON_H=0.50*H, MIN_SCRIPT=118, MIN_CJK=46, JIT_MAX=16, ROT_JIT=1.2;   // NEVER randomized
let IMG={},M=null,NOISE=[],P=null,LV=null,SEED=0,LAYOUT={},REROLLS={},TVS=null,AUD=null,USED={};
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const seeded=s=>mulberry32(hash(SEED+"|"+s));
const rr=(r,a,b)=>a+(b-a)*r(); const pick=(r,a)=>a[Math.floor(r()*a.length)];
function boilOf(f){let n=0;for(const g of GRID){if(g<=f)n++;else break}return n%3}
function load(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(src);i.src=src})}
const slot=(sid,k)=>{const s=SCENES.find(x=>x.id==sid);return s&&s.slots?s.slots[k]:undefined};
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
function paperTex(ctx,clipPath,sid,id,boil,alpha=0.28){alpha*=(P.texK??1);ctx.save();clipPath();ctx.clip();const r=seeded(sid+"|tex|"+id+"|"+boil);ctx.globalCompositeOperation="multiply";ctx.globalAlpha=alpha;ctx.filter=P.texFilter||"grayscale(1) contrast(1.1) brightness(1.25)";
  const t=TEX[P.tex];ctx.drawImage(t,rr(r,0,Math.max(0,t.width-700)),rr(r,0,Math.max(0,t.height-1245)),Math.min(700,t.width),Math.min(1245,t.height),-60,-60,W+120,H+120);ctx.filter="none";
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
function grain(ctx,boil){ctx.save();ctx.globalAlpha=P.grain??0.04;ctx.globalCompositeOperation="overlay";ctx.fillStyle=ctx.createPattern(NOISE[boil],"repeat");ctx.fillRect(0,0,W,H);ctx.restore()}
// ---------- text (handwritten only) ----------
const FONTK={"Reenie Beanie":{k:1.25,lh:0.80},"Nothing You Could Do":{k:0.78,lh:1.05},"Homemade Apple":{k:0.70,lh:1.15},"Caveat":{k:1.05,lh:0.88},"Dancing Script":{k:0.92,lh:1.0},"Kalam":{k:0.95,lh:1.0}};
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
function ransom(ctx,R){const shp=g=>{const w=g.w,h=g.h;return g.shape=="round"?shapePts("circle",0,-h*0.32,w*0.5,h*0.6,g.id,2):g.shape=="torn"?tornPts(-w/2,-h*0.92,w,h*1.15,g.id,5):shapePts("blob",0,-h*0.32,w*0.48,h*0.6,g.id,3)};
  // pass 1: all cut-paper patches; pass 2: all glyphs (a later patch can never hide an earlier letter)
  for(const g of R.glyphs){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rot);ctx.fillStyle=g.bg;ctx.shadowColor="rgba(0,0,0,.22)";ctx.shadowBlur=3;ctx.shadowOffsetY=2;const pts=shp(g);wobblyPath(ctx,pts);ctx.fill();ctx.shadowColor="transparent";if(g.outline){ctx.lineWidth=3.5;ctx.strokeStyle=g.outline;ctx.lineJoin="round";ctx.stroke()}regPoly(ctx,"text",g.id+"patch",pts);ctx.restore()}
  for(const g of R.glyphs){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rot);ctx.font=`${g.wt} ${g.sz}px "${g.f}"`;ctx.fillStyle=g.fg;ctx.textAlign="center";ctx.fillText(g.ch,0,0);useFont(g.f,g.ch);ctx.restore()}}
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
    let dy=0;if(2*dx<head){if(sc.person=="jump")dy=Math.sqrt(head*head-4*dx*dx)+0.03*gA.h;   /* +3%h: B is drawn at 0.96 scale, so its centre rises less than its feet */else{if(2*dx<0.55*head)continue;dy=Math.min(0.075*H,Math.sqrt(head*head-4*dx*dx))}}   /* A/B: B gets a small hop when the side shift alone is < head height */
    L.pos=[{dx:-side*dx,dy:0,s:1,rot:-side*rot},{dx:side*dx,dy:-dy,s:0.96,rot:side*rot}];return true}
  L.pos=[{dx:0,dy:0,s:1,rot:0},{dx:0,dy:-0.1*H,s:1,rot:0}];return false}
let BASE={};
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
  const pts=p.pts;ctx.save();ctx.shadowColor="rgba(0,0,0,0.22)";ctx.shadowBlur=8;ctx.shadowOffsetY=3;wobblyPath(ctx,pts);ctx.strokeStyle=P.photoBorder||P.light;ctx.lineWidth=12;ctx.lineJoin="round";ctx.stroke();ctx.restore();
  ctx.save();wobblyPath(ctx,pts);ctx.clip();ctx.filter=P.photoFilter||FILM;const cv=cover(ctx,IMG[p.img],0,0,p.w,p.h,p.fx,p.fy,p.zoom);ctx.filter="none";gradeColor(ctx,sid,p.w,p.h);ctx.restore();
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
  const tx=A.filter(e=>(e.cat=="text"||e.cat=="tag")&&!/patch$/.test(e.id));for(let i=0;i<tx.length;i++)for(let j=i+1;j<tx.length;j++){const a=tx[i],b=tx[j];if(a.id.replace(/t$/,"")==b.id.replace(/t$/,"")||(/script\d$/.test(a.id)&&/script\d$/.test(b.id))||(/title\d$/.test(a.id)&&/title\d$/.test(b.id))||(/^S1title/.test(a.id)&&/^S1title/.test(b.id)))continue;const o=inter(a.bb,b.bb);if(o>0.04*Math.min((a.bb.x1-a.bb.x0)*(a.bb.y1-a.bb.y0),(b.bb.x1-b.bb.x0)*(b.bb.y1-b.bb.y0))){v.push(`P0-5 info ${a.id} overlaps ${b.id}`);st.infoOcc++}}
  for(const s of A.filter(e=>e.cat=="subject")){const sa=(s.bb.x1-s.bb.x0)*(s.bb.y1-s.bb.y0);let o=0;for(const p of A.filter(e=>e.cat=="person"))o+=inter(s.bb,p.bb);st.buildingVisible=+(1-o/sa).toFixed(3)}
  const pe=A.filter(e=>e.cat=="person");for(const p of pe){st.positions.push(p.posIdx);for(const e of A)if(e.i>p.i&&e.cat!="person"&&inter(p.bb,e.bb)>0){st.peopleOcc++;v.push(`P0-3 ${e.id} over person`)}}
  if(pe.length>1)v.push("P0-2 more than one person sticker in frame");
  // info content must stay readable: people may not sit on top of text / name tags / swatches (cards themselves may be overlapped)
  for(const p of pe)for(const e of A)if((e.cat=="text"||e.cat=="tag"||(e.cat=="info"&&!/card|letter/.test(e.id)))&&inter(p.bb,e.bb)>0.02*(e.bb.x1-e.bb.x0)*(e.bb.y1-e.bb.y0)){st.infoOcc++;v.push(`P0-5 person over info ${e.id}`)}
  return {v,st}}
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
function tvGeom(){const tv=IMG.tv;const tw=640,k=tw/tv.width,th=tv.height*k,tx=(W-tw)/2,ty=560;const [bx,by,bw,bh]=TVS.bbox;return {tx,ty,tw,th,sx:tx+bx*k,sy:ty+by*k,sw:bw*k,sh:bh*k,rad:TVS.corner_radius*k}}
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
function assertGlyphs(){const c=document.createElement("canvas").getContext("2d");const bad=[];
  for(const font in USED)for(const ch of USED[font]){if(!ch.trim())continue;c.font=`40px "${font}", monospace`;const a=c.measureText(ch).width;c.font=`40px "${font}", serif`;const b=c.measureText(ch).width;if(Math.abs(a-b)>0.01)bad.push(font+":"+ch)}
  return bad}
function usedFonts(){return Object.fromEntries(Object.entries(USED).map(([k,v])=>[k,v.size]))}// ===================== collage-sticker-doodle: plan + scenes =====================
let TEX={},SRC={},USEDQ=new Set();
function fill(t){const n=M.names||{},i=M.info||{};return String(t).replace(/\{a\}/g,n.a||"").replace(/\{b\}/g,n.b||"").replace(/\{date\}/g,i.date||"").replace(/\{place\}/g,i.place||"")}
// ---------- procedural textures (no third-party assets) ----------
function procTex(kind){const w=1024,h=1820;const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");const r=mulberry32(hash("tex|"+kind));x.fillStyle="#d8d8d8";x.fillRect(0,0,w,h);
  if(kind=="newsprint"){for(let y=0;y<h;y+=3){x.fillStyle=`rgba(0,0,0,${0.03+0.04*r()})`;x.fillRect(0,y,w,1)}for(let i=0;i<9000;i++){x.fillStyle=`rgba(0,0,0,${0.06*r()})`;x.fillRect(r()*w,r()*h,1+r()*2,1)}
    x.fillStyle="rgba(0,0,0,0.05)";x.font='22px "Kalam"';for(let y=40;y<h;y+=34)for(let k=0;k<6;k++)x.fillRect(20+k*170,y,140*(0.6+0.4*r()),9)}
  else if(kind=="halftone"){for(let y=0;y<h;y+=14)for(let X=(y/14)%2*7;X<w;X+=14){const a=0.5+0.5*Math.sin(X/170+y/240)*Math.cos(y/310);x.fillStyle="rgba(0,0,0,0.22)";x.beginPath();x.arc(X,y,1+3.2*a,0,Math.PI*2);x.fill()}}
  else if(kind=="concrete"){const d=x.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const v=200+40*(r()-0.5)+20*Math.sin(i/4%w/37)*Math.sin(i/4/w/53);d.data[i]=d.data[i+1]=d.data[i+2]=v}x.putImageData(d,0,0);
    for(let i=0;i<600;i++){x.fillStyle=`rgba(0,0,0,${0.12*r()})`;x.beginPath();x.arc(r()*w,r()*h,r()*5,0,7);x.fill()}x.strokeStyle="rgba(0,0,0,0.12)";for(let i=0;i<14;i++){x.lineWidth=1+r()*2;x.beginPath();let px=r()*w,py=r()*h;x.moveTo(px,py);for(let k=0;k<8;k++){px+=(r()-0.5)*160;py+=r()*120;x.lineTo(px,py)}x.stroke()}}
  else if(kind=="photocopy"){const d=x.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const v=r()<0.012?40:225+25*(r()-0.5);d.data[i]=d.data[i+1]=d.data[i+2]=v}x.putImageData(d,0,0);x.fillStyle="rgba(0,0,0,0.10)";for(let i=0;i<40;i++)x.fillRect(0,r()*h,w,1+r()*3)}
  return c}
// ---------- plan: the storyboard (written by the agent) fixes WHAT happens; the seed only fills details it leaves open ----------
const LEN={place:[6,10],solo:[5,9],note:[8,12],list:[8,11],ransom:[4,7]};
function hexDist(a,b){const A=hex2rgb(a),B=hex2rgb(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function makePlan(){const r=seeded("plan");const bg=M.bgm||{};const SB=M.storyboard;const T=bg.T||12.25,off=bg.offset_frames??3.4;const dur=Math.min(bg.duration_sec||38.4,bg.max_sec||60);TOTAL=Math.round(dur*30);
  BEATS=[];for(let k=0;off+k*T<TOTAL-2;k++)BEATS.push(Math.round(off+k*T));const warn=[];
  const boilMult=SB.boil!=null?SB.boil:pick(r,P.boil);GRID=boilMult==1?[...BEATS]:BEATS.flatMap((b,i)=>[b,Math.round(b+T/2)]).filter(x=>x<TOTAL);
  const hasTV=!!(M.props&&M.props.tv);const IN=SB.intro||{},OUT=SB.outro||{};
  let intro=IN.layout||pick(r,P.intros.filter(k=>k!="tv"||hasTV));if(intro=="tv"&&!hasTV){warn.push("intro tv needs props.tv -> badge");intro="badge"}
  const outro=OUT.layout||pick(r,P.outros);const nb=BEATS.length;
  const introB=intro=="tv"?6:(IN.beats||Math.round(rr(r,4,5.99)));let outroB=OUT.beats||Math.round(rr(r,8,11.99));
  const mids=(SB.scenes||[]).map(s=>({...s,kind:s.type,nb:s.beats||Math.round(rr(r,LEN[s.type][0],LEN[s.type][1]+0.99))}));
  // fit the storyboard to the music: shrink long scenes toward their minimum, then drop trailing scenes; spare beats go round-robin, then to the outro
  let avail=nb-introB-outroB;let sum=()=>mids.reduce((a,c)=>a+c.nb,0);
  while(sum()>avail&&mids.some(c=>c.nb>LEN[c.kind][0]))for(const c of mids)if(sum()>avail&&c.nb>LEN[c.kind][0])c.nb--;
  while(sum()>avail&&mids.length){const d=mids.pop();warn.push(`dropped scene "${d.type}" (BGM too short)`)}
  let spare=avail-sum(),guard=0;while(spare>0&&guard++<200){let any=false;for(const c of mids)if(spare>0&&c.nb<LEN[c.kind][1]){c.nb++;spare--;any=true}if(!any)break}
  const OUTMAX=14;let outN=outroB+spare;if(outN>OUTMAX){warn.push(`storyboard ends ${outN-OUTMAX} beats before the BGM: film trimmed (add scenes to use the full track)`);outN=OUTMAX}
  const list=[{kind:"intro",layout:intro,nb:introB,...IN},...mids,{kind:"outro",layout:outro,...OUT,nb:outN}];
  {const used=introB+mids.reduce((a,c2)=>a+c2.nb,0)+outN;if(used<nb){TOTAL=Math.min(TOTAL,BEATS[used]+Math.round(T));BEATS=BEATS.filter(b=>b<TOTAL-2);GRID=GRID.filter(g=>g<TOTAL)}}
  const byId=Object.fromEntries((M.people||[]).map(p=>[p.id,p]));const autoQ=[...(M.people||[])];let ai=0;
  let bi=0;SCENES=[];list.forEach((c,i)=>{const id="S"+(i+1);const start=i==0?0:BEATS[bi];bi+=c.nb;const end=i==list.length-1?TOTAL-1:BEATS[bi]-1;
    const s={id,kind:c.kind,layout:c.layout,place:c.place,start,end,beat0:bi-c.nb,nb:c.nb,slots:{},want:c.stickers||null};
    if(i>0){const prevTV=list[i-1].layout=="tv";let t=prevTV?"cut":(c.transition||pick(r,P.transitions));const b=s.beat0;
      if(t.startsWith("pan")){const d=t.split("-")[1]||pick(r,["left","right","up","down"]);s.enter={type:"pan",dir:d,steps:[BEATS[b],BEATS[b+1],BEATS[b+2]],stepFrac:d=="left"||d=="right"?0.24:0.18}}
      else if(t.startsWith("tear"))s.enter={type:"tear",dir:t.split("-")[1]||pick(r,["left","right","up","down"]),steps:[BEATS[b],BEATS[b+1],BEATS[b+2]]};
      else if(t=="stamp")s.enter={type:"stamp",steps:[BEATS[b],BEATS[b+1]],rot:rr(r,-4,4)};
      else s.enter={type:"cut"}}
    s.land=s.enter&&s.enter.steps?s.enter.steps[s.enter.steps.length-1]:s.start;
    if(c.kind=="intro"&&c.layout=="tv")s.intro={on:3,flicker:GRID.filter(g=>g>4&&g<BEATS[2]).concat(BEATS.slice(0,2).map(b=>b+6)).sort((a,b)=>a-b),screenOn:BEATS[2],push:[BEATS[3],BEATS[4],BEATS[5]]};
    // people: explicit id, "auto" (round-robin, pairs first for place scenes) or null/absent on note scenes = nobody
    let pr=null;if(c.kind!="note"&&!(c.kind=="intro"&&c.layout=="tv")){if(c.person&&c.person!="auto"){pr=byId[c.person];if(!pr)warn.push(`${id}: unknown person ${c.person}`)}else if(c.person!==null&&autoQ.length){const pairs=autoQ.filter(p=>p.B);pr=c.kind=="place"&&pairs.length?pairs[ai%pairs.length]:autoQ[ai%autoQ.length];ai++}}
    if(pr){s.personRef=pr;let fl=c.flash||pick(r,pr.B?P.flash.filter(m=>m!="jump"):["jump"]);if(fl!="jump"&&!pr.B){warn.push(`${id}: flash ${fl} needs an A/B pair -> jump`);fl="jump"}s.person=fl}
    // text: verbatim from the storyboard
    if(c.kind=="place"||c.kind=="solo")s.slots.quote_en=fill(c.text||"");if(c.kind=="ransom")s.slots.headline=fill(c.text||"");
    if(c.kind=="intro")s.slots.title=fill(c.title||c.text||"");if(c.kind=="outro"){s.slots.closing=fill(c.text||"");s.slots.lines=(c.lines||[]).map(fill);s.slots.tags=(c.tags||[]).map(fill);s.slots.stamp=fill(c.stamp||"THE END")}
    if(c.kind=="note")s.slots.lines=(c.lines||[]).map(fill);if(c.kind=="list"){s.slots.title=fill(c.title||"");s.slots.items=(c.items||[]).map(fill)}
    SCENES.push(s)});
  for(const s of SCENES){if(!s.person)continue;const g=BEATS.filter(x=>x>=s.land+10&&x<=s.end-4);let ev;
    if(s.person=="ab")ev=g;else if(s.person=="stutter")ev=g.filter((x,i)=>i%5<3);else ev=g.filter((x,i)=>i%2==0);
    if(ev.length<2)ev=g.slice(0,Math.max(2,g.length));if(s.person=="jump")s.jumps=ev;else{s.ab=ev;s.flash=s.person;s.person="ab"}}
  // palettes: palette_bias (hex list) ranks the pack's palettes by distance; seed picks among the closest, never the same twice in a row
  let pool=P.palettes.map((p,k)=>k);if(SB.palette_bias&&SB.palette_bias.length){const d=k=>Math.min(...SB.palette_bias.map(h=>Math.min(hexDist(h,P.palettes[k][0]),hexDist(h,P.palettes[k][1]))));pool.sort((a,b)=>d(a)-d(b));pool=pool.slice(0,Math.max(2,Math.ceil(pool.length/2)))}
  P.scenes={};let last=-1;for(const s of SCENES){let k;let g=0;do{k=pick(r,pool)}while(k==last&&pool.length>1&&g++<20);last=k;P.scenes[s.id]=P.palettes[k]}
  for(const s of SCENES){if(s.kind=="place"){const pl=M.places[s.place];BASE[s.id]={img:"PL"+s.place,subject:pl.subject,ground:pl.ground??0.93};s.slots.landscape_subject=pl.subject;s.slots.landscape_ground=pl.ground}
    if(s.personRef){const p=s.personRef;if(s.person=="ab"){IMG[s.id+"_A"]=IMG["PA_"+p.id];IMG[s.id+"_B"]=IMG["PB_"+p.id];SRC[s.id+"_A"]=p.src;SRC[s.id+"_B"]=p.srcB}else{IMG[s.id+"_person"]=IMG["PA_"+p.id];SRC[s.id+"_person"]=p.src}}}
  PLAN={occasion:SB.occasion,mood:SB.mood,T,boilT:T*boilMult,boilMult,total:TOTAL,beats:BEATS.length,intro,outro,warnings:warn,scenes:SCENES.map(s=>({id:s.id,kind:s.kind,layout:s.layout,start:s.start,land:s.land,end:s.end,beats:s.nb,enter:s.enter?s.enter.type+(s.enter.dir?"-"+s.enter.dir:""):"-",person:s.person?(s.flash||s.person):null,personId:s.personRef?s.personRef.id:null,stickers:s.want,palette:P.scenes[s.id]}))}}
// ---------- tagged element library (all procedural). The storyboard picks by name or tag; packs supply the random fill-ins ----------
const ELEMENTS={
 star:["star","night","win","sparkle","fun"],burst:["burst","pop","sale","wow","party","energy"],sparkle:["sparkle","shine","magic","new"],heart:["heart","love","romance","cute"],
 flower:["flower","spring","garden","love","gentle"],smiley:["smiley","happy","funny","fun"],sun:["sun","summer","sunny","warm","day"],dots:["dots","pattern","retro"],
 spiral:["spiral","dizzy","fun","chaos"],check:["check","done","ok","list"],asterisk:["asterisk","note","accent"],bolt:["bolt","energy","electric","fast"],crown:["crown","king","best","birthday"],
 bubble:["bubble","talk","speech","funny"],tag:["tag","label","price","shop"],tape:["tape","craft","scrapbook"],washi:["washi","tape","craft","scrapbook","cute"],arrowSticker:["arrow","direction","go"],
 balloon:["balloon","party","birthday","celebrate","float"],cake:["cake","birthday","party","sweet","anniversary"],ticket:["ticket","travel","trip","concert","movie","admit"],
 ring:["ring","wedding","engagement","love","promise"],paw:["paw","cat","dog","pet","animal","cute"],umbrella:["umbrella","rain","rainy","weather","city"],raindrop:["raindrop","rain","rainy","water","sad","tear"],
 cloud:["cloud","rain","sky","weather","dream","grey"],moon:["moon","night","quiet","dream","sleep"],camera:["camera","photo","travel","memory","vlog"],coffee:["coffee","cafe","cozy","morning","city"],
 leaf:["leaf","nature","autumn","plant","calm"],gift:["gift","present","birthday","surprise","party"],note:["note","music","song","melody"],fish:["fish","cat","pet","sea","food"],
 house:["house","home","cozy","family"],postage:["postage","stamp","mail","travel","letter"],cap:["cap","graduation","school","college","grad"],envelope:["envelope","letter","mail","invite"],
 bone:["bone","dog","pet","funny"],plane:["plane","travel","trip","flight"],yarn:["yarn","cat","cozy","knit","pet"]};
const DOODLES={arrow:["arrow","point","direction"],zigzag:["zigzag","energy","fun"],underline:["underline","emphasis"],circleMark:["circle","highlight","emphasis"],scribble:["scribble","messy","fun"],
 rays:["rays","sun","shine","retro"],spray:["spray","graffiti","street"],crownMark:["crown","best","graffiti"],hearts:["hearts","love","cute"],rainlines:["rain","rainy","weather","melancholy"]};
function resolveElement(q,r){q=String(q).toLowerCase();if(ELEMENTS[q])return {kind:q,doodle:false};if(DOODLES[q])return {kind:q,doodle:true};
  const a=Object.keys(ELEMENTS).filter(k=>ELEMENTS[k].includes(q)),b=Object.keys(DOODLES).filter(k=>DOODLES[k].includes(q));if(a.length)return {kind:pick(r,a),doodle:false};if(b.length)return {kind:pick(r,b),doodle:true};return null}
// ---------- procedural sticker + doodle library ----------
function starPts(n,R,r0){const p=[];for(let i=0;i<n*2;i++){const a=-Math.PI/2+i*Math.PI/n;const q=i%2?r0:R;p.push([Math.cos(a)*q,Math.sin(a)*q])}return p}
function stickerShape(ctx,k,s,r){const S=s;ctx.beginPath();
  if(k=="star")starPts(5,S*0.55,S*0.24).forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));
  else if(k=="burst")starPts(12,S*0.58,S*0.40).forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));
  else if(k=="sparkle")starPts(4,S*0.58,S*0.13).forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));
  else if(k=="heart"){shapePts("heart",0,0,S*0.55,S*0.55,"stk"+S,0).forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p))}
  else if(k=="flower"){for(let i=0;i<=120;i++){const t=i/120*Math.PI*2;const q=S*(0.38+0.16*Math.cos(t*6));i?ctx.lineTo(Math.cos(t)*q,Math.sin(t)*q):ctx.moveTo(Math.cos(t)*q,Math.sin(t)*q)}}
  else if(k=="smiley"||k=="sun"||k=="dots"||k=="spiral"||k=="check"||k=="asterisk")ctx.arc(0,0,S*0.48,0,Math.PI*2);
  else if(k=="bolt"){[[0.1,-0.6],[-0.32,0.06],[-0.02,0.06],[-0.14,0.6],[0.34,-0.1],[0.04,-0.1],[0.18,-0.6]].forEach((p,i)=>i?ctx.lineTo(p[0]*S,p[1]*S):ctx.moveTo(p[0]*S,p[1]*S))}
  else if(k=="crown"){[[-0.55,0.35],[-0.55,-0.25],[-0.28,0.05],[0,-0.45],[0.28,0.05],[0.55,-0.25],[0.55,0.35]].forEach((p,i)=>i?ctx.lineTo(p[0]*S,p[1]*S):ctx.moveTo(p[0]*S,p[1]*S))}
  else if(k=="bubble"){ctx.ellipse(0,-S*0.05,S*0.62,S*0.40,0,0,Math.PI*2);ctx.moveTo(-S*0.2,S*0.28);ctx.lineTo(-S*0.42,S*0.6);ctx.lineTo(S*0.02,S*0.32)}
  else if(k=="tag"){ctx.moveTo(-S*0.62,-S*0.28);ctx.lineTo(S*0.40,-S*0.28);ctx.lineTo(S*0.64,0);ctx.lineTo(S*0.40,S*0.28);ctx.lineTo(-S*0.62,S*0.28)}
  else if(k=="tape"||k=="washi"){const pts=tornPts(-S*0.75,-S*0.17,S*1.5,S*0.34,"tp"+S,2);pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p))}
  else if(k=="arrowSticker"){[[-0.6,-0.14],[0.18,-0.14],[0.18,-0.36],[0.62,0],[0.18,0.36],[0.18,0.14],[-0.6,0.14]].forEach((p,i)=>i?ctx.lineTo(p[0]*S,p[1]*S):ctx.moveTo(p[0]*S,p[1]*S))}
  else if(k=="balloon"){ctx.ellipse(0,-S*0.1,S*0.36,S*0.45,0,0,Math.PI*2);ctx.moveTo(-S*0.06,S*0.36);ctx.lineTo(S*0.06,S*0.36);ctx.lineTo(0,S*0.30)}
  else if(k=="cake"){ctx.rect(-S*0.5,0,S*1.0,S*0.42);ctx.rect(-S*0.34,-S*0.28,S*0.68,S*0.30);ctx.rect(-S*0.04,-S*0.52,S*0.08,S*0.26)}
  else if(k=="ticket"||k=="postage"){const w=S*(k=="ticket"?0.66:0.46),h=S*(k=="ticket"?0.34:0.56);ctx.moveTo(-w,-h);ctx.lineTo(w,-h);if(k=="ticket"){ctx.lineTo(w,-h*0.3);ctx.arc(w,0,h*0.3,-Math.PI/2,Math.PI/2,true);}ctx.lineTo(w,h);ctx.lineTo(-w,h);if(k=="ticket"){ctx.lineTo(-w,h*0.3);ctx.arc(-w,0,h*0.3,Math.PI/2,-Math.PI/2,true)}}
  else if(k=="ring"){ctx.arc(0,S*0.1,S*0.38,0,Math.PI*2);ctx.moveTo(0,-S*0.6);ctx.lineTo(S*0.2,-S*0.36);ctx.lineTo(0,-S*0.2);ctx.lineTo(-S*0.2,-S*0.36)}
  else if(k=="paw"){ctx.ellipse(0,S*0.14,S*0.28,S*0.24,0,0,Math.PI*2);for(const [x,y] of [[-0.34,-0.14],[-0.13,-0.38],[0.13,-0.38],[0.34,-0.14]]){ctx.moveTo(x*S+S*0.12,y*S);ctx.ellipse(x*S,y*S,S*0.12,S*0.15,0,0,Math.PI*2)}}
  else if(k=="umbrella"){ctx.moveTo(-S*0.6,-S*0.02);ctx.quadraticCurveTo(-S*0.6,-S*0.6,0,-S*0.6);ctx.quadraticCurveTo(S*0.6,-S*0.6,S*0.6,-S*0.02);ctx.lineTo(S*0.04,-S*0.02);ctx.lineTo(S*0.04,S*0.42);ctx.quadraticCurveTo(S*0.04,S*0.6,-S*0.14,S*0.56);ctx.lineTo(-S*0.12,S*0.48);ctx.quadraticCurveTo(-S*0.04,S*0.5,-S*0.04,S*0.42);ctx.lineTo(-S*0.04,-S*0.02)}
  else if(k=="raindrop"){ctx.moveTo(0,-S*0.58);ctx.bezierCurveTo(S*0.2,-S*0.25,S*0.38,0,S*0.38,S*0.18);ctx.arc(0,S*0.18,S*0.38,0,Math.PI);ctx.bezierCurveTo(-S*0.38,0,-S*0.2,-S*0.25,0,-S*0.58)}
  else if(k=="cloud"){for(const [x,y,q] of [[-0.3,0.08,0.24],[0,-0.1,0.32],[0.3,0.06,0.26]]){ctx.moveTo(x*S+q*S,y*S);ctx.arc(x*S,y*S,q*S,0,Math.PI*2)}ctx.rect(-S*0.5,S*0.05,S*1.0,S*0.24)}
  else if(k=="moon"){ctx.arc(0,0,S*0.48,0.9,Math.PI*2-0.9,false);ctx.arc(S*0.26,0,S*0.38,Math.PI*2-1.25,1.25,true)}
  else if(k=="camera"){ctx.rect(-S*0.6,-S*0.28,S*1.2,S*0.66);ctx.rect(-S*0.22,-S*0.42,S*0.44,S*0.16)}
  else if(k=="coffee"){ctx.moveTo(-S*0.38,-S*0.3);ctx.lineTo(S*0.38,-S*0.3);ctx.lineTo(S*0.30,S*0.5);ctx.lineTo(-S*0.30,S*0.5);ctx.closePath();ctx.moveTo(S*0.36,-S*0.1);ctx.arc(S*0.40,S*0.06,S*0.17,-Math.PI/2,Math.PI/2)}
  else if(k=="leaf"){ctx.moveTo(0,-S*0.6);ctx.quadraticCurveTo(S*0.55,-S*0.1,0,S*0.5);ctx.quadraticCurveTo(-S*0.55,-S*0.1,0,-S*0.6)}
  else if(k=="gift"){ctx.rect(-S*0.46,-S*0.18,S*0.92,S*0.64);ctx.rect(-S*0.52,-S*0.36,S*1.04,S*0.2);ctx.moveTo(0,-S*0.36);ctx.ellipse(-S*0.16,-S*0.46,S*0.16,S*0.1,0,0,Math.PI*2);ctx.moveTo(S*0.32,-S*0.46);ctx.ellipse(S*0.16,-S*0.46,S*0.16,S*0.1,0,0,Math.PI*2)}
  else if(k=="note"){ctx.ellipse(-S*0.2,S*0.34,S*0.2,S*0.15,-0.4,0,Math.PI*2);ctx.rect(-S*0.04,-S*0.5,S*0.1,S*0.84);ctx.moveTo(S*0.06,-S*0.5);ctx.quadraticCurveTo(S*0.45,-S*0.35,S*0.36,-S*0.05);ctx.lineTo(S*0.06,-S*0.25)}
  else if(k=="fish"){ctx.ellipse(-S*0.08,0,S*0.42,S*0.26,0,0,Math.PI*2);ctx.moveTo(S*0.28,0);ctx.lineTo(S*0.6,-S*0.26);ctx.lineTo(S*0.6,S*0.26)}
  else if(k=="house"){ctx.moveTo(-S*0.56,-S*0.02);ctx.lineTo(0,-S*0.56);ctx.lineTo(S*0.56,-S*0.02);ctx.lineTo(S*0.42,-S*0.02);ctx.lineTo(S*0.42,S*0.5);ctx.lineTo(-S*0.42,S*0.5);ctx.lineTo(-S*0.42,-S*0.02)}
  else if(k=="cap"){ctx.moveTo(0,-S*0.46);ctx.lineTo(S*0.66,-S*0.18);ctx.lineTo(0,S*0.1);ctx.lineTo(-S*0.66,-S*0.18);ctx.closePath();ctx.moveTo(-S*0.34,-S*0.02);ctx.lineTo(-S*0.34,S*0.3);ctx.quadraticCurveTo(0,S*0.48,S*0.34,S*0.3);ctx.lineTo(S*0.34,-S*0.02)}
  else if(k=="envelope"){ctx.rect(-S*0.6,-S*0.38,S*1.2,S*0.76)}
  else if(k=="bone"){for(const x of [-0.42,0.42])for(const y of [-0.12,0.12]){ctx.moveTo(x*S+S*0.15,y*S);ctx.arc(x*S,y*S,S*0.15,0,Math.PI*2)}ctx.rect(-S*0.42,-S*0.12,S*0.84,S*0.24)}
  else if(k=="plane"){[[0.62,0],[-0.1,-0.12],[-0.3,-0.55],[-0.44,-0.55],[-0.3,-0.1],[-0.55,-0.08],[-0.62,-0.26],[-0.7,-0.26],[-0.64,0],[-0.7,0.26],[-0.62,0.26],[-0.55,0.08],[-0.3,0.1],[-0.44,0.55],[-0.3,0.55],[-0.1,0.12]].forEach((p,i)=>i?ctx.lineTo(p[0]*S,p[1]*S):ctx.moveTo(p[0]*S,p[1]*S))}
  else if(k=="yarn"){ctx.arc(0,0,S*0.44,0,Math.PI*2);ctx.moveTo(S*0.3,S*0.32);ctx.quadraticCurveTo(S*0.6,S*0.6,S*0.2,S*0.62);ctx.lineTo(S*0.22,S*0.56);ctx.quadraticCurveTo(S*0.5,S*0.52,S*0.26,S*0.36)}
  else ctx.arc(0,0,S*0.48,0,Math.PI*2);ctx.closePath()}
function stickerBox(d){const s=d.s*(d.kind=="tape"||d.kind=="washi"?1.6:1.35)+40;return {x0:d.x-s/2,y0:d.y-s/2,x1:d.x+s/2,y1:d.y+s/2}}
function drawSticker(ctx,d){ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);const S=d.s;
  if(d.doodle){drawDoodleStroke(ctx,d);ctx.restore();return}
  // white die-cut border + soft shadow, then the face
  ctx.save();ctx.shadowColor="rgba(0,0,0,0.25)";ctx.shadowBlur=5;ctx.shadowOffsetY=3;stickerShape(ctx,d.kind,S);ctx.lineJoin="round";ctx.lineWidth=d.kind=="tape"||d.kind=="washi"?0:S*0.14;ctx.strokeStyle=P.stickerBorder;if(ctx.lineWidth)ctx.stroke();ctx.fillStyle=d.c1;ctx.fill();ctx.restore();
  stickerShape(ctx,d.kind,S);ctx.fillStyle=d.c1;if(d.kind=="tape"||d.kind=="washi"){ctx.globalAlpha=0.78}ctx.fill();ctx.globalAlpha=1;
  ctx.fillStyle=d.c2;ctx.strokeStyle=d.c2;ctx.lineWidth=Math.max(3,S*0.06);ctx.lineCap="round";
  if(d.kind=="washi"){ctx.save();stickerShape(ctx,d.kind,S);ctx.clip();for(let i=-6;i<7;i++){ctx.fillRect(i*S*0.22,-S,S*0.08,S*2)}ctx.restore()}
  if(d.kind=="smiley"){ctx.beginPath();ctx.arc(-S*0.16,-S*0.1,S*0.05,0,7);ctx.arc(S*0.16,-S*0.1,S*0.05,0,7);ctx.fill();ctx.beginPath();ctx.arc(0,S*0.02,S*0.24,0.2,Math.PI-0.2);ctx.stroke()}
  if(d.kind=="sun"){for(let i=0;i<10;i++){const a=i/10*Math.PI*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*S*0.2,Math.sin(a)*S*0.2);ctx.lineTo(Math.cos(a)*S*0.38,Math.sin(a)*S*0.38);ctx.stroke()}}
  if(d.kind=="dots"){for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){if(x*x+y*y>10)continue;ctx.beginPath();ctx.arc(x*S*0.12,y*S*0.12,S*0.035,0,7);ctx.fill()}}
  if(d.kind=="spiral"){ctx.beginPath();for(let i=0;i<=80;i++){const t=i/80*Math.PI*5;const q=S*0.04+t*S*0.022;i?ctx.lineTo(Math.cos(t)*q,Math.sin(t)*q):ctx.moveTo(0,0)}ctx.stroke()}
  if(d.kind=="check"){ctx.beginPath();ctx.moveTo(-S*0.22,0);ctx.lineTo(-S*0.05,S*0.18);ctx.lineTo(S*0.25,-S*0.2);ctx.stroke()}
  if(d.kind=="asterisk"){for(let i=0;i<3;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*S*0.3,Math.sin(a)*S*0.3);ctx.lineTo(-Math.cos(a)*S*0.3,-Math.sin(a)*S*0.3);ctx.stroke()}}
  if(d.kind=="flower"){ctx.beginPath();ctx.arc(0,0,S*0.12,0,7);ctx.fill()}
  const L2=(x0,y0,x1,y1)=>{ctx.beginPath();ctx.moveTo(x0*S,y0*S);ctx.lineTo(x1*S,y1*S);ctx.stroke()};
  if(d.kind=="balloon"){ctx.beginPath();ctx.moveTo(0,S*0.36);ctx.quadraticCurveTo(S*0.12,S*0.5,-S*0.02,S*0.62);ctx.stroke();ctx.globalAlpha=0.35;ctx.fillStyle=P.light;ctx.beginPath();ctx.ellipse(-S*0.14,-S*0.28,S*0.06,S*0.12,0.4,0,7);ctx.fill();ctx.globalAlpha=1}
  if(d.kind=="cake"){ctx.fillStyle=d.c2;ctx.fillRect(-S*0.5,S*0.12,S,S*0.06);ctx.fillStyle="#FFB000";ctx.beginPath();ctx.ellipse(0,-S*0.6,S*0.05,S*0.09,0,0,7);ctx.fill()}
  if(d.kind=="ticket"){ctx.setLineDash([S*0.05,S*0.05]);L2(0.3,-0.3,0.3,0.3);ctx.setLineDash([]);d.label=d.label||"ADMIT 1"}
  if(d.kind=="postage"){ctx.strokeRect(-S*0.34,-S*0.44,S*0.68,S*0.88);ctx.beginPath();ctx.arc(0,-S*0.05,S*0.16,0,7);ctx.fill()}
  if(d.kind=="ring"){ctx.fillStyle=mix(d.c1,P.light,0.6);ctx.beginPath();ctx.arc(0,S*0.1,S*0.26,0,7);ctx.fill();ctx.fillStyle=d.c2}
  if(d.kind=="umbrella"){L2(-0.3,-0.04,-0.12,-0.56);L2(0.3,-0.04,0.12,-0.56)}
  if(d.kind=="camera"){ctx.beginPath();ctx.arc(0,S*0.05,S*0.2,0,7);ctx.stroke();ctx.beginPath();ctx.arc(S*0.4,-S*0.14,S*0.05,0,7);ctx.fill()}
  if(d.kind=="coffee"){ctx.beginPath();ctx.moveTo(-S*0.1,-S*0.42);ctx.quadraticCurveTo(-S*0.2,-S*0.54,-S*0.08,-S*0.64);ctx.moveTo(S*0.1,-S*0.42);ctx.quadraticCurveTo(0,-S*0.54,S*0.12,-S*0.64);ctx.stroke()}
  if(d.kind=="leaf"){L2(0,-0.5,0,0.45);L2(0,-0.1,0.18,-0.25);L2(0,0.1,-0.18,-0.05)}
  if(d.kind=="gift"){ctx.fillRect(-S*0.06,-S*0.36,S*0.12,S*0.82)}
  if(d.kind=="fish"){ctx.beginPath();ctx.arc(-S*0.28,-S*0.05,S*0.045,0,7);ctx.fill()}
  if(d.kind=="house"){ctx.fillRect(-S*0.1,S*0.18,S*0.2,S*0.32)}
  if(d.kind=="envelope"){ctx.beginPath();ctx.moveTo(-S*0.6,-S*0.38);ctx.lineTo(0,S*0.06);ctx.lineTo(S*0.6,-S*0.38);ctx.stroke()}
  if(d.kind=="yarn"){for(let i=-2;i<=2;i++){ctx.beginPath();ctx.ellipse(0,0,S*0.44,S*0.12*Math.abs(i)+S*0.04,0.6,0,Math.PI);ctx.stroke()}}
  if(d.kind=="cloud"||d.kind=="moon"||d.kind=="raindrop"){ctx.globalAlpha=0.35;ctx.fillStyle=P.light;ctx.beginPath();ctx.arc(-S*0.12,-S*0.05,S*0.07,0,7);ctx.fill();ctx.globalAlpha=1}
  if(d.label){ctx.font=`${Math.round(S*0.30)}px "${d.font}"`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle=d.c2;ctx.fillText(d.label,d.kind=="tag"?-S*0.05:0,-S*0.04);useFont(d.font,d.label)}
  const b=S*(d.kind=="tape"||d.kind=="washi"?0.8:0.66);reg(ctx,"doodle",d.id,-b,-b,2*b,2*b);ctx.restore()}
function drawDoodleStroke(ctx,d){const S=d.s;ctx.strokeStyle=d.c1;ctx.fillStyle=d.c1;ctx.lineWidth=d.w||7;ctx.lineCap="round";ctx.lineJoin="round";const r=seeded("dd|"+d.id);
  if(d.kind=="arrow"){ctx.beginPath();ctx.moveTo(-S*0.6,S*0.3);ctx.quadraticCurveTo(-S*0.1,-S*0.5,S*0.55,-S*0.05);ctx.stroke();ctx.beginPath();ctx.moveTo(S*0.55,-S*0.05);ctx.lineTo(S*0.30,-S*0.22);ctx.moveTo(S*0.55,-S*0.05);ctx.lineTo(S*0.36,S*0.17);ctx.stroke()}
  else if(d.kind=="zigzag"||d.kind=="underline"){ctx.beginPath();for(let i=0;i<=10;i++){const x=-S*0.65+i*S*0.13,y=d.kind=="zigzag"?(i%2?-1:1)*S*0.12:Math.sin(i)*S*0.03;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}
  else if(d.kind=="circleMark"||d.kind=="scribble"){ctx.beginPath();for(let i=0;i<=90;i++){const t=i/90*Math.PI*2*(d.kind=="scribble"?2.6:1.15);const q=S*(0.48+0.05*Math.sin(t*3));i?ctx.lineTo(Math.cos(t)*q*1.15,Math.sin(t)*q*0.7):ctx.moveTo(Math.cos(t)*q*1.15,Math.sin(t)*q*0.7)}ctx.stroke()}
  else if(d.kind=="rays"){for(let i=0;i<9;i++){const a=-Math.PI*0.9+i*Math.PI*0.1;ctx.beginPath();ctx.moveTo(Math.cos(a)*S*0.2,Math.sin(a)*S*0.2+S*0.3);ctx.lineTo(Math.cos(a)*S*0.6,Math.sin(a)*S*0.6+S*0.3);ctx.stroke()}}
  else if(d.kind=="spray"){for(let i=0;i<260;i++){const a=r()*7,q=Math.pow(r(),1.6)*S*0.6;ctx.globalAlpha=0.5;ctx.beginPath();ctx.arc(Math.cos(a)*q,Math.sin(a)*q*0.6,1+r()*2.5,0,7);ctx.fill()}ctx.globalAlpha=1}
  else if(d.kind=="rainlines"){for(let i=0;i<9;i++){const x=(r()-0.5)*S*1.2,y=(r()-0.5)*S*1.0;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-S*0.08,y+S*0.26);ctx.stroke()}}
  else if(d.kind=="crownMark"){ctx.beginPath();[[-0.5,0.25],[-0.5,-0.2],[-0.25,0.05],[0,-0.35],[0.25,0.05],[0.5,-0.2],[0.5,0.25]].forEach((p,i)=>i?ctx.lineTo(p[0]*S,p[1]*S):ctx.moveTo(p[0]*S,p[1]*S));ctx.closePath();ctx.stroke()}
  else if(d.kind=="hearts"){for(const [dx,dy,k] of [[0,0,1],[S*0.45,S*0.35,.6]]){ctx.save();ctx.translate(dx-S*0.2,dy-S*0.15);wobblyPath(ctx,shapePts("heart",0,0,S*0.3*k,S*0.3*k,d.id+dx,1));ctx.fill();ctx.restore()}}
  const b=S*0.72;reg(ctx,"doodle",d.id,-b,-b,2*b,2*b)}
function makeStickers(sid,L,r,n,want){const pal=P.scenes[sid];const picks=[];
  if(want&&want.length)for(const q of want){const e=resolveElement(q,r);if(e)picks.push(e)}   // storyboard choice (by name or tag)
  else for(let i=0;i<n;i++){const dood=r()<0.4;picks.push({kind:dood?pick(r,P.doodles):pick(r,P.stickers),doodle:dood})}
  picks.forEach((e,i)=>{const dood=e.doodle,kind=e.kind;
  const c1=dood?pick(r,[P.ink,pal[1],mix(pal[1],P.ink,0.35)]):pick(r,[pal[1],mix(pal[1],"#FFFFFF",0.35),P.light,mix(pal[0],P.ink,0.15)]);let c2=lum(c1)>0.4?P.ink:P.light;
  const label=(kind=="tag"||kind=="bubble")?pick(r,["wow!","yay","no.1","hi!","ok!","go!","lol"]):null;
  L.stickers.push({id:sid+"st"+i,kind,doodle:dood,x:0,y:0,s:rr(r,120,200)*(dood?1.1:1),rot:rr(r,-0.35,0.35)*LV.tilt,c1,c2,label,font:pick(r,P.en),w:dood?rr(r,6,10):0})})}
// ---------- text blocks ----------
function fitSize(c,lines,font,sz,maxW){for(const l of lines){c.font=`${sz}px "${font}"`;const w=c.measureText(l).width;if(w>maxW)sz=Math.floor(sz*maxW/w)}return sz}
function ransomLines(text){if(text.includes("\n"))return text.split("\n").map(s=>s.trim()).filter(Boolean);const ws=text.trim().split(/\s+/);if(ws.length==1)return ws;
  // smart break: try every split into 2 (or 3) lines, keep words whole, minimise the longest line (balanced, no orphans)
  let best=null;const n=ws.length;const cost=ls=>Math.max(...ls.map(l=>l.length))+(ls.length-2)*2;
  for(let a=1;a<n;a++){const t=[ws.slice(0,a).join(" "),ws.slice(a).join(" ")];if(!best||cost(t)<cost(best))best=t;
    for(let b=a+1;b<n&&n>=4;b++){const t3=[ws.slice(0,a).join(" "),ws.slice(a,b).join(" "),ws.slice(b).join(" ")];if(cost(t3)<cost(best))best=t3}}
  return Math.max(...best.map(l=>l.length))<=1?[ws.join(" ")]:best}
function buildRansomFor(sid,text,y0){const r=seeded("ransom|"+sid);const fonts=P.ransomFonts;const c=document.createElement("canvas").getContext("2d");
  const lines=ransomLines(text);const glyphs=[];const shapes=["torn","round","blob"];const pal=P.scenes[sid];
  // patch colours: whole palette + paper/ink tints; legibility comes from the letter colour (best of ink/paper) and an ink outline when patch≈background
  const cc=[pal[1],P.light,P.ink,mix(pal[1],P.ink,0.35),mix(pal[1],P.light,0.55),mix(pal[0],P.ink,0.4),pal[2],mix(pal[0],P.light,0.5)].filter((q,k,a)=>a.indexOf(q)==k);
  const order=[...cc].sort(()=>r()-0.5);
  const maxW=W-2*MARGIN-110;const bases=lines.map(l=>Math.min(230,maxW/Math.max(3.2,l.replace(/ /g,"").length*0.80+(l.split(" ").length-1)*0.45)));let y=y0+bases[0]*0.75;let last=null;
  for(const [li,line] of lines.entries()){let ws=[],tot=0;const base=bases[li];
    for(const ch of line){const f=pick(r,fonts);const sz=base*rr(r,0.9,1.1);const wt="400";c.font=`${wt} ${sz}px "${f}"`;const w=ch==" "?base*0.45:Math.max(c.measureText(ch).width+base*0.30,base*0.70);ws.push({ch,f,sz,w,wt});tot+=w}
    const k=Math.min(1,maxW/tot);let x=W/2-tot*k/2;
    for(const g of ws){if(g.ch!=" "){let bg=order[glyphs.length%order.length];if(bg==last)bg=order[(glyphs.length+1)%order.length];last=bg;
        const fg=contrast(lum(bg),lum(P.ink))>=contrast(lum(bg),lum(P.light))?P.ink:P.light;const low=Math.min(contrast(lum(bg),lum(pal[0])),contrast(lum(bg),lum(pal[1])))<1.35;
        glyphs.push({id:sid+"rg"+glyphs.length,ch:g.ch,f:g.f,wt:g.wt,sz:g.sz*k,x:x+g.w*k/2,y:y+rr(r,-12,12)*LV.offset,w:g.w*k*0.84,h:g.sz*k*0.9,rot:(r()<0.5?-1:1)*rr(r,3,9)*LV.tilt*Math.PI/180,shape:pick(r,shapes),bg,fg,outline:low?(fg==P.ink?P.ink:mix(P.ink,"#000000",0.2)):null})}x+=g.w*k}
    y+=base*0.5+(bases[li+1]||0)*0.95+34}
  return {glyphs,bottom:y}}
// ---------- layouts per scene kind ----------
const BANDS={place:[80,560],solo:[110,760]};
function scriptFor(sid,L,r,band,txt){const font=pick(r,P.en);const k=FONTK[font];const raw=txt.split("\n");const c=document.createElement("canvas").getContext("2d");let sz=Math.round(rr(r,170,215)*k.k),lines;const maxW=W-2*MARGIN-90;
  for(;;){const A=wrapLines(c,raw,font,sz,maxW),B=wrapLines(c,[raw.join(" ")],font,sz,maxW);lines=(A.length>raw.length&&B.length<A.length)||A.length>3?B:A;if(sz*k.lh*lines.length+sz*0.35<=band[1]-band[0]||sz<=MIN_SCRIPT*k.k)break;sz-=6}
  const th=sz*k.lh*lines.length;const y0=rr(r,band[0],Math.max(band[0],band[1]-th-sz*0.3))+sz*0.78;
  L.script={font,size:sz,lines,y:y0,lh:k.lh,dx:rr(r,-16,16)*LV.offset,rot:rr(r,-2.5,2.5)*LV.tilt,stairs:r()<0.25?rr(r,25,50):0,color:null}}
function makeLayout(sid,attempt){const r=seeded(sid+"|layout|"+attempt);const sc=SCENES.find(x=>x.id==sid);const L={attempt,sheets:makeSheets(sid,r),pieces:[],props:[],doodles:[],stickers:[],kind:sc.kind,layout:sc.layout};
  const pal=P.scenes[sid];L.feet=H-22;L.pcap=Math.max(0.6,1-0.03*Math.max(0,attempt-6));
  if(sc.kind=="place"){const p=landmarkPiece(sid,r);L.pieces.push(p);L.feet=p.y+p.h*p.ground;scriptFor(sid,L,r,BANDS.place,slot(sid,"quote_en"))}
  if(sc.kind=="solo")scriptFor(sid,L,r,BANDS.solo,slot(sid,"quote_en"));
  if(sc.kind=="ransom"){L.ransom=buildRansomFor(sid,slot(sid,"headline"),rr(r,110,200));L.pcap=Math.min(L.pcap,0.86)}
  if(sc.kind=="note"){const lines=slot(sid,"lines");const c=document.createElement("canvas").getContext("2d");const cw=rr(r,820,940),x=(W-cw)/2;const lh=1.75;let sz=fitSize(c,lines,P.zh,74,cw-130);const ch=Math.min(H-260,sz*lh*lines.length+300);
    L.card={id:sid+"card",x,y:rr(r,140,Math.max(150,H-ch-160)),w:cw,h:ch,rot:rr(r,-1.6,1.6)*LV.tilt,color:pal[2],tex:P.tex=="crumpled"?"kraft":null};L.noteLines=lines;L.noteSize=sz;L.lh=lh}
  if(sc.kind=="list"){const c=document.createElement("canvas").getContext("2d");const items=slot(sid,"items");const cw=rr(r,680,780);const sz=fitSize(c,items,P.zh,62,cw-90);
    L.card={id:sid+"card",x:r()<0.5?60:W-60-cw,y:rr(r,110,170),w:cw,h:250+items.length*sz*1.55,rot:rr(r,-2.5,2.5)*LV.tilt,color:pal[2]};L.items=items;L.itemSize=sz;L.pcap=Math.min(L.pcap,0.82)}
  if(sc.kind=="intro"){const t=slot(sid,"title");const font=pick(r,P.en);const k=FONTK[font];const c=document.createElement("canvas").getContext("2d");
    if(sc.layout=="tv"){L.title=titleBlock(c,t,font,k,120);L.names={size:110,y:1740}}
    else if(sc.layout=="ransom"){L.ransom=buildRansomFor(sid,t,rr(r,110,180));L.sub=null}
    else if(sc.layout=="badge"){const R=rr(r,330,380);L.badge={id:sid+"badgecard",cx:W/2+rr(r,-40,40),cy:R+rr(r,90,150),R,color:pal[2],rot:rr(r,-6,6)};L.title=titleBlock(c,t,font,k,L.badge.cy-R*0.35,R*1.6);L.pcap=Math.min(L.pcap,0.8)}
    else if(sc.layout=="polaroid"){const pl=M.places.length?Math.floor(r()*M.places.length):-1;const pw=rr(r,600,680);L.polaroid={id:sid+"polcard",x:(W-pw)/2+rr(r,-50,50),y:rr(r,330,420),w:pw,h:pw*1.18,rot:rr(r,-6,6)*LV.tilt,img:pl>=0?"PL"+pl:null};L.title=titleBlock(c,t,font,k,110);L.pcap=Math.min(L.pcap,0.78)}}
  if(sc.kind=="outro"){const font=pick(r,P.en);const k=FONTK[font];const c=document.createElement("canvas").getContext("2d");const t=slot(sid,"closing");
    if(sc.layout=="card"){const cw=rr(r,900,1000);L.card={id:sid+"card",x:(W-cw)/2,y:rr(r,50,90),w:cw,h:660,rot:rr(r,-1.2,1.2),color:pal[2]};L.closing=titleBlock(c,t,font,k,L.card.y+470,cw-120,96);L.tags=slot(sid,"tags").filter(Boolean)}
    else if(sc.layout=="wall"){L.closing=titleBlock(c,t,font,k,rr(r,180,260),W-140,150)}
    else if(sc.layout=="stamp"){const R=rr(r,230,280);L.stamp={id:sid+"stampcard",cx:rr(r,R+60,W-R-60),cy:R+rr(r,90,140),R,rot:rr(r,-14,14),text:slot(sid,"stamp")};L.closing=titleBlock(c,t,font,k,L.stamp.cy+R+150,W-140,120);L.pcap=Math.min(L.pcap,0.78)}
    else if(sc.layout=="filmstrip"){const pls=M.places.map((_,i)=>"PL"+i).slice(0,3);L.strip={id:sid+"stripcard",y:rr(r,90,140),h:400,rot:rr(r,-3,3),imgs:pls};L.closing=titleBlock(c,t,font,k,L.strip.y+560,W-140,120);L.pcap=Math.min(L.pcap,0.8)}}
  if(sc.person&&!placePeople(sid,L,r))L.peopleFail=true;
  const dens=P.density;let n=Math.round(rr(r,dens[0],dens[1]+0.99))+(sc.layout=="wall"?3:0);if(sc.kind=="note")n=Math.min(n,2);makeStickers(sid,L,r,n,sc.want);
  L.rand=r;return L}
function titleBlock(c,t,font,k,y,maxW=W-2*MARGIN-80,sz0=150){let sz=Math.round(sz0*k.k);let lines=wrapLines(c,[t],font,sz,maxW);if(lines.length==1&&t.includes(" ")&&t.length>14){const w=t.split(" ");const h=Math.ceil(w.length/2);lines=[w.slice(0,h).join(" "),w.slice(h).join(" ")]}
  sz=fitSize(c,lines,font,sz,maxW);return {font,lines,lh:k.lh,size:sz,y:y+sz*0.8}}
// ---------- drawing ----------
function drawTitle(ctx,T,id,color,dx=0){T.lines.forEach((l,i)=>textAt(ctx,l,T.font,T.size,W/2+dx+(i%2?30:-20),T.y+i*T.size*T.lh*0.95,-2,color,"center",id+"title"+i))}
function cardDraw(ctx,c,sid,boil){piece(ctx,{id:c.id,x:c.x,y:c.y,w:c.w,h:c.h,rot:c.rot,color:c.color,tex:c.tex,texA:0.45,jit:0,amp:7,img:c.img,grade:c.img?(P.photoFilter||FILM):undefined},sid,boil,"info")}
const KIND={
 note:(ctx,L,sid,b)=>{cardDraw(ctx,L.card,sid,b);const c=L.card;ctx.save();ctx.translate(c.x+c.w/2,c.y+c.h/2);ctx.rotate(c.rot*Math.PI/180);const h0=-c.h/2+150;
   L.noteLines.forEach((l,i)=>textAt(ctx,l,P.zh,L.noteSize,0,h0+i*L.noteSize*L.lh,0,P.penInk,"center",sid+"n"+i));ctx.restore()},
 list:(ctx,L,sid,b)=>{cardDraw(ctx,L.card,sid,b);const c=L.card;ctx.save();ctx.translate(c.x+c.w/2,c.y);ctx.rotate(c.rot*Math.PI/180);textAt(ctx,slot(sid,"title"),P.zh,100,0,170,0,P.penInk,"center",sid+"lt");
   L.items.forEach((l,i)=>textAt(ctx,l,P.zh,L.itemSize,0,300+i*L.itemSize*1.55,0,P.penInk,"center",sid+"li"+i));ctx.restore()},
 ransom:(ctx,L,sid,b)=>ransom(ctx,L.ransom),
 intro:(ctx,L,sid,b)=>{const s=SCENES.find(x=>x.id==sid);const pal=P.scenes[sid];
   if(L.layout=="ransom")ransom(ctx,L.ransom);
   if(L.layout=="badge"){const B=L.badge;ctx.save();ctx.translate(B.cx,B.cy);ctx.rotate(B.rot*Math.PI/180);const pts=shapePts("circle",0,0,B.R,B.R,B.id,2);ctx.shadowColor="rgba(0,0,0,.22)";ctx.shadowBlur=8;ctx.shadowOffsetY=4;wobblyPath(ctx,pts);ctx.fillStyle=B.color;ctx.fill();ctx.shadowColor="transparent";
     ctx.lineWidth=10;ctx.strokeStyle=pal[1];ctx.setLineDash([2,18]);ctx.lineCap="round";wobblyPath(ctx,shapePts("circle",0,0,B.R*0.88,B.R*0.88,B.id+"i",2));ctx.stroke();ctx.setLineDash([]);regPoly(ctx,"info",B.id,pts);ctx.restore();drawTitle(ctx,L.title,sid,P.ink,B.cx-W/2)}
   if(L.layout=="polaroid"){const p=L.polaroid;cardDraw(ctx,{id:p.id,x:p.x,y:p.y,w:p.w,h:p.h,rot:p.rot,color:"#FBFAF6"},sid,b);if(p.img){ctx.save();ctx.translate(p.x+p.w/2,p.y+p.h/2);ctx.rotate(p.rot*Math.PI/180);ctx.beginPath();ctx.rect(-p.w/2+34,-p.h/2+34,p.w-68,p.w-68);ctx.clip();ctx.filter=P.photoFilter||FILM;cover(ctx,IMG[p.img],-p.w/2+34,-p.h/2+34,p.w-68,p.w-68);ctx.filter="none";ctx.restore()}
     drawTitle(ctx,L.title,sid,P.ink)}
   if(L.layout=="tv")drawTitle(ctx,L.title,sid,P.ink)},
 outro:(ctx,L,sid,b)=>{const pal=P.scenes[sid];
   if(L.layout=="card"){cardDraw(ctx,L.card,sid,b);const c=L.card;const info=M.info||{};let y=c.y+150;
     slot(sid,"lines").slice(0,3).forEach((v,k)=>{textAt(ctx,v,P.zh,MIN_CJK+12,c.x+90,y,0,P.penInk,"left",sid+"i"+k);y+=96});
     drawTitle(ctx,L.closing,sid,P.ink);L.tags.slice(0,2).forEach((t,i)=>nameTag(ctx,t,i?810:270,c.y+c.h+150+(i?6:0),i?3:-4,sid+"tag"+i))}
   if(L.layout=="wall")drawTitle(ctx,L.closing,sid,P.ink);
   if(L.layout=="stamp"){const S=L.stamp;ctx.save();ctx.translate(S.cx,S.cy);ctx.rotate(S.rot*Math.PI/180);const col=mix(pal[1],P.ink,0.25);const pts=shapePts("circle",0,0,S.R,S.R,S.id,1.5);ctx.fillStyle=mix(pal[2],P.light,0.3);wobblyPath(ctx,pts);ctx.fill();
     ctx.lineWidth=12;ctx.strokeStyle=col;wobblyPath(ctx,pts);ctx.stroke();ctx.lineWidth=5;wobblyPath(ctx,shapePts("circle",0,0,S.R*0.82,S.R*0.82,S.id+"i",1.5));ctx.stroke();regPoly(ctx,"info",S.id,pts);ctx.restore();
     const c=document.createElement("canvas").getContext("2d");const f=pick(seeded(sid+"stf"),P.ransomFonts);const ls=S.text.split(" ").length>2?[S.text.split(" ").slice(0,2).join(" "),S.text.split(" ").slice(2).join(" ")]:[S.text];const sz=fitSize(c,ls,f,120,S.R*1.45);
     ctx.save();ctx.translate(S.cx,S.cy);ctx.rotate(S.rot*Math.PI/180);ls.forEach((l,i)=>textAt(ctx,l,f,sz,0,(i-(ls.length-1)/2)*sz*1.0+sz*0.35,0,col,"center",sid+"stamp"+i));ctx.restore();drawTitle(ctx,L.closing,sid,P.ink)}
   if(L.layout=="filmstrip"){const S=L.strip;ctx.save();ctx.translate(W/2,S.y+S.h/2);ctx.rotate(S.rot*Math.PI/180);ctx.fillStyle="#141414";const pts=tornPts(-W/2+30,-S.h/2,W-60,S.h,S.id,4);ctx.shadowColor="rgba(0,0,0,.3)";ctx.shadowBlur=8;wobblyPath(ctx,pts);ctx.fill();ctx.shadowColor="transparent";
     ctx.fillStyle="#F2F2F2";for(let x=-W/2+60;x<W/2-60;x+=48){ctx.fillRect(x,-S.h/2+16,24,22);ctx.fillRect(x,S.h/2-38,24,22)}const n=Math.max(1,S.imgs.length),fw=(W-160-(n-1)*24)/n;
     S.imgs.forEach((k,i)=>{const x=-W/2+80+i*(fw+24);ctx.save();ctx.beginPath();ctx.rect(x,-S.h/2+56,fw,S.h-112);ctx.clip();ctx.filter=P.photoFilter||FILM;cover(ctx,IMG[k],x,-S.h/2+56,fw,S.h-112);ctx.filter="none";ctx.restore()});regPoly(ctx,"info",S.id,pts);ctx.restore();drawTitle(ctx,L.closing,sid,P.ink)}}};
function nameTag(ctx,t,x,y,r,id){ctx.save();ctx.translate(x,y);ctx.rotate(r*Math.PI/180);ctx.fillStyle=P.light;ctx.shadowColor="rgba(0,0,0,.2)";ctx.shadowBlur=4;ctx.shadowOffsetY=2;const pts=tornPts(-170,-58,340,104,"tag"+t,4);wobblyPath(ctx,pts);ctx.fill();ctx.shadowColor="transparent";
  ctx.fillStyle="rgba(238,164,186,0.75)";ctx.save();ctx.rotate(-0.25);ctx.fillRect(-190,-70,70,28);ctx.restore();regPoly(ctx,"tag",id,pts);ctx.restore();textAt(ctx,t,"Caveat",70,x,y+14,r,P.ink,"center",id+"t")}
function drawSceneLayers(ctx,sid,f,boil,noPeople){const L=LAYOUT[sid];const pal=P.scenes[sid];const s=SCENES.find(x=>x.id==sid);
  basePaper(ctx,pal[0],boil,sid);L.sheets.forEach(b=>sheet(ctx,b,sid,boil));L.pieces.forEach(p=>bgPhoto(ctx,p,sid,boil));
  if(KIND[s.kind])KIND[s.kind](ctx,L,sid,boil);
  if(L.script&&L.script.color)drawScript(ctx,L.script,sid);
  L.stickers.forEach(d=>drawSticker(ctx,d));L.props.forEach(p=>prop(ctx,p,sid,boil));
  if(!noPeople)drawPerson(ctx,s,f,boil)}
// ---------- TV intro (optional, needs manifest.props.tv) ----------
let S1PM=null;
function drawTV(ctx,f,noPeople){S1PM=null;const s=SCENES[0],nx=SCENES[1];const b=boilOf(f);const L=LAYOUT[s.id];basePaper(ctx,P.scenes[s.id][0],b,s.id);L.sheets.forEach(x=>sheet(ctx,x,s.id,b));
  const T=tvGeom(),I=s.intro;ctx.save();ctx.shadowColor="rgba(0,0,0,.28)";ctx.shadowBlur=14;ctx.shadowOffsetY=6;ctx.drawImage(IMG.tv,T.tx,T.ty,T.tw,T.th);ctx.restore();reg(ctx,"prop","S1tv",T.tx,T.ty,T.tw,T.th);
  ctx.save();ctx.beginPath();ctx.roundRect(T.sx,T.sy,T.sw,T.sh,T.rad);ctx.clip();
  if(f>=I.screenOn){ctx.fillStyle="#000";ctx.fillRect(T.sx,T.sy,T.sw,T.sh);const k=T.sw/W;ctx.translate(T.sx,T.sy+T.sh/2-H*k/2);ctx.scale(k,k);const sv=AUD;AUD=null;ctx.save();drawSceneLayers(ctx,nx.id,nx.land,boilOf(nx.land),true);ctx.restore();S1PM=ctx.getTransform();AUD=sv}
  else if(f<I.on){ctx.fillStyle="rgba(20,18,15,0.88)";ctx.fillRect(T.sx,T.sy,T.sw,T.sh)}
  else{const fl=I.flicker.filter(x=>x<=f);const st=fl.length%3;if(st==0){ctx.fillStyle="#0b0b0b";ctx.fillRect(T.sx,T.sy,T.sw,T.sh)}else if(st==1){ctx.fillStyle="#1b2a5a";ctx.fillRect(T.sx,T.sy,T.sw,T.sh)}else{ctx.drawImage(NOISE[fl.length%3],0,0,120,120,T.sx,T.sy,T.sw,T.sh)}}
  const g=ctx.createLinearGradient(T.sx,T.sy,T.sx+T.sw,T.sy+T.sh);g.addColorStop(0,"rgba(255,255,255,0.16)");g.addColorStop(0.35,"rgba(255,255,255,0)");ctx.fillStyle=g;ctx.fillRect(T.sx,T.sy,T.sw,T.sh);ctx.restore();
  drawTitle(ctx,L.title,s.id,P.ink);const nm=[M.names&&M.names.a,M.names&&M.names.b].filter(Boolean).join(" & ");if(nm)textAt(ctx,nm,"Dancing Script",Math.min(110,fitSize(document.createElement("canvas").getContext("2d"),[nm],"Dancing Script",110,W-140)),W/2,L.names.y,-2,P.ink,"center",s.id+"names");
  // P0-7: the next scene's people are drawn LAST (above bezel, reflection, title) -> never covered
  if(S1PM&&nx.person&&!noPeople){const sv=AUD;AUD=null;ctx.save();ctx.setTransform(S1PM);drawPerson(ctx,nx,nx.land,boilOf(nx.land));ctx.restore();AUD=sv}}
// ---------- composition ----------
function sceneAt(f){return SCENES.find(x=>f>=x.start&&f<=x.end)||SCENES[SCENES.length-1]}
function stepsDone(s,f){return s.enter&&s.enter.steps?s.enter.steps.filter(x=>x<=f).length:3}
function isTV(s){return s.kind=="intro"&&s.layout=="tv"}
function sceneSettled(s,f){if(isTV(s))return f<s.intro.push[0];if(!s.enter||!s.enter.steps)return true;return stepsDone(s,f)>=s.enter.steps.length}
function drawFor(x,sid,f,b,noPeople){const s=SCENES.find(q=>q.id==sid);if(isTV(s))drawTV(x,f,noPeople);else drawSceneLayers(x,sid,f,b,noPeople)}
function drawScene(ctx,sid,f,noPeople){ctx.save();drawFor(ctx,sid,f,boilOf(f),noPeople);ctx.restore()}
function sceneStates(s){if(isTV(s))return [s.start,s.intro.screenOn];const fs=[s.land];if(s.person=="ab"&&s.ab.length)fs.push(s.ab[0]);if(s.person=="jump"&&s.jumps.length)fs.push(s.jumps[0]);return fs}
function render(ctx,f){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);const s=sceneAt(f);
  if(isTV(s)){const n=s.intro.push.filter(x=>x<=f).length;const T=tvGeom();const cx=T.sx+T.sw/2,cy=T.sy+T.sh/2;const full=Math.max(W/T.sw,H/T.sh);
    const sc=Math.pow(full,n/3);const k=Math.min(1,n/2);const tx=cx+(W/2-cx)*k,ty=cy+(H/2-cy)*k;ctx.save();ctx.translate(tx,ty);ctx.scale(sc,sc);ctx.translate(-cx,-cy);drawTV(ctx,f);ctx.restore()}
  else if(sceneSettled(s,f))drawScene(ctx,s.id,f);
  else{const i=SCENES.indexOf(s),prev=SCENES[i-1];const n=stepsDone(s,f);const E=s.enter;const pf=isTV(prev)?prev.end:prev.end;
    if(E.type=="pan"){const d=E.dir;const horiz=(d=="left"||d=="right");const size=horiz?W:H;const off=(3-n)*E.stepFrac*size;const sign=(d=="left"||d=="up")?1:-1;const nv=sign*off,pv=nv-sign*size;
      const draw=(id,v,ff,np)=>{ctx.save();horiz?ctx.translate(v,0):ctx.translate(0,v);drawScene(ctx,id,ff,np);ctx.restore()};
      // P0-7: both pages first, then both people on top (a bottom-cut person of the outgoing page may overhang into the incoming page)
      const tvp=isTV(prev);draw(prev.id,pv,pf,!tvp);draw(s.id,nv,s.land,true);
      for(const [sc,v,ff] of [[prev,pv,pf],[s,nv,s.land]])if(sc.person&&!isTV(sc)){ctx.save();horiz?ctx.translate(v,0):ctx.translate(0,v);drawPerson(ctx,sc,ff,boilOf(ff));ctx.restore()}}
    else if(E.type=="tear"){// paper tear: the new page is revealed through a torn edge advancing one third per beat; people only appear once it has landed (P0-7)
      drawScene(ctx,prev.id,pf,true);const t=n/3;const r=seeded(s.id+"|tear|"+n);const d=E.dir;let poly;
      if(d=="left"||d=="right"){const x=d=="left"?W*(1-t):W*t;const e=tornLine(x+rr(r,-60,60),-60,x+rr(r,-60,60),H+60,r,26);poly=d=="left"?[...e,[W+80,H+80],[W+80,-80]]:[...e,[-80,H+80],[-80,-80]]}
      else{const y=d=="up"?H*(1-t):H*t;const e=tornLine(-60,y+rr(r,-80,80),W+60,y+rr(r,-80,80),r,26);poly=d=="up"?[...e,[W+80,H+80],[-80,H+80]]:[...e,[W+80,-80],[-80,-80]]}
      ctx.save();wobblyPath(ctx,poly);ctx.strokeStyle=P.light;ctx.lineWidth=22;ctx.shadowColor="rgba(0,0,0,.25)";ctx.shadowBlur=10;ctx.stroke();ctx.restore();ctx.save();wobblyPath(ctx,poly);ctx.clip();drawScene(ctx,s.id,s.land,true);ctx.restore()}
    else if(E.type=="stamp"){// stamp-in: the new page slams down from 114% with a small rotation, lands on the next beat
      drawScene(ctx,prev.id,pf,true);ctx.save();ctx.translate(W/2,H/2);ctx.rotate(E.rot*Math.PI/180);ctx.scale(1.14,1.14);ctx.translate(-W/2,-H/2);ctx.shadowColor="rgba(0,0,0,.45)";ctx.shadowBlur=40;ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);ctx.shadowColor="transparent";drawScene(ctx,s.id,s.land,true);ctx.restore()}}
  if(!NOGRAIN)grain(ctx,boilOf(f))}
function stateKey(f){const s=sceneAt(f);const ps=personState(s,f);let k=[s.id,boilOf(f),ps?ps.ev:"-",stepsDone(s,f)];
  if(isTV(s)){const I=s.intro;k.push(f<I.on?-1:f<I.screenOn?I.flicker.filter(x=>x<=f).length:99,I.push.filter(x=>x<=f).length)}return k.join("|")}
function buildLayouts(){const order=[...SCENES.filter(s=>!isTV(s)),...SCENES.filter(isTV)];for(const s of order){let L,errs,att;
  for(att=0;att<40;att++){L=makeLayout(s.id,att);LAYOUT[s.id]=L;errs=softChecks(s.id,L);
    if(!errs.length&&L.script){const cc=chooseScriptColor(s.id,L);L.script.color=cc.color;L.script.contrast=+cc.ratio.toFixed(2);if(cc.ratio<3.0)errs.push("contrast "+cc.ratio.toFixed(2))}
    if(!errs.length)for(const d of [...L.stickers]){let ok=false;for(const k of [1,0.8,0.62]){d.s*=k==1?1:k/(k==0.8?1:0.8);if(placeFree(s.id,L,d,stickerBox)){ok=true;break}}if(!ok)L.stickers=L.stickers.filter(q=>q!=d)}
    let vis=[];if(!errs.length)for(const f of sceneStates(s))for(let b=0;b<3;b++){const a=auditState(s.id,f,b);errs.push(...a.v);if(a.st.buildingVisible!=null)vis.push(a.st.buildingVisible)}
    if(!errs.length&&vis.length&&Math.max(...vis)<0.35)errs.push("building hidden behind people in both positions");
    if(!errs.length)break}
  for(const p of L.pieces)MASKUSE[p.mask]=(MASKUSE[p.mask]||0)+1;REROLLS[s.id]={attempts:att+1,lastErrors:[...new Set(errs)]};delete L.rand}}
function auditState(sid,f,boil){const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");AUD=[];drawFor(x,sid,f,boil);const A=AUD;AUD=null;return auditList(A,true)}
function softChecks(sid,L){const e=[];for(const p of L.pieces){if(p.cover<minCover(p.mask))e.push(`photo cover ${p.cover}<${minCover(p.mask)} (${p.mask})`);if(!p.subjectInside)e.push(`P0-3 subject outside ${p.mask} mask`)}if(L.peopleFail)e.push("P0-2/P0-1 cannot fit two positions");if(L.script&&L.script.size<MIN_SCRIPT*FONTK[L.script.font].k-0.5)e.push("script too small");return e}
async function init(manifest,seed){M=manifest;SEED=seed;const st=M.style||{};const SB=M.storyboard||(M.storyboard={scenes:[]});const pk=SB.pack||st.pack||"scrapbook";P=JSON.parse(JSON.stringify(PACKS[pk]));if(SB.palette_bias)P.palette_bias=SB.palette_bias;P.zhBody=P.zhTitle=P.zh;LV=LEVELS[st.randomness||"medium"];
  if(P.masks){MASKS.length=0;MASKS.push(...P.masks)}
  const files={crumpled:"../raw/tex/crumpled.jpg",kraft:"../raw/tex/kraft.png"};
  (M.places||[]).forEach((p,i)=>files["PL"+i]="../"+p.file);(M.people||[]).forEach(p=>{files["PA_"+p.id]="../"+p.A;if(p.B)files["PB_"+p.id]="../"+p.B});
  if(M.props&&M.props.tv)files.tv="../"+M.props.tv.file;
  for(const k in files)IMG[k]=await load(files[k]);
  if(M.props&&M.props.tv)TVS=await (await fetch("../"+M.props.tv.screen)).json();
  TEX={crumpled:IMG.crumpled,newsprint:procTex("newsprint"),halftone:procTex("halftone"),concrete:procTex("concrete"),photocopy:procTex("photocopy")};
  for(let b=0;b<3;b++){const c=document.createElement("canvas");c.width=c.height=512;const x=c.getContext("2d");const im=x.createImageData(512,512);const r=mulberry32(77+b);for(let i=0;i<im.data.length;i+=4){const v=r()*255;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255}x.putImageData(im,0,0);NOISE.push(c)}
  await document.fonts.ready;makePlan();buildLayouts();
  return {seed:SEED,preset:pk,pack:pk,occasion:(M.storyboard||{}).occasion,mood:(M.storyboard||{}).mood,randomness:st.randomness||"medium",plan:PLAN,rerolls:REROLLS,src:SRC,lands:Object.fromEntries(SCENES.map(s=>[s.id,s.land])),
    layout:Object.fromEntries(Object.entries(LAYOUT).map(([k,v])=>[k,{kind:v.kind,layout:v.layout,sheets:v.sheets.map(b=>b.kind+" "+b.color),stickers:v.stickers.map(d=>d.kind),script:v.script?{font:v.script.font,size:v.script.size,lines:v.script.lines,color:v.script.color}:null,photo:v.pieces.map(p=>({mask:p.mask,cover:p.cover})),pos:v.pos}]))}}
function personLayer(f){const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");const s=sceneAt(f);if(!s.person||!sceneSettled(s,f))return null;
  const L=LAYOUT[s.id];const st=personState(s,f);const g=personGeom(st.key,st.pos,L);const J=jit(s.id,boilOf(f));
  x.translate(g.cx+J.dx,g.by+J.dy);x.rotate((g.rot+J.dr)*Math.PI/180);x.drawImage(IMG[st.key],-g.w/2,-g.h,g.w,g.h);
  return {url:c.toDataURL("image/png"),key:st.key,src:SRC[st.key],xf:{x:g.cx+J.dx,y:g.by+J.dy,w:g.w,h:g.h,rot:g.rot+J.dr},size:[IMG[st.key].width,IMG[st.key].height]}}
function personSamples(){const out=[];for(const s of SCENES){if(!s.person)continue;const ev=s.person=="ab"?s.ab:s.jumps;out.push({scene:s.id,f:s.land,tag:"land"});ev.forEach((e,i)=>out.push({scene:s.id,f:e,tag:(s.person=="ab"?(s.flash||"AB"):"jump")+(i+1)}))}return out}
