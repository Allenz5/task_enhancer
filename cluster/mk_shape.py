import json,os,sys
tasks=json.load(open('tasks.json'))
HEAD="""你在为一件事做准备：把一批命令行任务改造成网页任务。为此需要先搞清楚，**每个任务的输入数据在现实里住在哪个网站/软件的界面上**。

判据只有一个 —— 两个任务如果能共用同一套界面骨架（同样的导航、同样的列表/详情形态、同样的筛选器、同样的导出方式）来承载各自的输入数据，它们就该归到同一个来源。**不要按学科或研究领域判断。**

对每个任务，先描述数据本身，再判断来源：

- `entities`: 这份输入数据里的主要实体是什么（2-4 个词，如 "运行批次/通道/采样点"、"晶体结构/弹性张量"、"订单/支付/退款"）
- `fields`: 你从文件名和描述里能推断出的关键字段或列（3-6 个，不确定就少写）
- `shape`: 数据的组织形态，从这几个里选一个：`表格行集` / `时间序列` / `文件归档` / `层级结构` / `文档文本` / `图像或几何` / `事件流` / `配置规格`
- `ops`: 用户会在界面上对这份数据做什么（2-4 个动词短语，如 "按台站和时间窗筛选、批量下载"）
- `surface`: 承载它的页面形态，用简短中文短语（如 "检索结果表→记录详情页"、"测点树→趋势图"、"目录树→文件清单"）
- `source_kind`: 二选一 ——
    `external` = 这份数据在现实中确实由某个现存的网站/软件产出并展示
    `none` = 这个任务不消费任何外部数据源，它要的是从零交付一个程序/客户端/库，或者输入只是一份自造的规格说明
- `source`: 若 `external`，写最贴切的**真实产品名**（如 OpenSim、Materials Project、GitLab）；**说不准就写品类**（如 "地震波形数据中心"）；**真的不知道就写 unknown，不要硬猜品牌**。若 `source_kind` 是 `none`，此项写 "-"。
- `conf`: 0.0-1.0

注意：只看 `input_materials` 那些文件，`reference_output` 是参考答案不是输入。

输出 {"r":[{"id":<任务号>, ...}, ...]}，覆盖全部输入任务。只输出 JSON，无解释，无 markdown 围栏。

"""
def ev(i):
    t=tasks[i]
    inp=[f for f in t['files'] if f['cat']=='input_materials']
    oth=[f for f in t['files'] if f['cat']!='input_materials']
    inpstr=', '.join('{}({}KB)'.format(f['name'], (f['sz'] or 0)//1024) for f in inp[:6])
    return (f"### 任务 {i}\n名称: {t['task_name']}\n行业领域: {t['industry_domain']}\n"
            
            f"输入文件: {inpstr or '（无）'}\n"
            f"其他文件: {', '.join(f['name'] for f in oth[:3])}\n"
            f"任务描述: {(t['desc'] or '')[:700]}\n"
            f"具体要求: {(t['reqs'] or '')[:600]}\n")
ids=list(range(len(tasks))) if len(sys.argv)<2 else list(range(int(sys.argv[1])))
D=sys.argv[2] if len(sys.argv)>2 else 'shape'
os.makedirs(D,exist_ok=True)
B=8
for b in range(0,len(ids),B):
    open(f'{D}/s{b//B:04d}.txt','w').write(HEAD+'\n'.join(ev(i) for i in ids[b:b+B]))
print(f"{len(ids)} 任务 -> {len(os.listdir(D))} 批, 单批 {len(open(f'{D}/s0000.txt').read())} 字节")
