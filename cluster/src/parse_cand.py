"""落地校验：模型抽出来的名字必须真的在原文里，否则丢弃。

正则唯一的优点是命中一定真实存在。换成模型抽取后要把这个保证补回来 ——
逐字引用回原文做字符串匹配，对不上的不进候选池。
"""
import json, glob, re, collections
B='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
rows=json.load(open(B+'tasks.json')); ids=json.load(open('cand_ids.json'))
byid={r['custom_id']: r for r in rows}
TOOL={'python','excel','microsoft excel','matlab','kubernetes','flask','vs code','docker',
      'numpy','pandas','jupyter','pytorch','tensorflow','scikit-learn','postgresql','mysql',
      'nginx','linux','ubuntu','django','fastapi','sqlite','node.js','git','github actions'}

def blob(r):
    s=' ⏐ '.join([r['task_name'] or '', r['desc'] or '', r['reqs'] or '',
                  r['verify'] or '', ' '.join(f['name'] or '' for f in r['files'])])
    return re.sub(r'\s+',' ', s)

def load(d):
    o={}
    for f in sorted(glob.glob(d+'/*.json')):
        m=re.search(r'\[.*\]', open(f).read(), re.S)
        if not m: continue
        try: arr=json.loads(m.group(0))
        except Exception: continue
        for r in arr:
            if isinstance(r, dict) and 'id' in r: o[int(r['id'])]=r
    return o

R=load('cA')
cands, drop = {}, collections.Counter()
for j, cid in enumerate(ids):
    if j not in R: drop['批次缺失'] += 1; continue
    s=blob(byid[cid]); seen={}
    for it in (R[j].get('names') or [])[:8]:
        if not isinstance(it, dict): drop['格式错'] += 1; continue
        nm=(it.get('name') or '').strip(); q=re.sub(r'\s+',' ', it.get('quote') or '').strip()
        if not nm: continue
        if nm.lower() in TOOL: drop['通用工具链'] += 1; continue
        if nm.lower() in seen: continue
        if nm.lower() not in s.lower(): drop['名字不在原文'] += 1; continue
        if q and q.lower() not in s.lower(): drop['引用对不上'] += 1; continue
        i=s.lower().find(nm.lower())
        seen[nm.lower()]=(nm, s[max(0,i-110):min(len(s), i+len(nm)+110)])
        if len(seen) >= 4: break
    if seen: cands[cid]={nm: ctx for nm, ctx in seen.values()}

json.dump(cands, open('cands.json','w'), ensure_ascii=False)
n=sum(len(v) for v in cands.values())
print(f'有候选的任务 {len(cands)}/{len(ids)}，候选名 {n} 个')
print('丢弃:', dict(drop))
