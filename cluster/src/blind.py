import json, re, os
B='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
g2=json.load(open('../g2_categories.json')); keep=json.load(open('../menu_keep.json'))
import sys; sys.path.insert(0,'..')
from menu import SUPPLEMENT
# 菜单：剪后的 G2 + 手写补充（去掉产品举例）
def strip_ex(d): return re.sub(r'\s*[（(].*', '', d.split('——')[0]).strip() or d[:60]
MENU='\n'.join([f'{s} | {g2[s]}' for s in keep] +
               [f'{s} | {strip_ex(d)}' for s,d in SUPPLEMENT.items()])
rows=json.load(open(B+'tasks.json')); byid={r['custom_id']:r for r in rows}
gold=json.load(open('gold.json')); roles=json.load(open('roles.json'))

def redact(txt, name):
    t=re.sub(re.escape(name), '※', txt, flags=re.I)
    t=re.sub(r'https?://\S+|www\.\S+|\b[a-z0-9-]{3,}\.(?:com|org|net|gov|edu|io|cn)\b','※',t,flags=re.I)
    return t

GOAL="""判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
不是问用什么工具解题。问的是：这份数据原本躺在谁的界面里？

原文中的软件名与网址已被替换成 ※，请依据数据形态、领域词汇、字段与单位来判断。"""
RULES="""每条给两个独立判断：
- `slug`：必须逐字取自菜单，任何情况都要给一个；多个都说得通时选最具体的。
- `source_real`："yes" 有真实来源 / "no" 是为出题合成的抽象材料 / "unsure"。
- `confidence`：0-1。

只输出 JSON 数组：[{"id":<编号>,"slug":"...","source_real":"yes|no|unsure","confidence":0.0}, ...]"""

items=sorted(gold.keys())
json.dump(items, open('blind_ids.json','w'))
os.makedirs('bp', exist_ok=True)
BAT=10
for b in range(0,len(items),BAT):
    body=[]
    for j,cid in enumerate(items[b:b+BAT]):
        r=byid[cid]; nm=roles[cid]['source']
        fn=', '.join(f['name'] or '' for f in r['files'][:6])
        d=redact(re.sub(r'\s+',' ', r['desc'])[:900], nm)
        q=redact(re.sub(r'\s+',' ', r['reqs'])[:600], nm)
        body.append(f"### 任务 {b+j}\ntask_name: {redact(r['task_name'] or '', nm)}\n"
                    f"industry_domain: {r['industry_domain']}\nfiles: {redact(fn, nm)}\n"
                    f"task_description: {d}\nspecific_requirements: {q}")
    open(f'bp/b{b//BAT:03d}.txt','w').write(
        f"{GOAL}\n\n## 品类菜单（{len(MENU.splitlines())} 项）\n\n{MENU}\n\n## 再说一遍\n\n{GOAL}\n\n"
        f"## 待判断的 {len(body)} 条\n\n"+'\n\n'.join(body)+f"\n\n## 输出\n\n{RULES}")
print(f'菜单 {len(MENU.splitlines())} 项 / {len(MENU)//4} token；{len(items)} 条 → {(len(items)+BAT-1)//BAT} 批')
