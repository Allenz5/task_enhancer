import json, re

def build(r):
    """Text used for clustering. Weighted by repetition: fields that speak to
    *where the data comes from* count more than boilerplate requirements."""
    name = r['task_name'] or ''
    dom  = r['industry_domain'] or ''
    sw   = r['software'] or ''
    fn   = ' '.join((f['name'] or '') for f in r['files'])
    ext  = ' '.join(sorted({re.sub(r'.*\.', '', (f['name'] or '')).lower() for f in r['files']}))
    desc = r['desc'][:1200]
    reqs = r['reqs'][:1200]
    return ' \n'.join([name, name, dom, dom, sw, fn, ext, desc, reqs])

if __name__ == '__main__':
    rows = json.load(open('tasks.json'))
    docs = [build(x) for x in rows]
    json.dump(docs, open('docs.json', 'w'), ensure_ascii=False)
    print(len(docs), 'docs, avg len', sum(map(len, docs)) // len(docs))
