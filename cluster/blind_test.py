"""盲测：把答案盖住，看 classify.py 的分类器还能不能还原出品类。

验证集是免费的 —— find_sources.py 找出的那些原文点名的任务，来源已知。把名字和所有网址
替换成 ※，让分类器只凭数据形态、领域词汇、字段与单位判断，再拿 truth.py 的
对照表核对。

只有 truth.py 覆盖到的来源能进验证集，其余跳过。
"""
import json, re, collections
import llm
from menu import SUPPLEMENT
from truth import TRUTH, EXCLUDE

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
named = json.load(open('named_sources.json'))
g2 = json.load(open('g2_categories.json'))
keep = json.load(open('menu_keep.json'))


def strip_ex(d):
    return re.sub(r'\s*[（(].*', '', d.split('——')[0]).strip() or d[:60]


MENU = '\n'.join([f'{s} | {g2[s]}' for s in keep] +
                 [f'{s} | {strip_ex(d)}' for s, d in SUPPLEMENT.items()])

gold = {}
for cid, v in named.items():
    s = (v['source'] or '').lower()
    if s in EXCLUDE:
        continue
    if s in TRUTH:
        gold[cid] = TRUTH[s]
json.dump(gold, open('gold.json', 'w'), ensure_ascii=False, indent=0)
ids = sorted(gold)
print(f'验证集 {len(ids)} 条（原文点名 {len(named)} 条里 truth.py 覆盖到的）')


def redact(txt, name):
    t = re.sub(re.escape(name), '※', txt, flags=re.I)
    return re.sub(r'https?://\S+|www\.\S+|\b[a-z0-9-]{3,}\.(?:com|org|net|gov|edu|io|cn)\b',
                  '※', t, flags=re.I)


GOAL = """判断每条任务的**输入数据在现实里最可能从哪一类软件/网站导出**。
不是问用什么工具解题。问的是：这份数据原本躺在谁的界面里？

原文中的软件名与网址已被替换成 ※，请依据数据形态、领域词汇、字段与单位来判断。"""

RULES = """每条给两个独立判断：
- `slug`：必须逐字取自菜单，任何情况都要给一个；多个都说得通时选最具体的。
- `source_real`：**只看数据本身有没有真实出身，不要看你能不能认出是哪个产品。**
  `"yes"` 数据带领域特征——专业字段名、物理单位、专有格式、可信的记录规模。
  **认不出具体产品也照样填 yes**，现实里绝大多数数据来自没有名气的内部系统。
  `"no"` 只在明显是为出题现编时用：字段全是 id/rule/case/mode 这类无领域含义的
  通用名，没有任何单位或专有格式，体量只有几百字节到几 KB。
  `"unsure"` 两边特征都有。
- `confidence`：0-1，对 `slug` 的把握。

只输出 JSON 数组：[{"id":<编号>,"slug":"...","source_real":"yes|no|unsure","confidence":0.0}, ...]"""

prompts = []
for b, chunk in enumerate(llm.batched(ids, 10)):
    body = []
    for j, cid in enumerate(chunk):
        r = byid[cid]
        nm = named[cid]['source']
        fn = ', '.join(f['name'] or '' for f in r['files'][:6])
        body.append(f"### 任务 {b*10+j}\ntask_name: {redact(r['task_name'] or '', nm)}\n"
                    f"industry_domain: {r['industry_domain']}\nfiles: {redact(fn, nm)}\n"
                    f"task_description: {redact(re.sub(r'\s+',' ', r['desc'])[:900], nm)}\n"
                    f"specific_requirements: {redact(re.sub(r'\s+',' ', r['reqs'])[:600], nm)}")
    prompts.append(f"{GOAL}\n\n## 品类菜单（{len(MENU.splitlines())} 项）\n\n{MENU}\n\n"
                   f"## 再说一遍\n\n{GOAL}\n\n## 待判断的 {len(chunk)} 条\n\n" +
                   '\n\n'.join(body) + f"\n\n## 输出\n\n{RULES}")

R = llm.by_id(llm.ask('blind_test', 'A', prompts))

ok = n = sr = 0
miss = collections.Counter()
for j, cid in enumerate(ids):
    if j not in R:
        continue
    n += 1
    if R[j].get('slug') in gold[cid]:
        ok += 1
    else:
        miss[f"{named[cid]['source']} → {R[j].get('slug')}"] += 1
    if R[j].get('source_real') == 'yes':
        sr += 1
print(f'\n命中真值 {ok}/{n} = {ok/n:.1%}　source_real=yes {sr/n:.1%}')
print('\n判错最多的:')
for k, c in miss.most_common(12):
    print(f'  {c:3d}  {k}')
