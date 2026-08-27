"""三轮投票 → 最终标签 + 站点候选清单。"""
import json, glob, re, csv, collections

def load(d):
    o = {}
    for f in sorted(glob.glob(d+'/*.json')):
        m = re.search(r'\[.*\]', open(f).read(), re.S)
        if not m: continue
        try: arr = json.loads(m.group(0))
        except Exception: continue
        for r in arr:
            if isinstance(r, dict) and 'id' in r: o[int(r['id'])] = r
    return o

runs = [load(d) for d in ('fullA','fullB','fullC') if glob.glob(d+'/*.json')]
ids  = json.load(open('full_ids.json'))
rows = json.load(open('../tasks.json')); byid = {r['custom_id']: r for r in rows}
g2   = json.load(open('g2_categories.json'))
from menu import SUPPLEMENT
NAME = {**g2, **SUPPLEMENT}

out = {}
for j, cid in enumerate(ids):
    votes = [r[j] for r in runs if j in r]
    if not votes: continue
    sc = collections.Counter(v.get('slug') for v in votes)
    slug, n = sc.most_common(1)[0]
    rc = collections.Counter(v.get('source_real') for v in votes)
    prod = collections.Counter(v.get('product') for v in votes if v.get('product'))
    out[cid] = dict(slug=slug, votes=n, of=len(votes),
                    source_real=rc.most_common(1)[0][0],
                    product=(prod.most_common(1)[0][0] if prod else None),
                    confidence=round(sum(v.get('confidence') or 0 for v in votes)/len(votes), 2))
json.dump(out, open('final_labels.json','w'), ensure_ascii=False, indent=0)

with open('assignment.csv','w',newline='') as f:
    w = csv.writer(f); w.writerow(['custom_id','task_name','slug','category_name','source_real','votes','product','confidence'])
    for cid, v in out.items():
        w.writerow([cid, byid[cid]['task_name'], v['slug'], NAME.get(v['slug'],''),
                    v['source_real'], f"{v['votes']}/{v['of']}", v['product'] or '', v['confidence']])

N = len(out)
real = {k: v for k, v in out.items() if v['source_real'] == 'yes'}
S = collections.Counter(v['slug'] for v in real.values())
print(f"=== 全量 {N} 条 ===")
print("source_real:", dict(collections.Counter(v['source_real'] for v in out.values())))
print("投票一致度:", dict(collections.Counter(f"{v['votes']}/{v['of']}" for v in out.values())))
print(f"\n=== 有真实来源的 {len(real)} 条，落在 {len(S)} 个品类 ===")
for m in (2,3,5,10,20,30):
    ks = [s for s,c in S.items() if c>=m]
    print(f"  ≥{m:<3}条的品类 {len(ks):3d} 个 → 覆盖 {sum(S[s] for s in ks):4d} 条 ({sum(S[s] for s in ks)*100//len(real)}% of real)")
print(f"\n=== 建站候选（≥8 条）===")
for s, c in S.most_common():
    if c < 8: break
    prods = collections.Counter(v['product'] for v in real.values() if v['slug']==s and v['product'])
    print(f"{c:4d}  {s:46s} {NAME.get(s,'')[:40]}")
    print(f"      → {', '.join(f'{p}({n})' for p,n in prods.most_common(4))}")
