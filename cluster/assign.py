"""合并两路，产出最终的每任务品类归属。

find_sources.py 钉死的任务只有一个来源名（"OpenSim"），没有品类；classify.py 分类的任务只有品类，
没有产品名。建站要的是品类 —— 所以这里把来源名按 truth.py 的对照表映射成品类。

对照表没覆盖到的来源会单独列出来，需要手工往 truth.py 里补，否则那些任务不会出现在
品类统计里（它们恰恰是来源最确凿的那批）。

产出 assignment.csv + assignment.json
"""
import json, re, csv, collections
from menu import SUPPLEMENT
from truth import TRUTH

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
named = json.load(open('named_sources.json'))
cats = json.load(open('categories.json'))
g2 = json.load(open('g2_categories.json'))
NAME = {**g2, **{k: re.sub(r'\s*[（(].*', '', v.split('——')[0]).strip()
                 for k, v in SUPPLEMENT.items()}}

out, unmapped = {}, collections.Counter()
for cid, v in cats.items():
    out[cid] = dict(slug=v['slug'], how='分类', source=None, source_real=v['source_real'],
                    votes=f"{v['votes']}/{v['of']}", confidence=v['confidence'])
for cid, v in named.items():
    s = (v['source'] or '').lower()
    acc = TRUTH.get(s)
    if not acc:
        unmapped[s] += 1
    out[cid] = dict(slug=(acc[0] if acc else None), how='原文点名', source=v['source'],
                    source_real='yes', votes='1/1', confidence=v.get('confidence') or 1.0)

with open('assignment.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['custom_id', 'task_name', 'how', 'slug', 'category_name',
                'named_source', 'source_real', 'votes', 'confidence'])
    for cid, v in out.items():
        w.writerow([cid, byid[cid]['task_name'], v['how'], v['slug'] or '',
                    NAME.get(v['slug'], '') if v['slug'] else '', v['source'] or '',
                    v['source_real'], v['votes'], v['confidence']])
json.dump(out, open('assignment.json', 'w'), ensure_ascii=False, indent=0)

sz = collections.Counter(v['slug'] for v in out.values() if v['slug'])
nos = [c for c, v in out.items() if not v['slug']]
print(f'{len(out)} 条 = 分类 {len(cats)} + 原文点名 {len(named)}')
print(f'落在 {len(sz)} 个品类上，单例 {sum(1 for _, n in sz.items() if n == 1)} 个；'
      f'没有品类的 {len(nos)} 条')
print('\n最大的品类:')
for s, n in sz.most_common(10):
    print(f'  {n:4d}  {s}')
if unmapped:
    print(f'\n⚠ truth.py 没覆盖的来源 {len(unmapped)} 个 / {sum(unmapped.values())} 条，'
          f'这些任务拿不到品类：')
    for s, n in unmapped.most_common(20):
        print(f'  {n:4d}  {s}')
