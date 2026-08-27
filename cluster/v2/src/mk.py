import json, re, os
B='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
rows=json.load(open(B+'tasks.json')); v2=json.load(open(B+'v2/final_labels.json'))
prov=json.load(open(B+'_stale_round1/prov.json'))
STOP={'wind','city','snap','mast','building','amplitude','priva','mace','core','flow','origin','pulse','atlas','excel','git','github','python','kaggle','generic','unknown','fusion','vision','spark','arc','edge','delta','prism','matrix','helix','summit','vertex','cluster','portal','platform','system','studio','suite','server','national'}
TOOL={'microsoft excel','matlab','kubernetes','flask','vs code','docker','numpy','pandas','jupyter','pytorch','tensorflow','scikit-learn','postgresql','mysql','nginx','linux','ubuntu','django','fastapi','sqlite','node.js'}
def norm(p): return re.split(r'[（(/、,]', p)[0].strip()
lex=set()
for s in (v2, prov):
    for v in s.values():
        p=v.get('product')
        if p:
            n=norm(p)
            if len(n)>=4 and n.lower() not in STOP and n.lower() not in TOOL: lex.add(n)
pat=re.compile(r'(?<![A-Za-z0-9])('+'|'.join(sorted((re.escape(x) for x in lex),key=len,reverse=True))+r')(?![A-Za-z0-9])',re.I)
url=re.compile(r'https?://\S+|www\.[a-z0-9-]+\.[a-z]{2,}|\b[a-z0-9-]{3,}\.(?:com|org|net|gov|edu|io|cn)\b',re.I)
def blob(r): return ' ⏐ '.join([r['task_name'] or '', r['desc'] or '', r['reqs'] or '', r['verify'] or '',
                                ' '.join(f['name'] or '' for f in r['files'])])
cands=[]
for r in rows:
    s=re.sub(r'\s+',' ', blob(r)); seen={}
    for m in list(pat.finditer(s))+list(url.finditer(s)):
        k=m.group(0)
        if k.lower() in seen: continue
        seen[k.lower()]=s[max(0,m.start()-110):min(len(s),m.end()+110)]
        if len(seen)>=4: break
    if seen: cands.append((r, seen))
print('待判任务', len(cands))
json.dump([r['custom_id'] for r,_ in cands], open('ids.json','w'))

GOAL="""判断任务描述里提到的那个名字，**到底是不是这份数据的出处**。

一个名字出现在文里，可能是五种角色之一：
- `出处`      这份输入数据就是从它导出/下载/快照来的。例："数据来自 UCI…"、"使用冻结的 eCFR XML 快照"、"附件为从 BLS 导出"、"文件格式：OpenSim XML"、"上游 OpenSim 缩放和 IK 的产出"
- `产出物`    它是这道题要生成的东西，不是输入。例："生成 Neuroglancer 状态文件"、"构建可供 M3GNet 风格模型使用的图"
- `数据里的值` 名字是数据内容中的一个字段值，不是数据的来源。例：数据是招聘岗位表，文中的 RenderDoc 是岗位要求里列的技能
- `解题工具`   拿它来算/来跑，或明确说不用跑它。例："不得重跑 LAMMPS"、"若无 VASP 则跳过"、"受 Seedance 单次时长限制"
- `无关`      任务自造的项目名、或纯属提及

注意否定句是陷阱：「不需要运行 VASP 能量计算」里的 VASP 是解题工具且明确不用，不是出处。"""

RULES="""每条任务输出一个对象：

{"id": <编号>, "source": "<确认为出处的那个名字>"|null, "role": "出处"|"产出物"|"数据里的值"|"解题工具"|"无关", "confidence": 0.0}

- 一条任务给了多个候选时，只要**其中任何一个**是出处，就把那个名字填进 `source`，`role` 填 `出处`。
- 都不是出处时 `source` 填 null，`role` 填最贴切的那一种。
- 名字要**逐字**照抄候选，不要改写不要补全。

只输出 JSON 数组，无其他文字。"""

os.makedirs('p', exist_ok=True)
BAT=12
for b in range(0,len(cands),BAT):
    chunk=cands[b:b+BAT]; body=[]
    for j,(r,seen) in enumerate(chunk):
        cs='\n'.join(f'  - 候选「{k}」上下文：…{v}…' for k,v in seen.items())
        body.append(f"### 任务 {b+j}\n任务名：{r['task_name']}\n{cs}")
    open(f'p/b{b//BAT:03d}.txt','w').write(f"{GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n"+'\n\n'.join(body)+f"\n\n## 输出\n\n{RULES}")
print('prompts', (len(cands)+BAT-1)//BAT)
