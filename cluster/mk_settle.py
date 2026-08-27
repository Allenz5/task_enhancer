import json,os,sys
tasks=json.load(open('tasks.json'))
HEAD="""你在做**摘录**，不是推断。目标：把"已经能直接定案的任务"挑出来，其余一律放过。

对每个任务判一个 verdict：

**`stated`** —— 任务原文**明确说出了输入数据的出处**（某个网站、数据库、软件、平台）。
  必须能引用到原句。例如"从 IRIS 数据中心下载的波形"、"Materials Project 导出的结构文件"、"OpenSim 模型与动作捕捉数据"。
  ⚠️ 不算数的三种提及：
   - **解题工具**："请用 Python/Excel/AutoCAD 完成" —— 这是让你拿什么干活，不是数据从哪来
   - **引用的规范标准**："依据 GB50017 钢结构规范" —— 这是依据不是数据源
   - **交付目标**："做一个类似 Jira 的看板" —— 这是要做成什么样，不是数据从哪来

**`no-source`** —— 输入材料**不是任何系统运行产生的记录或导出**，而是**人为了描述需求而写出来的规格**。
  典型：任务书、需求说明、评分标准 rubric、接口契约、待实现的脚手架代码、自己编的示例数据。
  交付物通常是"从零写一个程序/客户端/库/文档"。
  同样必须能引用到原句佐证。

  ⚠️ **最容易搞错的一点**：任务几乎都会写"禁止联网""只能使用 input/ 内文件""数据已脱敏离线打包"——
  这些是**评测约束**，是为了让评分可复现才把数据打包带走的。
  **数据被打包 ≠ 数据没有出处。** 一份订单流水、一份贸易统计、一份热力学数据、一份卫星影像，
  哪怕被塞进 zip 且禁止联网，它在现实里依然出自某个系统。这种一律**不算** no-source。

  真正的 no-source 是：这份输入压根不是任何东西的记录。比如"设计一套卡牌游戏通行证系统"给的是
  游戏背景和数值约束，"写一个五子棋客户端"给的是规则说明——这些是人凭空写的需求，不是谁导出来的。

**`unclear`** —— 以上都不成立，或者你需要靠推断才能得出结论。**拿不准一律选这个**，放过比误判重要得多。

输出 {"r":[{"id":<任务号>, "verdict":"stated|no-source|unclear", "source":"<verdict=stated 时填出处名，否则填 ->", "quote":"<原文片段，逐字照抄，20-60字；unclear 时填 ->"}, ...]}，覆盖全部输入任务。
只输出 JSON，无解释，无 markdown 围栏。

"""
def ev(i):
    t=tasks[i]
    inp=[f for f in t['files'] if f['cat']=='input_materials']
    inpstr=', '.join('{}({}KB)'.format(f['name'],(f['sz'] or 0)//1024) for f in inp[:8])
    return (f"### 任务 {i}\n名称: {t['task_name']}\n行业领域: {t['industry_domain']}\n"
            f"输入文件: {inpstr or '（无）'}\n"
            f"任务描述: {(t['desc'] or '')[:900]}\n"
            f"具体要求: {(t['reqs'] or '')[:700]}\n")
n=int(sys.argv[1]) if len(sys.argv)>1 else len(tasks)
D=sys.argv[2] if len(sys.argv)>2 else 'settle'
os.makedirs(D,exist_ok=True)
B=8
for b in range(0,n,B):
    open(f'{D}/t{b//B:04d}.txt','w').write(HEAD+'\n'.join(ev(i) for i in range(b,min(b+B,n))))
print(f"{n} 任务 -> {len(os.listdir(D))} 批")
