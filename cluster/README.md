# cluster —— 给 1299 条任务判定「数据出自哪一类软件」

一个环境服务一条任务太贵。要复用，就得先知道哪些任务的输入数据来自同一类界面。
这个目录做的就是这件事：给每条任务贴一个**品类**标签，标签取自一张固定菜单。

不是聚类，是分类。菜单先定死，任务往上贴。

## 为什么不能直接读字段

`software_and_version` 写的是**解题工具链**，不是数据来源 —— 1299 条里 743 个不同取值，
最高频的是 `python3.11.5`(83)、`Python 3.13.5；NumPy…`(60)。文件名同样无用：
出现最多的是 `参考结果.zip`(276)、`输入材料.zip`(259)。

来源这一维度在数据里根本不存在，必须构造出来。

## 菜单

`g2.html` 是 G2 品类页的存档，抽出 **2239 个品类**存进 `g2_categories.json`，
`menu_keep.json` 是剪枝后实际使用的 780 项。

`menu.py` 在这之上手写了 **14 个 `x-` 补充项**，都是 G2 没有对应行的垂直领域：

```
x-motion-capture-biomechanics-lab   动捕与肌骨建模      (OpenSim, Vicon Nexus, Qualisys)
x-test-bench-daq                    台架试验多通道采集   (NI DIAdem, Dewesoft X, HBM catman)
x-process-historian                 工厂时序位号历史库   (AVEVA PI System, Ignition)
x-seismic-waveform-data-center      台站波形与事件目录   (IRIS/FDSN, SeisComP)
x-research-dataset-repository       公开数据集下载页     (UCI, Zenodo, Kaggle Datasets)
…共 14 项，见 menu.py 的 SUPPLEMENT
```

易混的两两之间写了显式辨析（"注意与 SCADA 区分"），因为模型最容易在这种地方滑走。
最终菜单 `menu.txt` 共 2253 行。

## 两层，按顺序

### 第一层：规则 + 角色判定（`src/`）

`src/mk.py` 用产品名词表和 URL 正则扫任务原文，扫出 **410 条**带候选名字的任务。

但名字出现 ≠ 名字是来源。同一个名字可能是五种角色之一，所以不直接采信，
交给模型判断（`src/run.py` 驱动）：

| 角色 | 条数 | 例子 |
|---|---:|---|
| `出处` | **288** | "附件为从 BLS 导出"、"使用冻结的 eCFR XML 快照" |
| `解题工具` | 91 | "不得重跑 LAMMPS"、"若无 VASP 则跳过" |
| `无关` | 14 | 任务自造的项目名 |
| `数据里的值` | 9 | 数据是招聘岗位表，文中的 RenderDoc 是岗位要求里的技能 |
| `产出物` | 8 | "生成 Neuroglancer 状态文件" |

288 条**原文点名**的直接钉死，不进第二层。
其余 122 条写进 `poison.json` —— 这些名字会把分类器带偏，它们所属任务的 prompt 里
会注入一条警告说明该名字不是来源。

否定句是最典型的陷阱：「不需要运行 VASP 能量计算」里的 VASP 是明确不用的解题工具。

### 第二层：菜单投票（`final/`）

剩下 **1011 条**走 `final/mk.py` 生成的 prompt。每条要两个独立判断：

- `slug` —— 逐字取自菜单，任何情况都要给一个，多个说得通时选最具体的
- `source_real` —— 这份数据到底有没有真实出身，还是为出题现编的

跑法是 A/B 两轮 + 定向第三轮：`final/third.py` 找出 A、B 不一致或缺失的批次，
只有这些批次跑 C。最终 `final/vote.py` 取多数。

```
3/3 全同  530      2/3  301      2/2  132      1/3（三轮各说各话）  48
```

## 结果

`final/assignment_full.csv` + `final_all.json`，1299 条 = 分类 1011 + 原文点名 288，
落在 **217 个品类**上，其中 108 个是单例。

| 品类 | 条数 |
|---|---:|
| x-test-bench-daq | 103 |
| x-research-dataset-repository | 67 |
| x-motion-capture-biomechanics-lab | 37 |
| x-seismic-processing-workstation | 33 |
| x-materials-property-database | 32 |
| x-seismic-waveform-data-center | 27 |
| civil-engineering-design | 27 |
| x-government-statistics-portal | 26 |

`source_real`：yes 1022 / no 188 / unsure 89。那 188 条是模型判定为出题现编的抽象材料，
没有真实界面可照着建。

## 验证：把答案盖住再问一遍

第一层顺带产出了一个**免费的验证集**。288 条原文点名的任务里，有 211 条能映射到
一个可接受的品类集合（`src/truth.py` 的 `TRUTH` 表，多值表示该来源本身跨品类）。

