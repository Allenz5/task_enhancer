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
        if v: agg[m][1]+=1; agg[m][0]+=v['same_site']
    return agg
L={}
for f in ('labels_text.npz','labels_llm.npz','labels_m11.npz','labels_r2.npz'): L.update(dict(np.load(f)))
N=1299
rounds=[('R1',score('eval_pairs.json','ev')), ('R2',score('eval_pairs2.json','ev2'))]
rows=[]
for rn,agg in rounds:
    c=agg['CTRL_random']; p0=c[0]/c[1]
    print(f'{rn}: control {c[0]}/{c[1]} = {p0:.1%}')
    for m,(a,n) in agg.items():
        if m=='CTRL_random': continue
        p=a/n; se=math.sqrt(p*(1-p)/n); lift=max(1e-3,(p-p0)/(1-p0))
        lab=L[m]; sz=np.bincount(lab[lab>=0]); k=int((sz>0).sum())
        sites=sum(min(int(s),1/lift) for s in sz if s>0)
        rows.append((rn,m,k,p,se,lift,sites))
print(f'\n{"rnd":4s} {"method":24s} {"k":>5s} {"pairP":>7s} {"±":>5s} {"lift":>6s} {"sites*":>7s} {"reuse*":>7s}')
for rn,m,k,p,se,lift,sites in sorted(rows,key=lambda r:r[6]):
    print(f'{rn:4s} {m:24s} {k:5d} {p:6.1%} {1.96*se:5.1%} {lift:6.2f} {sites:7.0f} {N/sites:6.1f}x')
