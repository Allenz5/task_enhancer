import json,glob,sys,re,collections
D=sys.argv[1]
meta=json.load(open(f'{D}/_meta.json'))
hit=0; n=0; posA=0; nA=0; posB=0; nB=0; bad=0
for j,it in enumerate(meta):
    try: a=open(f'{D}/q{j:04d}.ans').read()
    except FileNotFoundError: continue
    m=re.search(r'\b([AB])\b',a.upper())
    if not m: bad+=1; continue
    pick=m.group(1); n+=1
    ok = pick==it['ans']
    hit+=ok
    if pick=='A': posA+=1
    # 真答案在 A 的题里答对率 vs 在 B 的题里答对率
    if it['ans']=='A': nA+=1; posB+=ok
    else: nB+=1
p=hit/n if n else 0
kappa=(p-0.5)/0.5
accA=posB/nA if nA else 0
accB=(hit-posB)/nB if nB else 0
print(f"{D}: n={n} 无效={bad}")
print(f"  命中率 p = {p:.3f}   κ = (p-0.5)/0.5 = {kappa:.3f}")
print(f"  选A比例 = {posA/n:.3f}  →  position bias |P(A)-0.5| = {abs(posA/n-0.5):.3f}   (阈值 <0.10)")
print(f"  真答案在A时命中 {accA:.3f} / 在B时命中 {accB:.3f}   差 {abs(accA-accB):.3f}")
