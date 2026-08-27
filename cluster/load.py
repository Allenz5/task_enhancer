import json, os
SRC = os.path.expanduser('~/Desktop/all-remaining-active-20260821.jsonl')
MARK = '任务证据包：'
rows, bad = [], 0
for line in open(SRC):
    d = json.loads(line)
    p = d['prompt']; i = p.find(MARK)
    if i < 0: bad += 1; continue
    try: o = json.loads(p[i+len(MARK):].strip())
    except Exception: bad += 1; continue
    t = o.get('task') or {}
    rows.append({
        'custom_id': d['custom_id'],
        'submission_id': d['submission_id'],
        'task_name': d.get('task_name'),
        'status': d.get('status'),
        'industry_domain': t.get('industry_domain'),
        'os': t.get('operating_system'),
        'licensing': t.get('software_licensing'),
        'desc': t.get('task_description') or '',
        'reqs': t.get('specific_requirements') or '',
        'verify': t.get('verification_method') or '',
        'time': t.get('expected_completion_time') or '',
        'files': [{'name': f.get('filename'), 'cat': f.get('category'),
                   'ct': f.get('content_type'), 'sz': f.get('size_bytes')}
                  for f in (o.get('files') or [])],
    })
json.dump(rows, open('tasks.json','w'), ensure_ascii=False)
print('rows', len(rows), 'bad', bad)
