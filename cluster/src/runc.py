import subprocess, glob, os, sys, concurrent.futures as cf, time, json, re
PASS = sys.argv[1]                       # A / B / C
ONLY = sys.argv[2] if len(sys.argv) > 2 else None   # 可选：只跑这个文件里列的批次
outdir = f'c{PASS}'
os.makedirs(outdir, exist_ok=True)
files = sorted(glob.glob('cp/*.txt'))
if ONLY:
    keep = set(open(ONLY).read().split())
    files = [f for f in files if os.path.basename(f).replace('.txt','') in keep]
done = 0; t0 = time.time()

def one(p):
    name = os.path.basename(p).replace('.txt','')
    dst = f'{outdir}/{name}.json'
    if os.path.exists(dst) and os.path.getsize(dst) > 50:
        return name, 'cached'
    for _ in range(3):
        try:
            r = subprocess.run(['claude','-p','--model','sonnet'], stdin=open(p),
                               capture_output=True, text=True, timeout=900)
            m = re.search(r'\[.*\]', r.stdout or '', re.S)
            if m:
                try:
                    if isinstance(json.loads(m.group(0)), list):
                        open(dst,'w').write(r.stdout); return name, 'ok'
                except Exception: pass
            time.sleep(20)
        except subprocess.TimeoutExpired: pass
    return name, 'FAIL'

print(f'pass {PASS}: {len(files)} batches', flush=True)
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    for name, st in ex.map(one, files):
        done += 1
        if done % 10 == 0 or st == 'FAIL':
            print(f'  {done}/{len(files)}  {name} {st}  {time.time()-t0:.0f}s', flush=True)
print(f'pass {PASS} done in {time.time()-t0:.0f}s', flush=True)
