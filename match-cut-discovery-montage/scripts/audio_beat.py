#!/usr/bin/env python3
"""音乐节拍 + 剪辑点对拍。用法: python audio_beat.py ref.mp4|bgm.mp3 [--analysis analysis/analysis.json] [--out analysis/audio.json]
测 BPM、拍点、onset 自相关峰、3 秒 RMS 能量包络；给了 analysis.json 就算"转场/换姿势事件到最近拍点的距离"，
判断原片是【按音乐拍点剪】还是【按固定视觉网格剪】（中位距离 ≤50ms 才算卡拍）。有 librosa 用 librosa，否则 numpy 简化版。"""
import argparse,json,subprocess,numpy as np
def load(path,sr=22050):
    raw=subprocess.run(["ffmpeg","-v","error","-i",path,"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
    return np.frombuffer(raw,np.float32),sr
def onset_env(y,sr,hop=512):
    n=2048; fr=[np.abs(np.fft.rfft(y[i:i+n]*np.hanning(n))) for i in range(0,len(y)-n,hop)]
    S=np.log1p(np.array(fr)); o=np.maximum(0,np.diff(S,axis=0)).sum(1); return np.r_[0,o],hop
def main():
    ap=argparse.ArgumentParser();ap.add_argument("src");ap.add_argument("--analysis");ap.add_argument("--out",default="audio.json");a=ap.parse_args()
    y,sr=load(a.src); r={"duration":round(len(y)/sr,3)}
    if len(y)<sr: print("无音频");json.dump({"no_audio":True},open(a.out,"w"));return
    try:
        import librosa
        tempo,beats=librosa.beat.beat_track(y=y,sr=sr); bt=librosa.frames_to_time(beats,sr=sr)
        env=librosa.onset.onset_strength(y=y,sr=sr); hop=512; r["engine"]="librosa"; r["tempo"]=round(float(np.atleast_1d(tempo)[0]),2)
    except Exception:
        env,hop=onset_env(y,sr); r["engine"]="numpy"; bt=None
    fps_e=sr/hop; e=env-env.mean(); ac=np.correlate(e,e,"full")[len(e)-1:]; ac/=ac[0]
    lags=np.arange(len(ac))/fps_e; sel=(lags>0.25)&(lags<1.5)
    pk=[i for i in np.where(sel)[0] if ac[i]>ac[i-1] and ac[i]>ac[i+1]]; pk=sorted(pk,key=lambda i:-ac[i])[:4]
    r["onset_autocorr_peaks_sec"]=[[round(float(lags[i]),3),round(float(ac[i]),3)] for i in pk]
    if bt is None:
        P=lags[pk[0]] if pk else 0.5; r["tempo"]=round(60/P,2)
        ph=np.argmax([env[int(k*0):].reshape(-1)[::1][:1].sum() for k in [0]]); bt=np.arange(0,r["duration"],P)
    r["beat_interval_mean"]=round(float(np.diff(bt).mean()),3) if len(bt)>1 else None; r["beats_sec"]=[round(float(x),3) for x in bt]
    rms=[float(np.sqrt((y[i:i+3*sr]**2).mean())) for i in range(0,len(y),3*sr)]; r["rms_3s"]=[round(x,3) for x in rms]
    if a.analysis:
        A=json.load(open(a.analysis)); fps=A["meta"]["fps"]
        cuts=[x["frame"]/fps for x in A["events_detail"] if x["kind"] in ("transition_step","pose_swap")]
        dist=[float(np.min(np.abs(np.array(bt)-c)))*1000 for c in cuts] if len(bt) else []
        if dist:
            r["cut_to_beat_ms_median"]=round(float(np.median(dist)),1); r["cut_to_beat_ms_max"]=round(max(dist),1)
            r["cuts_within_70ms"]=f"{sum(d<=70 for d in dist)}/{len(dist)}"
            r["verdict"]="按音乐拍点剪" if np.median(dist)<=50 else "按固定视觉网格剪（不严格卡拍）→ 复刻时 T 从用户 BGM 推出并落在原片 T 的 ±10%"
    json.dump(r,open(a.out,"w"),ensure_ascii=False,indent=1)
    print({k:v for k,v in r.items() if k!="beats_sec"})
if __name__=="__main__":main()
