// 风格层：弧线匹配剪辑 · 发现蒙太奇。engine.js 不改。
// 每个 scene = 一个镜头（硬切，P0-2）：画预处理好的素材帧（prep.py 已调色、平移弧顶到 arc_target_y）→ 字幕 → 颗粒 → 暗角。
// 片尾 scene(endcard) 没给素材时用程序化"大气层光弧"，并做上摇。
let IMG={},READY=null,FONT_OK=false,SBAD=[];
function styleInit(P){
  const jobs=[];
  for(const s of P.scenes){if(!s.media)continue;IMG[s.id]=[];
    for(let k=0;k<s.nframes;k++){const im=new Image();im.src=s.media.replace('%04d',String(k+1).padStart(4,'0'));IMG[s.id].push(im);jobs.push(im.decode().catch(()=>{}))}}
  if(P.logo){const im=new Image();im.src=P.logo;IMG._logo=im;jobs.push(im.decode().catch(()=>{}))}
  if(P.font){const ff=new FontFace('Brand',`url(${P.font})`);jobs.push(ff.load().then(f=>{document.fonts.add(f);FONT_OK=true}).catch(()=>{}))}
  READY=Promise.all(jobs).then(()=>true);window.READY=READY}
function styleKey(f,s){return String(f)}             // 实拍素材逐帧都不同，不去重
function glow(W,H,apexY,e){                          // 程序化大气层弧：黑天 + 冰蓝光晕 + 暖橙日出带；e=上摇进度 0→1（越上摇越亮）
  X.fillStyle='#0B0D10';X.fillRect(0,0,W,H);
  const R=W*2.2,cx=W/2,cy=apexY*H+R,band=(d,c,a)=>{const g=X.createRadialGradient(cx,cy,R-d,cx,cy,R+d);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,c);g.addColorStop(1,'rgba(0,0,0,0)');X.globalAlpha=a;X.fillStyle=g;X.fillRect(0,0,W,H)};
  band(H*(.22+.25*e),'#3E6688',.85);band(H*(.08+.08*e),'#9CC2DD',.9);
  band(H*(.03+.14*e),'#F2A24E',.35+.65*e);band(H*(.02+.05*e),'#FFD9A0',.3+.7*e);
  X.globalAlpha=1;const pg=X.createLinearGradient(0,apexY*H,0,H);pg.addColorStop(0,`rgba(140,60,20,${.15+.6*e})`);pg.addColorStop(.35,'rgba(10,8,8,1)');
  X.fillStyle=pg;X.beginPath();X.arc(cx,cy+H*.01,R,0,Math.PI*2);X.fill()}
function word(txt,frac,W,H,y){X.font=`${Math.round(H*frac*1.4)}px ${FONT_OK?'Brand':'serif'}`;X.fillStyle=P.ink||'#F2EEE6';X.textBaseline='alphabetic';
  X.shadowColor='rgba(0,0,0,.25)';X.shadowBlur=H*.01;const tw=X.measureText(txt).width,tx=(W-tw)/2;X.fillText(txt,tx,y);X.shadowBlur=0;
  const th=H*frac*1.1;reg({kind:'text',box:[tx,y-th,tw,th*1.25]});return [tx,y-th,tw,th*1.25]}
function drawFrame(f,s){const W=C.width,H=C.height;SBAD=[];const lf=f-Math.round(s.start*FPS);
  if(s.endcard){                                      // references/endcard.md 帧表（局部帧，参考 106 帧）
    const n=Math.round((s.end-s.start)*FPS),u=lf/n,ims=IMG[s.id];
    if(ims&&ims.length)X.drawImage(ims[Math.min(lf,ims.length-1)],0,0,W,H);
    else{const k=Math.max(0,(u-.58)/.42),e=k*k*(3-2*k);glow(W,H,.85-.37*e,e)}
    const lift=Math.max(0,(u-.58)/.42)*H*.35;
    if(u>=.11&&u<.34&&P.product)word(P.product,.035,W,H,H*.42);
    else if(u>=.34&&u<.86){const lh=H*.045,y=H*.42-lift;
      if(IMG._logo&&IMG._logo.naturalWidth){const lw=lh*IMG._logo.naturalWidth/IMG._logo.naturalHeight;X.drawImage(IMG._logo,(W-lw)/2,y-lh,lw,lh);reg({kind:'logo',box:[(W-lw)/2,y-lh,lw,lh]})}
      else if(P.brand)word(P.brand,.03,W,H,y)}
  }else{
    const ims=IMG[s.id]||[];if(ims.length)X.drawImage(ims[Math.min(lf,ims.length-1)],0,0,W,H);else{X.fillStyle='#222';X.fillRect(0,0,W,H)}
    if(s.word!=null&&P.words){const fr=(P.word_size||[.03,.035,.06])[s.word],b=word(P.words[s.word],fr,W,H,H*(P.text_baseline||.40));
      const ay=(s.arc_y!=null?s.arc_y:P.arc_target_y||.48)*H;if(b[1]+b[3]>ay-H*.02)SBAD.push({rule:'P0-4 字压到弧线',shot:s.id})}
  }
  const r=hashR('grain',f),g=X.getImageData(0,0,W,H),d=g.data,a=(P.grain||0.05)*255;   // 颗粒（seeded，可复现）
  for(let i=0;i<d.length;i+=4){const v=(r()-.5)*a;d[i]+=v;d[i+1]+=v;d[i+2]+=v}X.putImageData(g,0,0);
  const vg=X.createRadialGradient(W/2,H/2,H*.45,W/2,H/2,W*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.28)');X.fillStyle=vg;X.fillRect(0,0,W,H)}
function styleAudit(f){return SBAD}
