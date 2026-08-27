import json, re, os, sys
B='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
sys.path.insert(0,'/Users/allenzhang/Desktop/workspace/task_enhancer/cluster')
from menu import SUPPLEMENT
g2=json.load(open('/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/g2_categories.json')); keep=json.load(open('/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/menu_keep.json'))
def strip_ex(d): return re.sub(r'\s*[（(].*','',d.split('——')[0]).strip() or d[:60]
MENU='\n'.join([f'{s} | {g2[s]}' for s in keep]+[f'{s} | {strip_ex(d)}' for s,d in SUPPLEMENT.items()])

rows=json.load(open(B+'tasks.json')); byid={r['custom_id']:r for r in rows}
roles=json.load(open('/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/src/roles.json'))
done={c for c,v in roles.items() if v.get('role')=='出处' and v.get('source')}
poison=json.load(open('/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/src/poison.json'))
todo=[r['custom_id'] for r in rows if r['custom_id'] not in done]
print(f'待分类 {len(todo)} 条（已筛走 {len(done)}），其中毒名任务 {len([c for c in todo if c in poison])} 条')
json.dump(todo, open('final/ids.json','w'))

GOAL="""判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
不是问用什么工具解题（Python/Excel 之类一律不算）。问的是：这份数据原本躺在谁的界面里？
一个人要拿到它，会去哪个系统里翻页、筛选、点开详情、导出？

**出处优先于场景。** 如果原文写了数据的来路（"数据来自…"、"从…下载"、"公开 benchmark"、
"CC-BY / CC0 许可"、"可自由再分发"），那个来路就是答案——**不要因为任务描述里的岗位场景
（"你是设备状态监测工程师，工厂有一套试验台…"）就改判成那个场景里的系统。**
公开数据集套一个虚构岗位，出处仍然是数据集仓库。

判断依据优先级：数据形态与领域词汇（实体、字段、单位、专有格式）> 工作场景 > 文件名。
industry_domain 只能弱参考——它说的是"谁在用"，不是"数据出自哪个系统"。"""

RULES="""每条给两个独立判断：

- `slug`：必须逐字取自菜单，任何情况都要给一个；多个都说得通时选最具体的
  （`mechanical-computer-aided-design-mcad` 优先于 `cad`）。

- `source_real`：**只看数据本身有没有真实出身，不要看你能不能认出是哪个产品。**
  - `"yes"` —— 数据带领域特征：专业字段名、物理单位、专有格式、可信的记录规模、
    真实地名/机构名/型号。**认不出具体产品也照样填 yes** ——现实里绝大多数数据
    来自没有名气的内部系统，认不出是常态，不是"没有来源"的证据。
  - `"no"` —— 只在数据明显是为出题现编时才用：字段全是 id/rule/case/mode 这类
    无领域含义的通用名，没有任何单位或专有格式，体量只有几百字节到几 KB。
  - `"unsure"` —— 两边特征都有。

- `confidence`：0-1，对 `slug` 的把握。

只输出 JSON 数组：[{"id":<编号>,"slug":"...","source_real":"yes|no|unsure","confidence":0.0}, ...]"""

os.makedirs('final/p', exist_ok=True)
BAT=12
for b in range(0,len(todo),BAT):
    body=[]
    for j,cid in enumerate(todo[b:b+BAT]):
        r=byid[cid]
        warn=''
        if cid in poison:
            v=poison[cid]; nm='、'.join(f'「{x}」' for x in v['names'])
            warn=f"\n⚠ 本任务提到的 {nm} 已判定为**{v['role']}**，不是数据来源，不要据此判断。"
        fn=', '.join(f['name'] or '' for f in r['files'][:6])
        body.append(f"### 任务 {b+j}{warn}\ntask_name: {r['task_name']}\n"
                    f"industry_domain: {r['industry_domain']}\nfiles: {fn}\n"
                    f"task_description: {re.sub(r'\\s+',' ', r['desc'])[:900]}\n"
                    f"specific_requirements: {re.sub(r'\\s+',' ', r['reqs'])[:600]}")
    open(f'final/p/b{b//BAT:03d}.txt','w').write(
        f"{GOAL}\n\n## 品类菜单（{len(MENU.splitlines())} 项）\n\n{MENU}\n\n## 再说一遍\n\n{GOAL}\n\n"
        f"## 待判断的 {len(body)} 条\n\n"+'\n\n'.join(body)+f"\n\n## 输出\n\n{RULES}")
print('批次', (len(todo)+BAT-1)//BAT)
