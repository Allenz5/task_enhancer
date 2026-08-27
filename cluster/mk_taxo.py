import json, collections
prov = {int(k):v for k,v in json.load(open('prov.json')).items()}
pairs = collections.Counter((p.get('product','?'), p.get('category','?')) for p in prov.values())
lines = [f'{n}\t{prod}\t{cat}' for (prod,cat),n in pairs.most_common()]
open('vocab.tsv','w').write('\n'.join(lines))
print(len(lines), 'distinct (product,category) pairs')

HEAD = """下面是一批任务的"数据来源"标注，每行是：任务数 <TAB> 产品名 <TAB> 品类slug。

我要为这些任务生成 Web 环境（模拟真实软件界面，让 agent 通过点击/搜索/翻页取回数据）。
每个任务单独做一个网站太贵。请把这些来源归并成**站点家族(site family)**：
同一个家族 = 可以用**同一套界面骨架**（同样的导航结构、列表/详情形态、筛选器、导出方式）来承载，只换数据。

判断标准是**界面形态是否可以复用**，不是学科是否相同。
例：OpenSim 和 OpenCap 都是"生物力学试验/仿真结果库"，界面都是 试验列表→受试者/试次详情→时序文件下载，可以同族；
    而 GitHub 和 Jira 虽然都属研发工具，但一个是仓库/PR/diff，一个是工单看板，不同族。

目标 35-60 个家族。覆盖全部输入行，不要遗漏。

输出一个 JSON 数组，每个元素：
- family: 英文 slug（如 "experiment-result-repository"）
- family_cn: 中文名
- ui_skeleton: 一句话描述这套界面骨架（导航→列表→详情→导出）
- members: 该家族包含的产品名数组，必须与输入的产品名**逐字一致**

只输出 JSON 数组，无解释，无 markdown 围栏。

"""
V = open('vocab.tsv').read()
open('taxo_prompt.txt','w').write(HEAD + V)
print('prompt chars', len(HEAD)+len(V))
