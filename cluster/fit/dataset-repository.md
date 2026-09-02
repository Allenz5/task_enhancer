# dataset-repository 桶 80 条任务 vs 骨架 `envgen/skeletons/dataset-repository/` 适配判定

判定依据：`skeleton.json`（entities / views / layer2_contract）、`description.md`、`cluster/labeled.csv`（品类 == dataset-repository，80 行）、`cluster/summary.json`。没有任务输入文件，全部从描述推断。原则：数据塞不进真实界面就留文件（`disposition: file`），不为任务改骨架。

## 1. 骨架槽位（5 行）

- **dataset**（custom_ok=true）：ID/Name/slug/Abstract/Area/Task/Types/FeatureTypes/NumInstances/NumFeatures/DateDonated/NumHits/DOI 必留；另有 keywords、descriptive（"实例代表什么 / Additional Information / 有无缺失值"）、variableInfo、introPaper、href（下载）、pythonSnippet、totalCompressedSize、YearCreated。
- **variable**（不可加字段）：name/role/type/demographic/description/units/missingValues，按 datasetID 挂在详情页 Variables Table。
- **file**（不可加字段）：path/size/isDirectory，详情页 Dataset Files 表 + 侧栏 DOWNLOAD(总大小)。
- **paper / creator / evaluation**（不可加字段）：引用论文列表（title/authors/venue/year/DOI/URL）、创建者（姓名/机构/邮箱）、基线模型指标（model/metricName/metric/上下界）。
- 两个页面：列表（搜索名字、Keywords/Attributes/Data Type/Subject Area/Task/#Instances/#Features/Feature Type/Python 过滤、排序、分页）+ 详情（元数据、变量表、文件、论文、引用格式、Python 导入片段、License 固定 CC BY 4.0）。**明确不可映射**：数据集行、预览、图表、账号、投稿表单；禁止新页面/新过滤字段/导出。

## 2. 逐任务判定

说明：本桶 58 条是"从仓库下载基准数据集 → 修配置 → 训练/分析"。**数据集的行（train/test CSV、npy、jsonl）永远不进 GUI**，GUI 只承担发现 + 元数据 + 下载链接；"部分 fit（强）"指任务的 job 确实需要读站上元数据（变量角色/描述、Additional Information 里的泄漏提示、缺失值标记、文件清单），"部分 fit（弱）"指 job 只需要拿到文件、GUI 只是真实的取数入口。

