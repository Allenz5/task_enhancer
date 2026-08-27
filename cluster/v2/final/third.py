import json, glob, re
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
A,B=load('rA'),load('rB'); n=len(json.load(open('ids.json')))
com=set(A)&set(B)
dis=[i for i in com if A[i].get('slug')!=B[i].get('slug')]
miss=[i for i in range(n) if i not in A or i not in B]
bs=sorted({f'b{i//12:03d}' for i in dis+miss})
open('third_batches.txt','w').write('\n'.join(bs))
print(f'A {len(A)} B {len(B)} 共有 {len(com)}；不一致 {len(dis)} ({len(dis)*100//max(len(com),1)}%)；缺失 {len(miss)}；第三轮 {len(bs)}/85 批')
