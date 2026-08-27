# -*- coding: utf-8 -*-
"""把多文件骨架打成一个自包含 HTML（发布用的观看副本）。
   CSS 与数据原样内联，不做任何视觉改动；页面折成 hash 路由，见 artifact/single.js。"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'job-skeleton.html')

css = open(os.path.join(ROOT, 'assets', 'style.css'), encoding='utf-8').read()
js = open(os.path.join(HERE, 'single.js'), encoding='utf-8').read()
jobs = json.load(open(os.path.join(ROOT, 'data', 'jobs.json'), encoding='utf-8'))
brands = json.load(open(os.path.join(ROOT, 'data', 'companies.json'), encoding='utf-8'))
data = json.dumps({'jobList': jobs['jobList'], 'brandList': brands['brandList']},
                  ensure_ascii=False, separators=(',', ':'))

html = (
  '<title>招聘站骨架</title>\n'
  '<style>\n' + css + '</style>\n'
  '<div id="app"></div>\n'
  '<script>var DATA=' + data + ';</script>\n'
  '<script>\n' + js + '</script>\n'
)
open(OUT, 'w', encoding='utf-8').write(html)
print(OUT, len(html), 'chars')
