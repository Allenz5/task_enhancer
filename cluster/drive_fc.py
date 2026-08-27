import glob,os,subprocess,sys,time
from concurrent.futures import ThreadPoolExecutor
D=sys.argv[1]; M=sys.argv[2] if len(sys.argv)>2 else 'sonnet'
fs=sorted(glob.glob(f'{D}/q*.txt'))
def run(f):
    o=f.replace('.txt','.ans')
    if os.path.exists(o) and os.path.getsize(o)>0: return
    s=open(f).read()
    for _ in range(3):
        try: r=subprocess.run(['claude','-p','--model',M],input=s,capture_output=True,text=True,timeout=180)
        except subprocess.TimeoutExpired: continue
        if r.stdout.strip(): open(o,'w').write(r.stdout.strip()[:20]); return
    open(o,'w').write('?')
with ThreadPoolExecutor(max_workers=6) as ex: list(ex.map(run,fs))
print('done',len(fs))
