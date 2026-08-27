import json, glob, collections, math, numpy as np
def objects(t):
    dec=json.JSONDecoder(); i=0
    while True:
        i=t.find('{',i)
        if i<0: return
        try: o,j=dec.raw_decode(t,i)
        except ValueError: i+=1; continue
        yield o; i=j
def load(pf, ed):
    pairs=json.load(open(pf)); V={}
    for f in sorted(glob.glob(f'{ed}/e*.json')):
        for o in objects(open(f).read()):
            if isinstance(o,dict) and isinstance(o.get('pid'),int) and isinstance(o.get('same_site'),bool): V[o['pid']]=o
    agg=collections.defaultdict(lambda:[0,0])
    for pid,(m,i,j) in enumerate(pairs):
        v=V.get(pid)
        if v: agg[m][1]+=1; agg[m][0]+=v['same_site']
    return agg
# only the size-weighted rounds are comparable to each other
ROUNDS=[('R5','eval_pairs5.json','ev5'),('R6','eval_pairs6.json','ev6'),('R7','eval_pairs7.json','ev7')]
acc=collections.defaultdict(list)
for rn,pf,ed in ROUNDS:
    agg=load(pf,ed); c=agg['CTRL_random']; p0=c[0]/c[1]
    print(f'{rn}: control {c[0]}/{c[1]}={p0:.1%}')
    for m,(a,n) in agg.items():
        if m=='CTRL_random': continue
        p=a/n; lift=(p-p0)/(1-p0)
        var=p*(1-p)/n/(1-p0)**2
        acc[m].append((lift,var,n,rn,p))
L=dict(np.load('labels_lowk.npz')); N=1299
print(f'\n{"k":>4s} {"n":>5s} {"lift(pooled)":>13s} {"95%CI":>14s} {"sites*":>7s} {"reuse*":>7s}  rounds')
rows=[]
for m,vs in acc.items():
    w=[1/v[1] for v in vs]; lift=sum(l*wi for (l,_,_,_,_),wi in zip(vs,w))/sum(w)
    se=math.sqrt(1/sum(w)); n=sum(v[2] for v in vs)
    lab=L[m]; sz=np.bincount(lab)
    sites=sum(min(int(s),1/max(lift,1e-3)) for s in sz if s>0)
    rows.append((int(m[1:]), n, lift, se, sites, [f'{v[3]}:{v[4]:.0%}' for v in vs]))
for k,n,lift,se,sites,rr in sorted(rows):
    print(f'{k:4d} {n:5d} {lift:13.2f} [{lift-1.96*se:5.2f},{lift+1.96*se:5.2f}] {sites:7.0f} {N/sites:6.1f}x  {" ".join(rr)}')
