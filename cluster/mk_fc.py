# 强迫二选一评估：给任务证据 + 真站点 + 随机负站点，看判官能否选对
import json,random,sys,os,collections
ASG=sys.argv[1]; OUT=sys.argv[2]; SEED=int(sys.argv[3]); NP=int(sys.argv[4])
asg=json.load(open(ASG))                      # {task_idx: group_name}
tasks=json.load(open('tasks.json'))
groups=sorted({v for v in asg.values()})
bysite=collections.defaultdict(list)
for k,v in asg.items(): bysite[v].append(k)
rnd=random.Random(SEED)
# 按簇大小加权抽任务（否则小簇被高估）
pool=[k for k,v in asg.items()]
picks=rnd.sample(pool,min(NP,len(pool)))
def eb(i):
    t=tasks[int(i)]
    return (f"任务: {t['task_name']}\n领域: {t['industry_domain']}\n"
            f"文件: {', '.join((f['name'] or '') for f in t['files'][:5])}\n"
            f"描述: {(t['desc'] or '')[:420]}")
HEAD="""判断下面这个任务的**输入数据**更可能来自哪一个网站/软件。判据是界面骨架：哪个站的导航、列表/详情形态、筛选器和导出方式，能直接承载这份数据。

只输出 A 或 B，不要解释。

"""
items=[]
for i in picks:
    true=asg[i]
    negs=[g for g in groups if g!=true]
    if not negs: continue
    neg=rnd.choice(negs)
    swap=rnd.random()<0.5                      # AB / BA 各半，用于测位置偏差
    a,b=(true,neg) if not swap else (neg,true)
    items.append({'i':i,'true':true,'neg':neg,'swap':swap,
                  'ans':'B' if swap else 'A',
                  'prompt':HEAD+f"{eb(i)}\n\nA. {a}\nB. {b}\n"})
os.makedirs(OUT,exist_ok=True)
for j,it in enumerate(items): open(f'{OUT}/q{j:04d}.txt','w').write(it['prompt'])
json.dump(items,open(f'{OUT}/_meta.json','w'),ensure_ascii=False)
print(f"{len(items)} 道二选一题 -> {OUT}  (A为真{sum(1 for x in items if not x['swap'])}, B为真{sum(1 for x in items if x['swap'])})")
