import json, glob, collections, math, numpy as np
def objects(t):
    dec=json.JSONDecoder(); i=0
    while True:
        i=t.find('{',i)
        if i<0: return
        try: o,j=dec.raw_decode(t,i)
        except ValueError: i+=1; continue
        yield o; i=j
def score(pairfile, evdir):
    pairs=json.load(open(pairfile)); V={}
    for f in sorted(glob.glob(f'{evdir}/e*.json')):
        for o in objects(open(f).read()):
            if isinstance(o,dict) and isinstance(o.get('pid'),int) and isinstance(o.get('same_site'),bool): V[o['pid']]=o
    agg=collections.defaultdict(lambda:[0,0])
    for pid,(m,i,j) in enumerate(pairs):
        v=V.get(pid)
        if not v: continue
        agg[m][1]+=1; agg[m][0]+=v['same_site']
    return agg, len(V), len(pairs)

L={}
for f in ('labels_text.npz','labels_llm.npz','labels_m11.npz','labels_r2.npz'): L.update(dict(np.load(f)))
N=1299
a1,n1,t1=score('eval_pairs.json','ev'); a2,n2,t2=score('eval_pairs2.json','ev2')
print(f'round1 judged {n1}/{t1}   round2 judged {n2}/{t2}')
p0 = (a1['CTRL_random'][0]+a2['CTRL_random'][0])/(a1['CTRL_random'][1]+a2['CTRL_random'][1])
print(f'\nrandom-pair control p0 = {p0:.1%}  (judge leniency floor)\n')
agg={**{k:v for k,v in a1.items()}, **{k:v for k,v in a2.items() if k!='CTRL_random'}}
print(f'{"method":24s} {"k":>5s} {"pairP":>7s} {"lift":>6s} {"sites*":>7s} {"reuse*":>7s}')
res=[]
for m,(a,n) in agg.items():
    if m=='CTRL_random': continue
    p=a/n; lift=max(1e-3,(p-p0)/(1-p0))
    lab=L[m]; sz=np.bincount(lab[lab>=0])
    sites=sum(min(int(s), 1/lift) for s in sz if s>0)
    res.append((sites,m,len(sz),p,lift))
for sites,m,k,p,lift in sorted(res):
    print(f'{m:24s} {k:5d} {p:6.1%} {lift:6.2f} {sites:7.0f} {N/sites:6.1f}x')
print(f'\nsites* = estimated真正需要的站点数 = Σ_cluster min(n, 1/lift);  reuse* = 1299/sites*')