`src/blind.py` 把这 211 条里的软件名和所有 URL 全部替换成 `※`，
让分类器只凭数据形态、领域词汇、字段与单位来判断，看还能不能落到正确品类：

| | 命中真值 | source_real=yes |
|---|---:|---:|
| 第一版 prompt | 89.1% | 75.4% |
| `blind2.py` 修订后 | **93.4%** | 99.5% |

两版之间只改了 `source_real` 的定义 —— 加了一句"**认不出具体产品也照样填 yes**，
现实里绝大多数数据来自没有名气的内部系统，认不出是常态，不是'没有来源'的证据"。
75% → 99.5%，说明改之前模型把"我认不出这是什么产品"当成了"这数据是编的"。

这个数比人工标 50 条硬，而且成本为零。

## 跑一遍

纯 stdlib，不需要 venv。`claude -p` 并发超过 5 会静默返回空。

```bash
python3 extract.py                      # 上游 jsonl → tasks.json（1299 条）

cd v2
python3 menu.py                         # g2_categories.json + SUPPLEMENT → menu.txt
python3 mkprompts_full.py               # → prompts_full/
python3 runfull.py A                    # → fullA/
python3 runfull.py B                    # → fullB/
python3 mkthird.py && python3 runfull.py C third_batches.txt
python3 vote.py                         # → final_labels.json（第一层要用它的产品名建词表）

cd src                                  # 第一层：规则 + 角色
python3 mk.py && python3 run.py         # → p/ → oA/ → roles.json
python3 blind2.py && python3 runb2.py   # → 盲测

cd ..                                   # 第二层：菜单投票
python3 final/mk.py                     # ← 这一步在 v2/ 下跑，→ final/ids.json + final/p/
cd final
python3 run.py                          # → rA/ rB/
python3 third.py && python3 run.py C
python3 vote.py                         # → final_all.json + assignment_full.csv
```

注意 `final/mk.py` 的工作目录是 `v2/`，而同目录下其余脚本的工作目录是 `v2/final/`。

`chain.sh` / `chain2.sh` 是把上面几步串起来的守护脚本（等前一轮跑完、失败重试）。

## 还缺的

- **三处硬编码绝对路径**：`src/mk.py`、`final/mk.py`、`final/vote.py` 里写死了
  `/Users/allenzhang/Desktop/workspace/task_enhancer/cluster/`，换机器要改。
- **三个手工产物没有脚本**：`g2.html` → `g2_categories.json` 的解析、
  `menu_keep.json` 的剪枝、`poison.json` 的整理，都是当时手动做的。
- **`split_result.json` 是一次没留脚本的二次核对**：对最大的 `x-test-bench-daq`
  等品类抽了 111 条重判，100 条维持、11 条改判。想复现得重写。
- **`prov_round1.json` 是早期一轮的遗留**，`src/mk.py` 只拿它扩充正则词表。
  丢了不影响结论，只会让第一层少扫出几条候选。
- **`tasks.json` 没有入库**（11M），`extract.py` 读的上游 jsonl 也不在仓库里。
  clone 下来跑不了全流程，但 `final_all.json` 等结论文件是完整的。

## 早期方法与教训

在 G2 菜单这条路之前试过一轮**聚类**：TF-IDF → SVD → KMeans，以及 LLM 自己归纳的
站点家族分类法，用 LLM 配对陪审（"这两条任务能不能共用一套界面骨架"）来选方法。
那一轮的代码已删，但踩的坑与具体方法无关，值得留着：

1. **轮廓系数会把你带到 k=617**。它衡量"抱得紧"，跟"能不能共用一个网站"没有关系。
   按它选，最优解等于没聚。
2. **陪审必须带随机对照**。随机抽的任务对，陪审也会给 15–32% 的"能"，
   而且每轮的底噪都不一样 —— 所以跨轮的原始通过率不可比，只能比
   `lift = (p − p₀) / (1 − p₀)`。
3. **配对抽样必须按簇大小加权**。先均匀抽一个簇、再在簇内抽一对，会让 4 个任务的
   小簇和 156 个任务的大簇等权，而大簇装着绝大多数任务。这个 bug 让低 k 的
   通过率从 0.54 虚高到 0.81。
4. **单轮 n=80 不够**。同一个划分三轮测出 92%/76%/81%。要区分相邻的粒度，n 至少 150。
5. **LLM 归纳的分类法读起来最漂亮，实测接近随机**（通过率 41.7%，对照 20%）。
   它按**学科语义**归并来源，而决定界面能否复用的是**数据形态** ——
   "SVG 制图 vs 试井曲线诊断"会被归进同一个家族，但界面骨架完全不同。
   这条是转向 G2 品类菜单的直接原因：品类是按**软件形态**切的，不是按学科。
