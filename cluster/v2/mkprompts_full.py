import json, os, random, re
from menu import build

MENU = build()
rows = json.load(open('../tasks.json'))
random.Random(20260823).shuffle(rows)
SAMPLE = rows  # 全量
json.dump([r['custom_id'] for r in SAMPLE], open('full_ids.json','w'))

GOAL = """你的任务：为每一条 benchmark 任务判断——**它的输入数据在现实世界里最可能是从哪一类软件/网站里导出来的**。

这不是问"用什么工具解题"（那是 Python/Excel 之类，不要答）。
问的是：这份数据原本躺在谁的界面里？一个人要拿到它，会去哪个系统里翻页、筛选、点开详情、导出？

判断依据的优先级：
1. 数据本身的形态与领域词汇（有哪些实体、字段、单位、专有格式）
2. 任务描述里透露的工作场景
3. 文件名与扩展名
行业名称（industry_domain）只能作弱参考——它说的是"谁在用"，不是"数据出自哪个系统"。"""

RULES = """输出规则 —— 每条任务给**两个互相独立的判断**：

**判断一 `slug`：如果非要为这份数据建一个界面，最贴近的是菜单里的哪一类。**
- 必须**逐字**取自菜单，不要发明、不要改写。**任何情况下都要给一个**，哪怕不确定
  （不确定由下面的 `source_real` 和 `confidence` 表达，不要用 slug 来表达）。
- **粒度裁决：多个 slug 都说得通时，一律选最具体的那个。**
  例：`mechanical-computer-aided-design-mcad` 优先于 `cad`；
  `usage-based-billing-software` 优先于 `billing`。宽泛的父类只在没有合适子类时才用。

**判断二 `source_real`：这份数据在现实里到底有没有一个真实系统作为出处。**
- `"yes"` —— 看得出真实来源：有领域词汇、单位、专有格式、可信的记录规模。
- `"no"` —— 是为出题合成/已去品牌化的抽象材料。特征：字段只有 id/rule/case/mode
  这类通用名，体量只有几百字节到几 KB，没有任何领域单位或专有格式。
- `"unsure"` —— 拿不准。

其余字段：
- `product`：该品类下最可能的那个**真实产品名**（如 "OpenSim"、"AVEVA PI System"）。
  拿不准填 null。不要造复合名（"腾讯文档/语雀 XX库"这种一律填 null）。
- `confidence`：0–1，对 `slug` 的把握，如实给。

只输出一个 JSON 数组，不要任何解释文字：
[{"id": <任务编号>, "slug": "...", "source_real": "yes"|"no"|"unsure", "product": "..."|null, "confidence": 0.0}, ...]"""

def brief(i, r):
    fn = ', '.join(f['name'] or '' for f in r['files'][:8]) or '(无)'
    return f"""### 任务 {i}
task_name: {r['task_name']}
industry_domain: {r['industry_domain']}
files: {fn}
task_description: {re.sub(r'\s+',' ', r['desc'])[:900]}
specific_requirements: {re.sub(r'\s+',' ', r['reqs'])[:700]}"""

os.makedirs('prompts_full', exist_ok=True)
B = 10
for b in range(0, len(SAMPLE), B):
    chunk = SAMPLE[b:b+B]
    body = "\n\n".join(brief(b+j, r) for j, r in enumerate(chunk))
    p = f"""{GOAL}

## 可选品类菜单（{len(MENU.splitlines())} 项，格式 `slug | 名称`）

{MENU}

## 再说一遍你要判断什么

{GOAL}

## 待判断的 {len(chunk)} 条任务

{body}

## 输出

{RULES}"""
    open(f'prompts_full/b{b//B:03d}.txt','w').write(p)
print('wrote', (len(SAMPLE)+B-1)//B, 'prompts; sample size', len(SAMPLE))
