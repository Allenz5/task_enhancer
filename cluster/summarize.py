"""给 489 条候选任务各写一段「数据从哪来、具体是什么、拿它干什么」。

标注台上代替原始任务书 —— 原文是任务书体裁，背景、目标、输入输出文件、字数要求混在
一起，人工审阅时看不动。但摘要压得太短同样没法判断品类：得让人凭这段话就能想象出
那批数据原本摆在什么界面上。

产出 summary.json: {custom_id: {"src": ..., "data": ..., "job": ...}}
"""
import json
import llm

rows = json.load(open('tasks.json'))
byid = {r['custom_id']: r for r in rows}
ids = list(json.load(open('labels.json')).keys())
print(f'{len(ids)} 条候选')

RULES = """每条输出一个对象：

{"id": <编号>, "src": "<数据从哪来>", "data": "<具体是什么>", "job": "<拿它干什么>"}

**src —— 这批输入数据是从什么地方拿出来的。** 说清是哪一类系统/网站/后台/仪器/台账，
原文如果点了名（软件名、网站名、数据库名、机构名）就把名字写进去；原文没点名就写你
从数据形态推断出的那类地方，并写"（原文未点名）"。20~45 字。

**data —— 具体是什么。** 要形象、要落到实处：几个文件、什么格式、多少条记录、每条
记录有哪些关键字段、时间跨度或规模是多少。看的人要能凭这段话在脑子里画出那张表。
60~110 字。不许写"若干附件""相关资料""多维指标"这种空话。

**job —— 拿它干什么。** 具体动作 + 最终产出物。40~70 字。不要写字数、页数、格式合规
这类交付要求。

三段都用中文。不要复述任务名，不要写背景故事和意义阐述。只写原文里真有的东西，
原文没说的规模/字段不要编。

### 示范（好）
{"id": 7,
 "src": "招聘网站的岗位搜索结果页导出，原文点名 BOSS直聘",
 "data": "一份 800 条岗位 JD 的 Excel，每行含岗位名、公司、城市、薪资区间、经验与学历要求、岗位职责全文；外加求职者本人的一份简历 PDF 和一张目标城市清单",
 "job": "把简历与 800 条岗位逐条比对打分，筛出匹配度最高的 20 个岗位，写一份求职方向与技能补齐建议"}

### 示范（坏 —— 抽象到没法判断，不要这样写）
{"src": "招聘相关平台", "data": "岗位数据和简历附件", "job": "做匹配分析并输出报告"}

只输出 JSON 数组，无其他文字。"""

BAT = 10
prompts = []
for b, chunk in enumerate(llm.batched(ids, BAT)):
    body = []
    for j, c in enumerate(chunk):
        r = byid[c]
        f = '、'.join(r['files'][:14])
        body.append(f"### {b*BAT+j}\n任务名：{r['task_name']}\n行业：{r['industry_domain']}\n"
                    f"文件：{f}\n正文：{r['desc'][:1800]}\n要求：{r['reqs'][:600]}")
    prompts.append("下面是若干条任务的原始任务书。请给每条写三段：输入数据从哪来、具体是什么、"
                   "拿它干什么。写给一个要判断「这批数据原本长在什么网站上」的人看，"
                   "所以要具体、要形象。\n\n## 待摘要的 %d 条\n\n%s\n\n## 输出\n\n%s"
                   % (len(chunk), '\n\n'.join(body), RULES))

print(f'{len(prompts)} 批 × 每批约 {sum(len(p) for p in prompts)//len(prompts)} 字符')
got = llm.by_id(llm.ask('summary', 'A', prompts))

out, miss = {}, []
for j, c in enumerate(ids):
    v = got.get(j)
    if isinstance(v, dict) and v.get('data'):
        out[c] = dict(src=str(v.get('src') or ''), data=str(v['data']),
                      job=str(v.get('job') or ''))
    else:
        miss.append(c)
json.dump(out, open('summary.json', 'w'), ensure_ascii=False, indent=1)
print(f'\n═══ {len(out)} 条有摘要，{len(miss)} 条缺失 ═══')
n = [len(v['data']) for v in out.values()]
print(f'  data 长度 中位 {sorted(n)[len(n)//2]} 字，最短 {min(n)}，最长 {max(n)}')
for c in list(out)[:4]:
    v = out[c]
    print(f"\n  {byid[c]['task_name'][:30]}\n    来源：{v['src']}\n    数据：{v['data']}\n    干什么：{v['job']}")
