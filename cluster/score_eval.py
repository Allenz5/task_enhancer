import json, glob, collections, math
pairs = json.load(open('eval_pairs.json'))
def objects(t):
    dec = json.JSONDecoder(); i=0
    while True:
        i = t.find('{', i)
        if i<0: return
        try: o,j = dec.raw_decode(t,i)
        except ValueError: i+=1; continue
        yield o; i=j
V = {}
for f in sorted(glob.glob('ev/e*.json')):
    for o in objects(open(f).read()):
        if isinstance(o,dict) and isinstance(o.get('pid'),int) and isinstance(o.get('same_site'),bool):
            V[o['pid']] = o
print('judged', len(V), '/', len(pairs))
agg = collections.defaultdict(lambda: [0,0])
why = collections.defaultdict(list)
for pid,(m,i,j) in enumerate(pairs):
    v = V.get(pid)
    if not v: continue
    agg[m][1] += 1; agg[m][0] += int(v['same_site'])
    if not v['same_site']: why[m].append(v.get('why',''))
print(f'\n{"method":22s} {"n":>4s} {"same-site rate":>15s}   95% CI')
for m,(a,n) in sorted(agg.items(), key=lambda kv:-kv[1][0]/max(kv[1][1],1)):
    p = a/n; se = math.sqrt(p*(1-p)/n)
    print(f'{m:22s} {n:4d} {p:14.1%}   [{max(0,p-1.96*se):.0%}, {min(1,p+1.96*se):.0%}]')
print('\nsample failure reasons for M11:')
for w in why['M11_llm_taxonomy'][:8]: print('  -', w)
