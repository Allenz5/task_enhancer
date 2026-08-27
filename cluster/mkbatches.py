import json, os, re
rows = json.load(open('tasks.json'))
os.makedirs('batches', exist_ok=True)

def digest(i, r):
    files = ', '.join(f"{f['name']}({f['cat']})" for f in r['files'][:8])
    return (f"### TASK {i}\n"
            f"name: {r['task_name']}\n"
            f"domain: {r['industry_domain']}\n"
            f"toolchain: {(r['software'] or '')[:200]}\n"
            f"files: {files}\n"
            f"description: {r['desc'][:700]}\n"
            f"requirements: {r['reqs'][:700]}\n")

HEAD = """你在为一个"任务→网站环境"生成流水线做数据来源归因。下面是若干条任务。

对每条任务，判断：这份任务所处理的**数据，在现实世界里最可能来自哪个软件/网站/系统**。
注意：toolchain 字段写的是解题用的工具（Python/NumPy 等），几乎从不是数据来源，别被它带偏。
要看的是数据本身的性质：它是谁产出的、平时在哪个产品的界面里被人查看和下载。

对每条任务输出一个对象：
- id: 任务编号(整数)
- product: 最可能的真实产品/网站名（具体到品牌，如 "OpenSim GUI"、"IRIS/FDSN 地震数据中心"、"Materials Project"、"Jira"、"Google Analytics"、"SAP ERP"、"GitHub Actions"；不确定就给最贴切的具体产品）
- category: 该产品的品类，用简短英文 slug（如 "biomechanics-simulation-suite"、"seismic-data-portal"、"materials-database"、"issue-tracker"、"web-analytics-dashboard"、"erp-system"、"ci-cd-dashboard"、"lims"、"log-search-console"、"ecommerce-admin"）
- surface: 数据在那个产品里呈现的界面形态，英文 slug（如 "search-results-table"、"record-detail-page"、"file-browser"、"chart-dashboard"、"run-log-viewer"、"config-editor"）
- confidence: 0-1

只输出一个 JSON 数组，不要任何解释、不要 markdown 代码块。

"""

B = 12
n = 0
for s in range(0, len(rows), B):
    chunk = rows[s:s+B]
    body = '\n'.join(digest(s+j, r) for j, r in enumerate(chunk))
    open(f'batches/b{s:05d}.txt', 'w').write(HEAD + body)
    n += 1
print('batches', n)
