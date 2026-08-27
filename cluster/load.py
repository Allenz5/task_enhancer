"""上游 jsonl → tasks.json。

每行是一次提交，真正有用的东西埋在 `prompt` 字段里 —— 一段以「任务证据包：」开头的
JSON。只取后面几步真正读的字段，其余（提交状态、操作系统、授权方式、预计耗时、
文件的 MIME 与体积）一概不留：留着只会让人以为它们参与了判断。

`software_and_version` 尤其不能留。它写的是解题工具链（python3.11.5、MATLAB…），
跟数据来源没有关系，把它喂给模型只会把判断带偏。
"""
import json, os

SRC = os.path.expanduser('~/Desktop/all-remaining-active-20260821.jsonl')
MARK = '任务证据包：'

rows, bad = [], []
for line in open(SRC):
    d = json.loads(line)
    i = d['prompt'].find(MARK)
    if i < 0:
        bad.append((d['custom_id'], '没有证据包'))
        continue
    try:
        o = json.loads(d['prompt'][i+len(MARK):].strip())
    except Exception as e:
        bad.append((d['custom_id'], f'证据包解析失败: {e}'))
        continue
    t = o.get('task') or {}
    rows.append({
        'custom_id': d['custom_id'],
        'task_name': d.get('task_name') or '',
        'industry_domain': t.get('industry_domain') or '',
        'desc': t.get('task_description') or '',
        'reqs': t.get('specific_requirements') or '',
        'verify': t.get('verification_method') or '',
        'files': [f.get('filename') or '' for f in (o.get('files') or [])],
    })

json.dump(rows, open('tasks.json', 'w'), ensure_ascii=False)
print(f'{len(rows)} 条 → tasks.json')
if bad:
    print(f'丢弃 {len(bad)} 条：')
    for cid, why in bad[:10]:
        print(f'  {cid}  {why}')
