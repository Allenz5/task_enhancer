import glob, os, subprocess, time
from concurrent.futures import ThreadPoolExecutor
def run(b):
    n = os.path.basename(b)[:-4]; o = f'asg/{n}.json'
    if os.path.exists(o) and os.path.getsize(o) > 50: return (n,'cached')
    src = open(b).read()
    for i in range(4):
        try: p = subprocess.run(['claude','-p','--model','sonnet'], input=src, capture_output=True, text=True, timeout=420)
        except subprocess.TimeoutExpired: time.sleep(5*(i+1)); continue
        if len(p.stdout) > 50: open(o,'w').write(p.stdout); return (n,f'ok/{i+1}')
        time.sleep(5*(i+1))
    return (n,'FAIL')
bs = sorted(glob.glob('asg/*.txt'))
with ThreadPoolExecutor(max_workers=4) as ex:
    for n,st in ex.map(run, bs): print(n, st, flush=True)
