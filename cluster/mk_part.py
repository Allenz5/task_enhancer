import json, os, random, numpy as np, collections
rows=json.load(open('tasks.json'))
L=dict(np.load('labels_lowk.npz'))
names={o['cluster']:o for o in json.load(open('plot.json'))['clusters']}
rnd=random.Random(4242)
def dig(i):
    r=rows[i]
    return (f"name: {r['task_name']}\ndomain: {r['industry_domain']}\n"
            f"files: {', '.join((f['name'] or '') for f in r['files'][:6])}\n"
            f"desc: {r['desc'][:380]}\nreqs: {r['reqs'][:260]}")
HEAD="""下面是从同一个任务簇里抽出的 12 个任务。

请按"**能不能用同一套界面骨架**（同样的导航、列表/详情形态、筛选器、导出方式）承载它们的输入数据"把这 12 个任务分组。
能共用的放同一组；界面骨架不同的另起一组。孤立的任务自成一组。
不要按学科分，只按界面形态分。

输出 {"groups": [[任务编号,...], [任务编号,...], ...]}，覆盖全部 12 个编号，不重不漏。
只输出 JSON，无解释，无 markdown 围栏。

"""
os.makedirs('part',exist_ok=True)
plan=[]
for key in ('k30','k80'):
    lab=L[key]; g=collections.defaultdict(list)
    for i,v in enumerate(lab): g[int(v)].append(i)
    big=sorted(g.values(), key=len, reverse=True)
    picks = big[:6] + [big[len(big)//2]] + [big[-3]]      # 大中小都覆盖
    for rep in range(2):                                   # 每簇抽两次看噪声
        for ci,mem in enumerate(picks):
            if len(mem) < 12: continue
            s=rnd.sample(mem,12)
            body='\n'.join(f"### 任务 {j}\n{dig(i)}\n" for j,i in enumerate(s))
            fn=f'part/{key}_c{ci}_r{rep}.txt'
            open(fn,'w').write(HEAD+body)
            plan.append({'file':fn,'key':key,'ci':ci,'rep':rep,'n':len(mem),'ids':s})
json.dump(plan,open('part_plan.json','w'))
print(len(plan),'个分组测试')
