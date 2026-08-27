import json, glob, re
menu = set(json.load(open('g2_categories.json')))
from menu import SUPPLEMENT
menu |= set(SUPPLEMENT) | {'UNKNOWN','NO_REAL_SOURCE'}
out, bad = {}, []
for f in sorted(glob.glob('out2/*.json')):
    t = open(f).read()
    m = re.search(r'\[.*\]', t, re.S)
    if not m: bad.append((f,'no array')); continue
    try: arr = json.loads(m.group(0))
    except Exception as e: bad.append((f,str(e)[:60])); continue
    for r in arr:
        if r.get('slug') not in menu: bad.append((f, 'off-menu slug: '+str(r.get('slug'))))
        out[int(r['id'])] = r
json.dump(out, open('labels2.json','w'), ensure_ascii=False, indent=0)
print('parsed', len(out), 'labels;', len(bad), 'problems')
for b in bad[:10]: print('  ', b)
