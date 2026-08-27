import subprocess, glob, os, sys, concurrent.futures as cf

os.makedirs('out', exist_ok=True)
files = sorted(glob.glob('prompts/*.txt'))

def one(p):
    name = os.path.basename(p).replace('.txt','')
    dst = f'out4/{name}.json'
    if os.path.exists(dst) and os.path.getsize(dst) > 50:
        return name, 'cached'
    for attempt in range(3):
        try:
            r = subprocess.run(['claude','-p','--model','sonnet'],
                               stdin=open(p), capture_output=True, text=True, timeout=900)
            if r.stdout and len(r.stdout.strip()) > 50:
                open(dst,'w').write(r.stdout)
                return name, f'ok {len(r.stdout)}B'
        except subprocess.TimeoutExpired:
            pass
    return name, 'EMPTY/FAIL'

with cf.ThreadPoolExecutor(max_workers=3) as ex:
    for name, st in ex.map(one, files):
        print(name, st, flush=True)
