import json, os
fam = json.load(open('families.json'))
famlist = '\n'.join(f"- {f['family']} | {f['family_cn']} | {f['ui_skeleton']}" for f in fam)
HEAD = f"""把每个"数据来源"归入下面的站点家族之一。
判断标准：**这个来源的界面骨架，能不能用该家族的骨架承载**（导航/列表/详情/筛选/导出形态是否同构），不是学科是否相同。

家族清单（只能从中选择，逐字使用 slug）：
{famlist}

输入每行是：序号 <TAB> 产品名 <TAB> 品类slug。
对每行输出 {{"i": 序号, "family": "家族slug"}}。必须覆盖每一行，一行都不能少。
实在无法归类才用 "family": "other"。

只输出 JSON 数组，无解释，无 markdown 围栏。

"""
lines = open('vocab.tsv').read().split('\n')
os.makedirs('asg', exist_ok=True)
C = 70
for s in range(0, len(lines), C):
    body = '\n'.join(f'{s+j}\t{l.split(chr(9),1)[1]}' for j, l in enumerate(lines[s:s+C]) if chr(9) in l)
    open(f'asg/a{s:05d}.txt','w').write(HEAD + body)
json.dump(lines, open('vocab_lines.json','w'), ensure_ascii=False)
print('chunks', len(os.listdir('asg')), 'lines', len(lines))
