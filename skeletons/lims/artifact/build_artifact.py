# -*- coding: utf-8 -*-
"""把多文件 lims 骨架打成一个自包含 HTML（发布用的观看副本）。
   style.css 与 grid.js 原样内联，不改一行；页面折成 hash 路由，见 artifact/single.js。"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'lims-skeleton.html')

rd = lambda *p: open(os.path.join(*p), encoding='utf-8').read()
css = rd(ROOT, 'assets', 'style.css')
grid = rd(ROOT, 'assets', 'grid.js')
single = rd(HERE, 'single.js')
data = json.dumps({
    'assay':   json.load(open(os.path.join(ROOT, 'data', 'assay.json'), encoding='utf-8')),
    'batches': json.load(open(os.path.join(ROOT, 'data', 'batches.json'), encoding='utf-8'))['rows'],
    'runs':    json.load(open(os.path.join(ROOT, 'data', 'runs.json'), encoding='utf-8'))['rows'],
    'results': json.load(open(os.path.join(ROOT, 'data', 'results.json'), encoding='utf-8'))['rows'],
}, ensure_ascii=False, separators=(',', ':'))

html = (
  '<title>LIMS 骨架</title>\n'
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap">\n'
  '<style>\n' + css + '</style>\n'
  '<div id="app"></div>\n'
  '<script>var DATA=' + data + ';</script>\n'
  '<script>\n' + grid + '</script>\n'
  '<script>\n' + single + '</script>\n'
)
open(OUT, 'w', encoding='utf-8').write(html)
print(OUT, len(html), 'chars')