| 序号 | 任务名（≤30字） | 判定 | 进 GUI 的部分 | 留文件的部分 / 原因 |
|---|---|---|---|---|
| 1 | USDA Foundation Foods 营养素跨版本对账 | 不 fit | — | FDC 是食品成分参考库，不是数据集目录；两版 CSV 快照按 NDB 编号对账，无实体承载。误标 |
| 2 | Zenodo/DataCite/SWH 科研软件发布谱系审计 | 部分 fit | Astropy 各版本 = dataset 记录（Name/DOI/DateDonated/YearCreated/creator），自定义字段 conceptDOI/version | DataCite JSON、Software Heritage 快照/SWHID 留文件；版本间关系无实体 |
| 3 | 电力系统稳定性预测管道 | 部分 fit（强） | Electrical Grid Stability 记录、variable 表（tau/p/g 角色与描述，泄漏字段 stab 的 role）、file(train/test.csv) | CSV 行、config |
| 4 | MNIST 手写数字识别管道 | 部分 fit（弱） | MNIST 记录（Types=Image、NumInstances、creator LeCun/Cortes、paper）、file | 像素矩阵；job 只需文件 |
| 5 | 森林覆盖类型预测管道 | 部分 fit（强） | Covertype(ID 31) 记录、54 个特征的 variable 表（type 区分 one-hot 土壤/荒野列）、file | CSV 行、配置 |
| 6 | 银行营销订阅预测管道 | 部分 fit（强） | Bank Marketing(222) 记录、descriptive 里 "duration 应剔除" 的说明、variable 表、introPaper(Moro 2014)、file | CSV 行、配置 |
| 7 | 德国逐小时电力负荷预测管道 | 部分 fit（弱） | OPSD time_series 数据包 = dataset（Types=Time-Series、DOI、版本、file 清单） | 负荷序列；OPSD 是数据包平台，勉强仓库形 |
| 8 | Fashion-MNIST 服装图像分类管道 | 部分 fit（弱） | Fashion-MNIST 记录（Image、10 类名写进 descriptive）、paper、file | 像素矩阵 |
| 9 | 实测 MT/AMT EDI 质控与一维反演 | 不 fit | — | USGS Data Series 是地球物理数据发布页，任务是反演计算；EDI 文件只能当 file 挂着，GUI 无意义。误标 |
| 10 | 超导临界温度回归预测管道 | 部分 fit（强） | Superconductivity 记录、81 个特征 variable 表、introPaper(Hamidieh 2018)、file | CSV 行 |
| 11 | GNSS 速度场质控与应变率反演 | 不 fit | — | MIDAS 是大地测量产品，不是数据集目录；任务是地学计算。误标 |
| 12 | 人类活动识别(HAR)分类管道 | 部分 fit（强） | HAR(240) 记录、561 维特征说明放 variableInfo、creator(Anguita 等)、file | CSV 行；配置只取 10 个特征需从站上确认全部 561 |
| 13 | 北京 PM2.5 浓度回归预测管道 | 部分 fit（强） | Beijing PM2.5(381) 记录、variable 表（cbwd 为 Categorical、单位）、introPaper(Liang)、file | CSV 行 |
| 14 | 航磁测线交叉点平差与调平 | 不 fit | — | 航磁原始 xyz，匿名化后的单文件几何计算；无仓库页面。误标 |
| 15 | Adult Census 表格数据质量审计 | 部分 fit（强） | Adult(2) 记录、variable 表（missingValues=yes 于 workclass/occupation/native-country、type/描述）、descriptive、file | adult.csv 行、校验规则配置；"字段说明文档" 即变量表 |
| 16 | Fashion-MNIST 衣物图像十分类 | 部分 fit（弱） | 同 #8 | 像素矩阵 |
| 17 | 加州房价回归预测 | 部分 fit（弱） | California Housing 记录（StatLib 出处写 Abstract）、9 个变量表（ocean_proximity 为 Categorical）、file | CSV 行 |
| 18 | MNIST 数字无监督聚类 | 部分 fit（弱） | OpenML mnist_784 记录、file | 像素矩阵；无监督任务不读元数据 |
| 19 | AG News 新闻主题建模 | 部分 fit（弱） | AG News 记录（Text、paper Zhang 2015、4 类写 descriptive）、file | 文本行 |
| 20 | 基于 Cora 的引文网络链接预测 | 部分 fit（弱） | Cora 记录（Types=Other/图、NumInstances=2708、paper）、file(nodes/edges) | 图数据；拓扑特征计算 |
| 21 | NASA C-MAPSS 涡扇发动机 RUL 预测 | 部分 fit（弱） | C-MAPSS FD001 记录、26 列 variable 表（工况 3 + 传感器 21）、file | 时序文件 |
| 22 | 共享单车逐时需求回归预测 | 部分 fit（强） | Bike Sharing(275) 记录、variable 表（temp/atemp 归一化说明、单位）、file(hour.csv/day.csv) | CSV 行 |
| 23 | 滚动轴承振动故障诊断 | 部分 fit（弱） | CWRU 记录（Sequential、12kHz 写 descriptive）、file | npy 信号矩阵；特征提取与 GUI 无关 |
| 24 | 塞浦路斯逐小时电力负荷预测管道 | 部分 fit（弱） | 同 #7 | 负荷序列 |
| 25 | 意大利逐小时电力负荷预测管道 | 部分 fit（弱） | 同 #7 | 负荷序列 |
| 26 | Metro 州际公路交通量递归多步预测 | 部分 fit（强） | Metro Interstate Traffic(492) 记录、variable 表（holiday/weather_main 等分类字段、单位）、file | CSV 行；脏值清洗靠数据不靠站 |
| 27 | 工业泵阀信号故障类型分类管道 | 部分 fit（弱） | SKAB 记录（8 路传感器 variable 表、GitHub 出处）、file | 窗口切片表 |
| 28 | 社交图链路预测 | 部分 fit（弱） | SNAP Twitch Gamers 记录（paper、NumInstances、node_features 变量）、file | 边表；诱导子图是任务自造 |
| 29 | FORGE 16A(78)-32 微震三维集成图件 | 部分 fit（弱） | GDR 数据集记录（DOI、creator、多文件 file 清单：井轨迹工作簿/目录/DFN/速度模型） | 全部数据体；图件规格 json；job 是三维可视化 |
| 30 | FORGE 78B-32 井 FMI 裂缝组系联合解释 | 部分 fit（弱） | GDR 记录、file(LAS/CSV/PDF) | LAS 曲线、PUBLIC_CONTRACT.md；测井解释与 GUI 无关 |
| 31 | Buchwald-Hartwig 反应条件可复算审计 | 不 fit | — | 原文未点名平台，单个 experiment_results.csv 的统计画像；GUI 只剩一个下载按钮 |
| 32 | D9 整数评分卡时间外泛化复验 | 不 fit | — | 内部信贷评分台账，不是公开数据集。误标 |
| 33 | 零售客户复购预测管道 | 部分 fit（强） | Online Retail(352) 记录、8 个变量表（InvoiceNo/StockCode 描述、Categorical/ID 角色）、file | 36 万条交易、复购标签、待预测名单 |
| 34 | CWRU 轴承故障诊断·跨工况泛化 | 部分 fit（弱） | 同 #23；负载 0/1/2/3hp 文件划分可作 file 清单 | 信号窗口 |
| 35 | 整数链复形同调群与 Smith 标准形审计 | 不 fit | — | "合作研究组导出"的 36 个 .mtx，Matrix Market 只是格式；纯精确计算。误标 |
| 36 | 连接组数据生成 Neuroglancer 状态文件 | 不 fit | — | FlyWire 神经元记录 + 可视化模板，无数据集目录语义。误标 |
| 37 | NYC Yellow Taxi 2023-01 数据工程管道 | 不 fit | — | TLC 行程 Parquet + 天气联接，源是政府开放数据门户。误标 |
| 38 | PyPI 与 OSV 发布物漏洞区间审计 | 不 fit | — | 包索引/漏洞库 JSON，不是数据集。误标 |
| 39 | 工业泵阀多变量时序异常检测管道 | 部分 fit（弱） | 同 #27 | 46806 行时序 |
| 40 | ICS 多变量异常检测 + 根因定位 | 不 fit | — | HAI 是 GitHub 发布的 ICS 数据集，但输入是滑窗 npy + 通道→工艺映射 json；元数据无用，GUI 只剩下载。另一票 process-historian 更贴 |
| 41 | 克罗地亚逐小时电力负荷预测管道 | 部分 fit（弱） | 同 #7 | 负荷序列 |
| 42 | Unicode 15.1→16.0 标识符安全迁移审计 | 不 fit | — | UCD 是标准文本文件目录，不是数据集仓库。误标 |
| 43 | PVDAQ 光伏数据源尽调与样本库构建 | 部分 fit | 每个 PV system = 一条 dataset 记录（Name=system_id、NumInstances=记录数、totalCompressedSize=文件大小、DateDonated/年限），装机/倾角/方位/跟踪/qa_status 作 custom 字段在详情页显示 | 硬条件筛选与可比性评分留脚本：骨架禁止按 custom 字段过滤/排序，列表页只能按 #Instances 等已有控件筛 |
| 44 | 钢铁表面缺陷检测与质量评估 | 不 fit | — | Kaggle Severstal 是仓库，但任务是 3 张图的像素级 RLE 标注，GUI 不承载图像与标注 |
| 45 | OTTO 电商会话 next-click 推荐 | 部分 fit（弱） | OTTO recsys 记录（Sequential、GitHub/Kaggle 出处、事件类型写 descriptive）、file(jsonl) | 会话日志 94MB、共现配置 |
| 46 | Adult Census 表格数据质量审计 | 部分 fit（强） | 同 #15；"字段字典" 即 variable 表 | CSV、18 条规则配置 |
| 47 | 电商会话级 Top-K 召回管道 | 部分 fit（弱） | 同 #45 | 会话 CSV |
| 48 | 银行定期存款订阅预测管道 | 部分 fit（强） | 同 #6 | CSV、配置 |
| 49 | FD001 涡扇发动机 RUL 预测管道 | 部分 fit（弱） | 同 #21（data.nasa.gov 出处） | 空格分隔时序 |
| 50 | AG News 新闻主题文本分类管道 | 部分 fit（弱） | 同 #19（HuggingFace 出处） | 12 万条文本 |
| 51 | 20 Newsgroups 多类文本分类管道 | 部分 fit（弱） | 20 Newsgroups 记录（figshare、bydate 划分写 descriptive、20 类）、file | 帖子文本 |
| 52 | 网络入侵检测处理管道 | 部分 fit（弱） | UNSW-NB15 记录、42 个流量特征 variable 表、paper(Moustafa)、file | CSV 行 |
| 53 | 人体活动识别管道 | 部分 fit（强） | 同 #12 | CSV |
| 54 | 手写符号聚类管道 | 部分 fit（弱） | Pen-Based Digits(81) 记录、16 维 variable、file | 无标签样本；k 值来自任务 |
| 55 | 钢带表面缺陷分类管道 | 部分 fit（强） | Steel Plates Faults(198) 记录、27 特征 + 7 类标签的 variable 表（多列 one-hot 标签需从描述读出）、file | CSV |
| 56 | 混凝土抗压强度回归预测 | 部分 fit（强） | Concrete(165) 记录、8 变量 + 单位(kg/m³, day)、creator(Yeh)、introPaper、file | CSV |
| 57 | 家电能耗概率区间预测 | 部分 fit（强） | Appliances Energy(374) 记录、变量表（房间温湿度、rv1/rv2 随机变量说明）、file | CSV；分位数回归与 GUI 无关 |
| 58 | 法国逐小时电力负荷预测管道 | 部分 fit（弱） | 同 #7 | 负荷序列 |
| 59 | FMI 成像测井裂缝密度与高裂缝带识别 | 部分 fit（弱） | 同 #30 | LAS 3.0、参考图件 |
| 60 | 药物相互作用图链接预测管道 | 部分 fit（弱） | tigerlily DDI 记录（DrugBank/Entrez 出处、二部图规模）、file | 81.6 万条边、配置 |
| 61 | 葡萄酒品质序数回归 | 部分 fit（强） | Wine Quality(186) 记录、11 理化变量 + quality(0-10) 的 variable 表、file(red/white)、introPaper(Cortez) | CSV |
| 62 | 交通流量递归多步分位数预测 | 部分 fit（强） | 同 #26 | CSV、配置 |
| 63 | 酵母基因功能多标签分类 | 部分 fit（弱） | Yeast 多标签基准记录（103 特征 / 14 标签写 descriptive）、file | 表达谱；UCI 的 Yeast(110) 是单标签版，多标签版在 Mulan，元数据要另写 |
| 64 | 乳腺癌生存风险预测 | 不 fit | — | GBSG2 是临床研究队列（R 包分发），任务是生存分析；无仓库页面语义。建议 clinical-trial-edc |
| 65 | 小鼠皮层蛋白质组学基因型分类 | 部分 fit（强） | Mice Protein Expression(342) 记录、77 蛋白变量表、descriptive 里 "同鼠重复 15 次 / MouseID 结构" 说明、introPaper(Higuera 2015)、file | train/test、隐藏标签 |
| 66 | SRU 硫磺回收装置尾气浓度软测量 | 部分 fit（弱） | SRU 记录（DaISy、u1-u5/y1-y2 变量表、paper Fortuna 2007）、file | 时序；walk-forward 与 GUI 无关 |
| 67 | Metro 州际公路交通流量预测 | 部分 fit（强） | 同 #26 | CSV、配置 |
| 68 | SKAB 预测-残差时间戳级异常检测 | 部分 fit（弱） | 同 #27 | 时序 |
| 69 | 钢板表面缺陷 7 分类 | 部分 fit（强） | 同 #55（OpenML 40982 可写进 Abstract） | CSV |
| 70 | 可穿戴 IoT 人体活动识别 6 分类 | 部分 fit（强） | 同 #12 | CSV |
| 71 | MTA 地铁 GTFS 服务日/班次/几何审计 | 不 fit | — | 运营方 GTFS 快照，不是数据集目录。误标 |
| 72 | 番茄多环境试验品种稳定性复核 | 不 fit | — | 未点名来源，270 条汇总表的 AMMI 分析；GUI 只剩下载 |
| 73 | Buchwald-Hartwig 反应条件可复算审计 | 不 fit | — | 同 #31（Figshare/Kaggle 仅泛指） |
| 74 | O*NET 学徒制职业阶梯与 OOH 对账 | 不 fit | — | 职业数据库 + 对照表，不是数据集仓库。误标 |
| 75 | NGA / Wikidata 藏品构成者权威调和 | 不 fit | — | 博物馆藏品人物权威记录与 Wikidata 调和。误标 |
| 76 | MTA GTFS 路线-班次-站点-线形拓扑审计 | 不 fit | — | 同 #71 |
| 77 | SSURGO Sonoma 土壤地基解译审计 | 不 fit | — | 土壤调查数据库多表重算，图斑/构件/土层无实体。误标（人工改判自 lims） |
| 78 | CNEOS 与 NEOCC 近地天体撞击风险联合审计 | 不 fit | — | 两机构风险名单逐天体对照，不是数据集目录。误标 |
| 79 | 半导体制程良率异常筛查(SECOM) | 部分 fit（强） | SECOM(179) 记录、descriptive（590 匿名特征、缺失值、时间戳、PASS/FAIL 不平衡）、file(secom.data/secom_labels.data) | 数据矩阵、特征筛选与建模 |
| 80 | 匿名钻孔多元素化探迁移复核 | 部分 fit（弱） | GeoMet Zenodo 记录（DOI、creator、drillholes.csv 的 22 列变量表、file） | 化验记录本身、复核范围表；job 是地质 QC，另一票 lims 也说得通 |

