import glob,os,subprocess,time
from concurrent.futures import ThreadPoolExecutor
fs=sorted(glob.glob('settle2/t*.txt'))
def run(f):
    o=f.replace('.txt','.json')
    if os.path.exists(o) and os.path.getsize(o)>60: return 'c'
    s=open(f).read()
    for _ in range(4):
        try: r=subprocess.run(['claude','-p','--model','sonnet'],input=s,capture_output=True,text=True,timeout=420)
        except subprocess.TimeoutExpired: time.sleep(3); continue
        if len(r.stdout)>60: open(o,'w').write(r.stdout); return 'o'
        time.sleep(3)
    return 'F'
d=0
with ThreadPoolExecutor(max_workers=5) as ex:
    for st in ex.map(run,fs):
        d+=1
        if st=='F' or d%40==0: print(d,st,flush=True)
print('done',d,'/',len(fs))
