import glob,os,subprocess,time,sys
from concurrent.futures import ThreadPoolExecutor
fs=sorted(glob.glob('link/b*.txt'))
def run(f):
    o=f.replace('.txt','.json')
    if os.path.exists(o) and os.path.getsize(o)>40: return 'cached'
    src=open(f).read()
    for _ in range(4):
        try: r=subprocess.run(['claude','-p','--model','sonnet'],input=src,
                              capture_output=True,text=True,timeout=420)
        except subprocess.TimeoutExpired: time.sleep(4); continue
        if len(r.stdout)>40: open(o,'w').write(r.stdout); return 'ok'
        time.sleep(4)
    return 'FAIL '+f
d=0
with ThreadPoolExecutor(max_workers=4) as ex:
    for st in ex.map(run,fs):
        d+=1
        if st.startswith('FAIL') or d%10==0: print(d,st,flush=True)
print('done',d,'/',len(fs))