## 3. 计数

- **全 fit：0**。没有一条任务的核心记录本身就是"数据集目录"且 job 靠浏览完成——即便 #43（系统清单）和 #2（版本/DOI 清单）最接近，筛选与对账仍要在文件里做。
- **部分 fit：58**（其中"强"——job 确实要读站上变量表/Additional Information/缺失值/文件清单——25 条：#3 5 6 10 12 13 15 22 26 33 46 48 53 55 56 57 61 62 65 67 69 70 79 及 #2 #43；"弱"——只需下载链接——33 条）。
- **不 fit：22**（#1 9 11 14 31 32 35 36 37 38 40 42 44 64 71 72 73 74 75 76 77 78）。

## 4. 误标任务与建议桶

| 序号 | 点名来源 | 建议桶 |
|---|---|---|
| 1 | USDA FoodData Central | gov-statistics-portal（参考数据库，按条目/营养素浏览） |
| 9 | USGS Data Series 901（EDI） | seismic-datacenter 或 geospatial-portal |
| 11 | UNR MIDAS GNSS 速度产品 | seismic-datacenter |
| 14 | Comstock 航磁测线库 | geospatial-portal |
| 32 | 信贷评分卡模型风险平台 | ml-experiment-tracking（模型评估台账） |
| 36 | FlyWire 连接组 | omics-repository（另一票已投） |
| 37 | NYC TLC Trip Record | gov-statistics-portal（另一票已投） |
| 38 | PyPI / OSV | code-hosting（另一票已投） |
| 40 | HAI Security Dataset | process-historian（另一票已投） |
| 42 | Unicode UCD | law-standard-library（另一票已投） |
| 64 | GBSG2 临床队列 | clinical-trial-edc |
| 71 / 76 | MTA NYCT GTFS | gov-statistics-portal（无交通时刻表桶，最近似） |
| 74 | O*NET / RAPIDS / BLS OOH | salary-benchmark 或 job-board（职业分类层级） |
| 75 | NGA Open Data / Wikidata | document-library（藏品/权威记录，现有桶里最近） |
| 77 | USDA Soil Data Access SSURGO | geospatial-portal |
| 78 | NASA CNEOS Sentry / ESA NEOCC | regulatory-registry（风险名录逐条对照）或 gov-statistics-portal |
| 31 / 73 / 72 / 35 | 未点名 / 仅格式名 | 无仓库来源，不建议改桶，标 `disposition: file` |

