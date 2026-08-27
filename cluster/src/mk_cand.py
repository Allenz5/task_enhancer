"""全量抽取：让模型读每条任务的原文，找出被点名的数据来源候选。

取代原来的正则扫词表 —— 词表只认得上一轮猜过的名字，认不出的永远进不了候选池。
这一步只负责**找名字**，不判断它是不是真的出处；角色判定由 mk.py 那一问单独做。
所以指令是宁可多给不要漏，precision 交给下一步。
"""
import json, os, re
B='/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/'
rows=json.load(open(B+'tasks.json'))
json.dump([r['custom_id'] for r in rows], open('cand_ids.json','w'))

GOAL="""判断每条任务的原文里，有没有**直接写出输入数据的来源** —— 那份数据是从哪个
软件、网站、数据库、公开仓库里导出/下载/快照来的，名字有没有被明写出来。

这一步只负责**把名字找出来**，不要判断它到底是不是来源 —— 下一步会单独判。
所以**宁可多给，不要漏**：只要一个名字有可能跟这份数据的出身有关，就列出来。
包括你拿不准是解题工具还是数据来源的那些（"不得重跑 LAMMPS"里的 LAMMPS 也要列）。

不要列的只有一类：纯粹的通用工具链名 —— Python、Excel、MATLAB、Docker、
Kubernetes、Git、VS Code、NumPy、pandas 这种。它们从来不是数据来源。"""

RULES="""每条任务输出一个对象：

{"id": <编号>, "names": [{"name": "...", "quote": "..."}, ...]}

- `name` —— 名字本身，**逐字照抄原文**，不要翻译、不要补全、不要改大小写。
  网址和域名也算名字（写成 `uci.edu`、`https://...` 这样）。
- `quote` —— 这个名字所在的那一小段原文，**逐字照抄，20–60 字**，必须包含 `name`。
  我们会拿这段回原文里做字符串匹配，对不上的会被丢弃，所以不要改写、不要拼接
  两处不相邻的文字。
- 一条任务最多列 4 个；一个名字在原文里出现多次时只列一次。
- 原文没有点名任何来源时，`names` 填空数组 `[]`。

只输出一个 JSON 数组，无其他文字。"""

def blob(r):
    return ' ⏐ '.join([r['task_name'] or '', r['desc'] or '', r['reqs'] or '',
                       r['verify'] or '', ' '.join(f['name'] or '' for f in r['files'])])

def brief(i, r):
    fn=', '.join(f['name'] or '' for f in r['files'][:8]) or '(无)'
    return (f"### 任务 {i}\ntask_name: {r['task_name']}\n"
            f"industry_domain: {r['industry_domain']}\nfiles: {fn}\n"
            f"task_description: {re.sub(r'\\s+',' ', r['desc'])[:900]}\n"
            f"specific_requirements: {re.sub(r'\\s+',' ', r['reqs'])[:700]}\n"
            f"verification_method: {re.sub(r'\\s+',' ', r['verify'])[:300]}")

os.makedirs('cp', exist_ok=True)
BAT=10
for b in range(0, len(rows), BAT):
    chunk=rows[b:b+BAT]
    body='\n\n'.join(brief(b+j, r) for j, r in enumerate(chunk))
    open(f'cp/b{b//BAT:03d}.txt','w').write(
        f"{GOAL}\n\n## 待判断的 {len(chunk)} 条任务\n\n{body}\n\n## 输出\n\n{RULES}")
print('批次', (len(rows)+BAT-1)//BAT, '/ 任务', len(rows))
