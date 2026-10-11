"""共享工具：抽帧、弧线检测。依赖 numpy, pillow, ffmpeg。"""
import subprocess, numpy as np
from PIL import Image
import io

def grab(path, t, w=480):
    out = subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',path,'-frames:v','1',
        '-vf',f'scale={w}:-2','-f','image2pipe','-vcodec','png','-'],capture_output=True).stdout
    return np.asarray(Image.open(io.BytesIO(out)).convert('L')).astype(float) if out else None

def detect_arc(g):
    """返回 dict(apex_x, apex_y, drop, resid, contrast)（画面比例）；找不到返回 None。
    每列做"阶跃检测"：选 y 使上下两段的 (均值差 + 纹理差) 最大；再对各列边界做带离群剔除的二次拟合，
    要求中间高、两边低（凸弧）。"""
    h, w = g.shape
    tex = np.abs(np.diff(g, axis=0, prepend=g[:1]))
    xs = np.linspace(int(w*.05), int(w*.95), 48).astype(int)
    pts = []
    for x in xs:
        col = g[:, max(0,x-3):x+4].mean(1); tc = tex[:, max(0,x-3):x+4].mean(1)
        c1, c2 = np.cumsum(col), np.cumsum(tc); n = np.arange(1, h+1)
        ys = np.arange(int(h*.1), int(h*.95))
        ma = c1[ys]/n[ys]; mb = (c1[-1]-c1[ys])/(h-n[ys])
        ta = c2[ys]/n[ys]; tb = (c2[-1]-c2[ys])/(h-n[ys])
        score = np.abs(ma-mb) + 2*np.abs(ta-tb)
        k = score.argmax(); pts.append((x/w, ys[k]/h, score[k]))
    P = np.array(pts); keep = P[:,2] > np.percentile(P[:,2], 20)
    for _ in range(3):
        if keep.sum() < 8: return None
        cf = np.polyfit(P[keep,0], P[keep,1], 2)
        r = np.abs(np.polyval(cf, P[:,0]) - P[:,1]); keep = keep & (r < max(0.03, 2.5*np.median(r[keep])))
    if keep.sum() < 12: return None
    a = cf[0]; xx = np.linspace(0, 1, 101); yy = np.polyval(cf, xx)
    ax = float(xx[yy.argmin()]); y5 = float(np.polyval(cf, 0.5))
    drop = float((yy[0]+yy[-1])/2 - y5)
    res = float(r[keep].mean()); yi = int(np.clip(y5, .05, .95)*h)
    contrast = (g[yi:yi+h//6].mean() - g[max(0,yi-h//6):yi].mean())/255
    return dict(apex_x=ax, apex_y=y5, drop=drop, resid=res, inliers=float(keep.mean()), contrast=float(contrast))

def arc_ok(r, end=False):
    if not r: return False, 'no arc'
    lo, hi = (0.38, 0.90) if end else (0.38, 0.58)
    if r['drop'] < -0.01: return False, f"凹弧 drop {r['drop']:.2f}"
    if r['drop'] > 0.03 and not 0.35 <= r['apex_x'] <= 0.65: return False, f"apex_x {r['apex_x']:.2f}"
    if not lo <= r['apex_y'] <= hi: return False, f"apex_y {r['apex_y']:.2f}"
    if r['resid'] > 0.04: return False, f"noisy fit {r['resid']:.3f}"
    return True, 'ok'
