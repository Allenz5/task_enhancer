"""从 g2.html 抽出品类表。

g2.html 是 G2「All Categories」页的存档。页面按 38 个顶层分组（`td.l3`）排版，
每个品类行里带一个 `div.categories__parent` 写明它挂在谁下面 —— 层级是全的。

产出
  g2_categories.json  {slug: 品类名}                    2239 项
  g2_tree.json        {顶层分组: {父类: [slug, ...]}}    分类菜单要用的两级结构
"""
import json, re, html, collections

page = open('g2.html').read()

TABLE = re.compile(r'<table class="categories__table">(.*?)</table>', re.S)
HEAD = re.compile(r'<td class="l3"[^>]*>(.*?)</td>', re.S)
ITEM = re.compile(
    r'href="/categories/([a-z0-9\-]+)"[^>]*>(.*?)</a>.*?'
    r'<div class="categories__parent">(.*?)</div>', re.S)


def txt(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s)).strip()


cats, tree = {}, collections.defaultdict(lambda: collections.defaultdict(list))
for body in TABLE.findall(page):
    h = HEAD.search(body)
    section = txt(h.group(1)) if h else '(无分组)'
    for slug, name, parent in ITEM.findall(body):
        if slug in cats:
            continue
        cats[slug] = txt(name)
        tree[section][txt(parent)].append(slug)

json.dump(cats, open('g2_categories.json', 'w'), ensure_ascii=False, indent=0, sort_keys=True)
json.dump({s: dict(p) for s, p in tree.items()}, open('g2_tree.json', 'w'),
          ensure_ascii=False, indent=1)

placed = sum(len(v) for p in tree.values() for v in p.values())
print(f'{len(cats)} 个品类，{len(tree)} 个顶层分组，'
      f'{sum(len(p) for p in tree.values())} 个父类，已归位 {placed}')
print(f'\n各顶层分组下的品类数：')
for s, p in sorted(tree.items(), key=lambda kv: -sum(len(v) for v in kv[1].values())):
    print(f'  {sum(len(v) for v in p.values()):4d}  {len(p):3d} 父类  {s}')
