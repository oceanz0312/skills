// 风格层（每个蒸馏出来的 skill 改这里）：只用 engine.js 的时钟/随机/reg。示例 = 极简"色块 + 一句话 + 人物占位 A/B"。
function styleInit(P){}
function styleKey(f,s){return s.ab?(tick(f)%2):''}
function drawFrame(f,s){const W=C.width,H=C.height,r=hashR(s.id,boilState(f)),j=()=>(r()-.5)*P.boil.px*2;
  X.fillStyle=s.bg;X.fillRect(0,0,W,H);                                   // 底
  X.fillStyle=s.block;const bx=W*.1+j(),by=H*.2+j(),bw=W*.8,bh=H*.45;X.fillRect(bx,by,bw,bh);reg({kind:'block',box:[bx,by,bw,bh]});
  X.font=`${Math.round(W*.07)}px serif`;X.fillStyle=s.ink;const tw=X.measureText(s.text).width,tx=(W-tw)/2,ty=H*.12;
  X.fillText(s.text,tx,ty);reg({kind:'text',box:[tx,ty-W*.07,tw,W*.08]});
  const pos=s.ab?[[.18,.55],[.52,.55]][tick(f)%2]:[.35,.55];              // 恰好两个人物位置 A/B
  const px=W*pos[0]+j()*.5,py=H*pos[1],pw=W*.3,ph=H*.45;
  X.fillStyle='#f7f5f2';X.fillRect(px-8,py-8,pw+16,ph+16);X.fillStyle='#333';X.fillRect(px,py,pw,ph);reg({kind:'person',box:[px-8,py-8,pw+16,ph+16],allowBottomCrop:true});
}