## 5. 建议

- **下载/文件视图是这桶的主承载**：58 条部分 fit 里每一条都要 file 表 + 侧栏 DOWNLOAD；任务给的 train/test/config 文件名直接作 `file.path`，大小按描述估。这是 GUI 与任务文件系统唯一的硬连接，建库时务必让 `href` 指向任务真实落盘路径。
- **变量表是"强"fit 的关键**：25 条任务的配置修复（泄漏字段、类别编码、缺失值 "?"、单位、one-hot 标签列）都能从 `variable.role/type/description/missingValues` 读出，Adult(#15/#46)、Bank(#6/#48)、Metro、SECOM、Mice 尤其如此。造数时把任务描述里的字段说明搬进 variable 表，而不是只写 Abstract。
- **custom_ok 上常用的自定义字段**：`version`/`conceptDOI`（#2）、`license`（MNIST CC-BY-SA、GitHub 数据集的 MIT 等——骨架 License 固定 CC BY 4.0，需要不同许可证时用 custom 字段并在详情页展示，不改固定文案）、`sourceURL`/`mirror`（sklearn/OpenML/HF 镜像出处）、`trainTestSplit` 说明、PV system 的装机/倾角/qa_status（#43）。这些只能显示，**不能作过滤/排序控件**——#43 的硬条件筛选因此必须留脚本。
- **非 UCI 来源照样能进**：骨架是"公共 ML 数据集目录"而非 UCI 专属，Fashion-MNIST、AG News、C-MAPSS、SKAB、OTTO、UNSW-NB15 造一条记录并不违背真实性（UCI 本就收录大量此类基准）；但 Area/Task/Types 要按骨架词表填（Image/Text/Sequential/Time-Series/Other），别为 Cora 的"图"或 FORGE 的"测井"发明新类型。
- **弱 fit 的 33 条要接受 GUI 只是取数入口**：任务本体在数据矩阵与训练脚本里，GUI 增量仅是"agent 先在站上确认数据集名/规模/文件再下载"。如果评测只看 predictions.csv，这些任务不需要 GUI 也能完成——决定要不要装配 GUI 时按此权衡，不要为了凑覆盖率把 npy/jsonl 的内容摘要塞进 descriptive。
- 22 条不 fit 里 16 条应改桶（见第 4 节），其余 6 条（#31 #35 #44 #72 #73 及 #40 若不改桶）没有仓库页面语义，按记忆规则直接 `disposition: file`。
