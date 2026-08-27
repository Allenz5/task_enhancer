import json, glob, re, csv, collections, sys
V='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
sys.path.insert(0,V)
from menu import SUPPLEMENT
B='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
g2=json.load(open(V+'g2_categories.json')); NAME={**g2,**{k:re.sub(r'\s*[（(].*','',v.split('——')[0]).strip() for k,v in SUPPLEMENT.items()}}
def load(d):
    o={}
    for f in sorted(glob.glob(d+'/*.json')):
        m=re.search(r'\[.*\]', open(f).read(), re.S)
        if not m: continue
        try: arr=json.loads(m.group(0))
        except Exception: continue
        for r in arr:
            if isinstance(r,dict) and 'id' in r: o[int(r['id'])]=r
    return o
runs=[load(d) for d in ('rA','rB','rC') if glob.glob(d+'/*.json')]
ids=json.load(open('ids.json')); rows=json.load(open(B+'tasks.json')); byid={r['custom_id']:r for r in rows}
roles=json.load(open(V+'src/roles.json'))
out={}
for j,cid in enumerate(ids):
    vs=[r[j] for r in runs if j in r]
    if not vs: continue
    sc=collections.Counter(v.get('slug') for v in vs); slug,n=sc.most_common(1)[0]
    rc=collections.Counter(v.get('source_real') for v in vs)
    out[cid]=dict(slug=slug, votes=n, of=len(vs), source_real=rc.most_common(1)[0][0],
                  confidence=round(sum(v.get('confidence') or 0 for v in vs)/len(vs),2), how='分类')
# 合并已筛出的 288 条
for cid,v in roles.items():
    if v.get('role')=='出处' and v.get('source'):
        out[cid]=dict(slug=None, votes=1, of=1, source_real='yes', confidence=1.0,
                      how='原文点名', source=v['source'])
with open('assignment_full.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['custom_id','task_name','how','slug','category_name','named_source','source_real','votes','confidence'])
    for cid,v in out.items():
        w.writerow([cid, byid[cid]['task_name'], v['how'], v['slug'] or '', NAME.get(v['slug'],'') if v['slug'] else '',
                    v.get('source',''), v['source_real'], f"{v['votes']}/{v['of']}", v['confidence']])
json.dump(out, open('final_all.json','w'), ensure_ascii=False, indent=0)
cls={k:v for k,v in out.items() if v['how']=='分类'}
print(f"=== 分类的 {len(cls)} 条 ===")
print("投票:", dict(collections.Counter(f"{v['votes']}/{v['of']}" for v in cls.values())))
print("source_real:", dict(collections.Counter(v['source_real'] for v in cls.values())))
print(f"\n总计 {len(out)} 条 = 分类 {len(cls)} + 原文点名 {len(out)-len(cls)}")
