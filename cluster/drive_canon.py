import glob,os,subprocess,time
from concurrent.futures import ThreadPoolExecutor
fs=sorted(glob.glob('canon/c*.txt'))
def run(f):
    o=f.replace('.txt','.json')
    if os.path.exists(o) and os.path.getsize(o)>40: return 'cached'
    s=open(f).read()
    for _ in range(4):
        try: r=subprocess.run(['claude','-p','--model','opus'],input=s,capture_output=True,text=True,timeout=600)
        except subprocess.TimeoutExpired: time.sleep(4); continue
        if len(r.stdout)>40: open(o,'w').write(r.stdout); return 'ok'
        time.sleep(4)
    return 'FAIL '+f
with ThreadPoolExecutor(max_workers=3) as ex:
    for st in ex.map(run,fs): print(st,flush=True)
