"""找出 A/B 两轮 slug 不一致的任务，把它们所在的批次列出来跑第三轮。"""
import json, glob, re, os
from menu import SUPPLEMENT
ok = set(json.load(open('g2_categories.json'))) | set(SUPPLEMENT)

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

A, B = load('fullA'), load('fullB')
common = set(A) & set(B)
dis = [i for i in common if A[i].get('slug') != B[i].get('slug')]
missing = [i for i in range(1299) if i not in A or i not in B]
batches = sorted({f'b{i//10:03d}' for i in dis + missing})
open('third_batches.txt','w').write('\n'.join(batches))
print(f'A {len(A)} labels, B {len(B)} labels, common {len(common)}')
print(f'不一致 {len(dis)} 条 ({len(dis)*100//max(len(common),1)}%), 缺失 {len(missing)} 条')
print(f'需要第三轮的批次: {len(batches)}/130')
