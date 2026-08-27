import json, glob, collections, math, numpy as np
def objects(t):
    dec=json.JSONDecoder(); i=0
    while True:
        i=t.find('{',i)
        if i<0: return
        try: o,j=dec.raw_decode(t,i)
        except ValueError: i+=1; continue
        yield o; i=j
pairs=json.load(open('eval_pairs3.json')); V={}
for f in sorted(glob.glob('ev3/e*.json')):
    for o in objects(open(f).read()):
        if isinstance(o,dict) and isinstance(o.get('pid'),int) and isinstance(o.get('same_site'),bool): V[o['pid']]=o
agg=collections.defaultdict(lambda:[0,0]); why=collections.defaultdict(list)
for pid,(m,i,j) in enumerate(pairs):
    v=V.get(pid)
    if not v: continue
    agg[m][1]+=1; agg[m][0]+=v['same_site']
    if not v['same_site']: why[m].append(v.get('why',''))
print(f'judged {len(V)}/{len(pairs)}')
L={}
for f in ('labels_text.npz','labels_m11.npz','labels_r2.npz'): L.update(dict(np.load(f)))
c=agg['CTRL_random']; p0=c[0]/c[1]; N=1299
print(f'control {c[0]}/{c[1]} = {p0:.1%}\n')
print(f'{"method":22s} {"k":>5s} {"pairP":>7s} {"95%CI":>13s} {"lift":>6s} {"sites*":>7s} {"reuse*":>7s}')
for m,(a,n) in agg.items():
    if m=='CTRL_random': continue
    p=a/n; se=math.sqrt(p*(1-p)/n); lift=max(1e-3,(p-p0)/(1-p0))
    lab=L[m]; sz=np.bincount(lab[lab>=0]); k=int((sz>0).sum())
    sites=sum(min(int(s),1/lift) for s in sz if s>0)
    print(f'{m:22s} {k:5d} {p:6.1%} [{max(0,p-1.96*se):5.0%},{min(1,p+1.96*se):4.0%}] {lift:6.2f} {sites:7.0f} {N/sites:6.1f}x')
for m in ('M4k40','M11_llm_taxonomy'):
    print(f'\n{m} 反例:'); [print('  -',w) for w in why[m][:6]]
