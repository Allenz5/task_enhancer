import json,sys,re,collections
D=sys.argv[1]; meta=json.load(open(f'{D}/_meta.json'))
res=collections.defaultdict(dict)
pickA=0; n=0
for j,it in enumerate(meta):
    try: a=open(f'{D}/q{j:04d}.ans').read()
    except FileNotFoundError: continue
    m=re.search(r'\b([AB])\b',a.upper())
    if not m: continue
    n+=1; pickA += (m.group(1)=='A')
    res[it['i']]['BA' if it['swap'] else 'AB'] = (m.group(1)==it['ans'])
full=[v for v in res.values() if len(v)==2]
both=sum(1 for v in full if v['AB'] and v['BA'])
flip=sum(1 for v in full if v['AB']!=v['BA'])
none=sum(1 for v in full if not v['AB'] and not v['BA'])
N=len(full)
p_paired=(both+0.5*flip)/N            # 配对去偏后的命中率
print(f"{D}: {N} 道配对题 ({n} 次提问)")
print(f"  两向都对 {both} ({both/N:.1%}) | 翻转 {flip} ({flip/N:.1%}) | 两向都错 {none} ({none/N:.1%})")
print(f"  配对去偏命中率 p = {p_paired:.3f}   κ = {2*p_paired-1:.3f}")
print(f"  选A比例 = {pickA/n:.3f}  →  position bias |P(A)-0.5| = {abs(pickA/n-0.5):.3f}  (设计已配平, 阈值<0.10)")
