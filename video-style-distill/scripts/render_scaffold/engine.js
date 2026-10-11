// 通用底座（不要改；风格相关的都写在 style.js）。
// 约定：所有时间量化到时钟 T（定格），同 seed 同 plan 逐像素复现；每次绘制登记元素框，审计 P0。
const C=document.getElementById('c'),X=C.getContext('2d');let P=null,SEED=1,FPS=30;
function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashR(...k){let h=SEED;for(const v of k)for(const ch of String(v))h=Math.imul(h^ch.charCodeAt(0),16777619);return rng(h>>>0)}
// 时钟
function tick(f){return Math.floor((f/FPS-P.t0)/P.T)}              // 第几拍
function boilState(f){return ((tick(f)%P.boil.states)+P.boil.states)%P.boil.states}
function sceneAt(f){let t=f/FPS;for(const s of P.scenes)if(t>=s.start&&t<s.end)return s;return P.scenes[P.scenes.length-1]}
// 审计：style.js 每画一个元素就 reg({kind,layer,box:[x,y,w,h],allowBottomCrop})
let REG=[];function reg(e){REG.push(e)}
function audit(){const W=C.width,H=C.height,bad=[];
  for(const e of REG){const[x,y,w,h]=e.box;
    if(x<0||y<0||x+w>W||(y+h>H&&!e.allowBottomCrop))bad.push({rule:'P0-overflow',kind:e.kind});}
  const tops=REG.filter(e=>e.kind==='person');                      // 被保护层：画完后不许再有元素压在它上面
  for(const p of tops)for(const e of REG)if(e.order>p.order&&e.kind!=='person'){const a=p.box,b=e.box;
    if(a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3])bad.push({rule:'P0-occlusion',by:e.kind});}
  const texts=REG.filter(e=>e.kind==='text');
  for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i].box,b=texts[j].box;
    if(a[0]<b[0]+b[2]&&b[0]<a[0]+a[2]&&a[1]<b[1]+b[3]&&b[1]<a[1]+a[3])bad.push({rule:'P0-text-overlap'});}
  return bad}
let ORDER=0;const _reg=reg;reg=e=>{e.order=ORDER++;_reg(e)};
function init(plan,seed){P=plan;SEED=seed;FPS=plan.fps||30;C.width=plan.size[0];C.height=plan.size[1];
  P.total=Math.round(plan.duration*FPS);if(window.styleInit)styleInit(P);return {plan:P}}
function stateKey(f){const s=sceneAt(f);return s.id+':'+tick(f)+':'+(window.styleKey?styleKey(f,s):'')}  // 同 key = 同画面，run.py 直接复制
function renderAudit(f){REG=[];ORDER=0;const s=sceneAt(f);drawFrame(f,s);return[C.toDataURL('image/png'),{f,bad:audit()}]}
