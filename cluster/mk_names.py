import json, numpy as np, collections
import scipy.sparse as sp
from sklearn.feature_extraction.text import TfidfVectorizer
rows=json.load(open('tasks.json')); prov={int(k):v for k,v in json.load(open('prov.json')).items()}
lab=np.load('labels_lowk.npz')['k30']
famlab=np.load('labels_m11.npz')['M11_llm_taxonomy']
fn={int(k):v for k,v in json.load(open('_m11_names.json')).items()}
blocks=[]
for c in sorted(set(lab.tolist())):
    idx=[i for i,v in enumerate(lab) if v==c]
    prods=collections.Counter(prov[i].get('product','?') for i in idx).most_common(6)
    fams=collections.Counter(fn[int(famlab[i])] for i in idx).most_common(3)
    names=[rows[i]['task_name'] for i in idx[:10]]
    blocks.append(f"### CLUSTER {c} (n={len(idx)})\n"
                  f"top_products: {', '.join(f'{p}×{n}' for p,n in prods)}\n"
                  f"top_families: {', '.join(f'{p}×{n}' for p,n in fams)}\n"
                  f"tasks: {' | '.join(n[:40] for n in names)}\n")
HEAD = """下面是 30 个任务簇。每个簇要在一张散点图上标一个 label。

给每个簇起一个**关键词**：2-6 个汉字，一眼能看出这簇任务的数据来自什么系统/什么界面。
要能互相区分——有几个簇同属生物力学、同属 CAD、同属表格，必须用不同的词把它们区分开
（比如按数据形态：动捕试次 / 肌骨仿真 / 无标记视频）。

每个簇输出：{"cluster": 编号, "label": "关键词", "en": "english-slug"}
只输出 JSON 数组，无解释，无 markdown 围栏。

"""
open('names_prompt.txt','w').write(HEAD + '\n'.join(blocks))
print('chars', len(HEAD)+sum(len(b) for b in blocks))
