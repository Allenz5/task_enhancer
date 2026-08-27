import glob,os,subprocess,time
from concurrent.futures import ThreadPoolExecutor
fs=sorted(glob.glob('cat/c*.txt'))
def run(f):
    o=f.replace('.txt','.json')
    if os.path.exists(o) and os.path.getsize(o)>40: return 'c'
    s=open(f).read()
    for _ in range(4):
        try: r=subprocess.run(['claude','-p','--model','sonnet'],input=s,capture_output=True,text=True,timeout=420)
        except subprocess.TimeoutExpired: time.sleep(3); continue
        if len(r.stdout)>40: open(o,'w').write(r.stdout); return 'o'
        time.sleep(3)
    return 'F'
with ThreadPoolExecutor(max_workers=4) as ex: print(list(ex.map(run,fs)))
