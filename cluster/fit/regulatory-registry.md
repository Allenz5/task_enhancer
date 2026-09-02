# regulatory-registry 骨架 × 30 条任务 适配判定

判定依据：`envgen/skeletons/regulatory-registry/skeleton.json`（Orange Book 克隆）。字段名就是 products.txt / patent.txt / exclusivity.txt 的真实列头；骨架里**没有任何 custom_ok / 列名改写机制**（只有专利表格页的措辞覆盖），`layer2_contract.forbidden` 明确禁止新页面、新字段、计算列、Type 三选框和检索词之外的服务端筛选。所以「把 CVE / 召回 / 银行 改个标题塞进 Active Ingredient / TE Code」不被合同允许——非药品数据只能判不 fit。没有输入文件，全部按描述推断。

## 1. 骨架槽位（5 行）

1. **product**：一行 = 申请号 × 产品号（一个规格）。Ingredient / Trade_Name / DF;Route / Strength / Appl_Type(N/A) / Appl_No / Product_No / TE_Code / Approval_Date / RLD / RS / Type(RX/OTC/DISCN) / Applicant_Full_Name。
2. **patent**（product 子表）：Patent_No / 到期日 / DS / DP / Use Code / Delist / Submission_Date；**exclusivity**（product 子表）：Exclusivity_Code / Exclusivity_Date。
3. 查找表：use_code、exclusivity_code、applicant（= product 里 Applicant_Full_Name 去重）。
4. 页面：首页四个检索面板（名称/成分/申请号、申请人、剂型、给药途径）+ 专利号检索 → 结果表（RX/OTC/DISCN 三选框、排序、CSV/Excel）→ 申请详情（按产品手风琴）→ 每产品专利 & 独占期两张表；Newly Added / Delisted 专利列表。
5. 合同：只能整体替换六个 store JSON（任务数据与填充数据在申请人 / 申请号上不相交）；禁止任何对账结论、有效/过期、家族、计数等派生列；非产品/专利/独占期/码表的数据（审批函、说明书、Drugs@FDA 提交历史、对账结论）**无落点，不加页面**。

## 2. 逐条判定

| 序号 | 任务名（≤30字） | 判定 | 进 GUI 的部分 | 留文件的部分 / 原因 |
|---|---|---|---|---|
| 1 | 哮喘用药神经精神事件自发报告信号评估 | 不 fit | 无 | FAERS 型不良事件计数表与 400 条逐条报告，没有「注册项目+持有人+状态」形状；失衡测度是分析逻辑。误标。 |
| 2 | SEC Inline XBRL 申报审计与 Company Facts 对账 | 不 fit | 无 | XBRL 事实 / context / 计算链接库是财务申报文件，不是注册记录。误标。 |
| 3 | NVD/CISA 漏洞情报规范化与修复优先级 | 不 fit | 无 | CVE 记录本身是注册形状（ID、发布日、CVSS、CWE、CPE、KEV dateAdded/dueDate），但没有一列能诚实落进「成分/商品名/剂型/TE 码」；合同无列名改写权，且优先级/SLA 是禁止的计算列。桶对，骨架不对。 |
| 4 | FCC ULS 微波路径与 ASR 合规审计 | 不 fit | 无 | 执照 LO/PA/AN/FR 复合键 + 塔坐标 + 大圆距离/方位角计算；主体是几何与对账。误标。 |
| 5 | 美联储 2024 压力测试与资本要求调和 | 不 fit | 无 | 6 份 PDF 监管文件与 CET1/SCB 数值，是财务披露而非注册台账。误标。 |
| 6 | NHTSA 召回活动完成生命周期审计 | 不 fit | 无 | 召回 campaign 有编号、厂商、状态、POTAFF，是注册形状；但 29 列无一对应药品列头，且跨报告期身份转换/完成率是禁止的派生计算。误标（更像执法案件）。 |
| 7 | 美加 2024 消费品召回跨境一致性审计 | 不 fit | 无 | CPSC 嵌套数组（Products/Hazards/Remedies/Injuries）+ Health Canada 记录按 URL 连接；本质是跨库对账。误标。 |
| 8 | USFWS 濒危物种名录与关键栖息地变更核验 | 不 fit | 无 | ECOS 物种 assertion + 50 CFR 名录 + 联邦公报规则生命周期：是「注册项目 + 法律状态 + 日期事件」，最接近骨架的非药品数据，但物种/状态/栖息地无对应列头，且核验多源一致性是禁止的对账逻辑。桶对，骨架不对。 |
| 9 | FAA Part 77 机场障碍物净空筛查 | 不 fit | 无 | NASR 跑道端坐标 + 127 列 DOF 障碍物，任务是构建净空面做几何冲突解析。误标。 |
| 10 | FAA 2608 仪表进近跑道就绪度审计 | 不 fit | 无 | APT/AWOS/FRQ/ILS 快照 + d-TPP XML 程序重建，是设施资产与程序文档。误标。 |
| 11 | financial_report_risk_warning | 不 fit | 无 | Coze 工作流配置 + 财报文本抽取；与注册库无关。误标。 |
| 12 | 受制裁主体交易对手筛查与所有权穿透 | 不 fit | 无 | 合成制裁名单 12 条 + 别名 + 股权登记 + 交易台账，核心是 50% 穿透与别名匹配；制裁条目不是药品列头。误标（同 OFAC，需 SDN 形骨架）。 |
| 13 | EPA GHGRP California 2023 设施排放审计 | 不 fit | 无 | 设施-子部-气体排放量明细 + OOXML 工作簿，是统计数据不是注册台账。误标。 |
| 14 | FDA Orange Book 专利/独占期/TE 跨库监管审计 | 部分 fit | Orange Book 三张表原样进 product / patent / exclusivity；申请号、产品号、成分、剂型、途径、规格、TE 码、专利号、独占期码全部有槽位；agent 用检索 + CSV 导出取数 | Drugs@FDA 六张关系表（提交历史、审批动作、marketing status）按合同 unmappable 留文件；两套快照逐字段对账结论由 agent 离线算，GUI 不预置 |
| 15 | FDA Orange Book 监管组合仓库与 Drugs@FDA 审计 | 部分 fit | 同上：波浪线分隔的 OB 产品/专利/独占期表进 GUI，RLD/RS/TE 码原生支持 | Drugs@FDA 制表符关系表留文件；BLA 类型行 Orange Book 本就不含（骨架 Appl_Type 只有 N/A）；「等价产品族」「保护期时间线」是禁止的家族/派生列，留给 agent |
| 16 | OFAC SDN 多语身份图谱与三格式制裁审计 | 不 fit | 无 | 主体 + 多语名 + 22,491 证件 + 8,930 有向关系，是身份图谱；无药品列头可落，关系连通分量为禁止计算。桶对，骨架不对。 |
| 17 | FDIC/FFIEC 商业地产集中度与机构连续性审计 | 不 fit | 无 | 银行级财务 API 快照 + 并购事件 + QBP 工作簿 + 监管口径文本，核心是指标复算。误标。 |
| 18 | 财政部 2025Q1 国债拍卖生命周期与配售审计 | 不 fit | 无 | 107 份拍卖结果 XML、CUSIP 定价与配售数据，是市场数据。误标。 |
| 19 | 上海绿色建筑标识服务市场与工程师产能研究 | 不 fit | 无 | 51 条标识项目（申报单位、标准、阶段、星级、区、面积）是注册台账形状，但列头全不对应，且任务是产能测算而非查库。桶对，骨架不对。 |
| 20 | FDA Orange Book 申请级专利与独占期完整性审计 | 全 fit | 全部输入（appl_type / appl_no / product_no、专利号+到期日、独占期类型+到期日）就是骨架三张表；申请详情页 → 每产品专利/独占期表正是「按申请-产品粒度核对」的界面 | 无留文件；孤儿关系、截止日仍生效的保护重叠属于禁止计算列，由 agent 从专利号检索 / CSV 导出后自行计算 |
| 21 | NVD 与 CISA KEV 时态与严重度对账审计 | 不 fit | 无 | 100 条 hasKev CVE + KEV 全表按 cve_id 左连接核对日期与 CVSS；任务完全是跨库对账，且无列头可落。桶对，骨架不对。 |
| 22 | 药品短缺与 NDC 供应谱系审计（FDA 2026） | 不 fit | 无 | openFDA 短缺记录 + NDC Directory 包装级条目 + RxNorm 映射：同为 FDA 但 Orange Book 不含 NDC、包装、短缺状态，成分/商品名重叠不足以承载任务；合同禁加字段。桶对，骨架不对。 |
| 23 | FDIC 与 OCC 银行牌照监管边界与身份核验 | 不 fit | 无 | 证书号 + 机构名 + 所在地 + 主监管机构，是最典型的「注册项目 + 属性」，但一列都不能诚实映射到药品列头；跨清单成员对账是任务本体。桶对，骨架不对。 |
| 24 | DOE 与联邦公报 LNG 深水港申请生命周期核验 | 不 fit | 无 | 联邦公报文书 JSON + DOE 出口 Excel + 33 CFR XML，是文书与流量数据。误标。 |
| 25 | A2 研发办公楼二星级绿建送审前预评估 | 不 fit | 无 | 35 项证据包（竣工图、检测报告、能耗台账、自评底稿），是文档证据链。误标。 |
| 26 | 2024 款纯电车型 EPA 道路载荷基准复核 | 不 fit | 无 | Test Car List 610 条试验记录（ETW、Target/Set ABC 系数），任务是物理量复算。误标。 |
| 27 | 长三角研发办公楼绿建二星级申报复核 | 不 fit | 无 | 证据台账 + 评分规则 + 多版本申报配置，是文档审核。误标。 |
| 28 | 厄贝沙坦片上市许可申报前资料核查 | 不 fit | 无 | 虽是骨架示例药，但输入是 M1-M5 申报台账、稳定性明细、BE 报告、说明书——全是合同 unmappable 的审批文件/标签。误标。 |
| 29 | Wikimedia 非营利税务、资助与关联方尽调 | 不 fit | 无 | Form 990、KPMG 审计报表、Schedule I 资助记录；IRS Pub.78 名单虽是注册形状但只是配角。误标。 |
| 30 | NPS 国家历史名录登记事件、状态与空间谱系审计 | 不 fit | 无 | 登记编号 + Listed/Removed/NHL 状态快照 + 事件链 + GIS 多边形；注册形状但列头无对应，空间谱系无落点。桶对，骨架不对。 |

## 3. 计数

- 全 fit：**1**（#20）
- 部分 fit：**2**（#14、#15）
- 不 fit：**27**

## 4. 误标任务与建议桶

- 误标（应移出 regulatory-registry）：
  - #1 → dataset-repository（另一票已如此）
  - #2 → document-library（XBRL 申报文件）
  - #4 → geospatial-portal（执照 + 塔坐标几何）
  - #5 → document-library（监管 PDF + 财务数值）
  - #6、#7 → enforcement-case（召回 = 执法/案件生命周期）
  - #9、#10 → geospatial-portal（另一票 asset-maintenance 也可）
  - #11 → document-library（另一票已如此）
  - #12 → enforcement-case（合规筛查 + 阻断决定）
  - #13、#17、#18 → gov-statistics-portal（排放/银行财务/拍卖统计）
  - #24 → law-standard-library（联邦公报文书 + CFR）
  - #25、#27 → document-library（证据包 / 申报底稿）
  - #26 → dataset-repository（试验数据表）
  - #28 → document-library（M1-M5 申报卷宗）
  - #29 → document-library（990 + 审计报表）
- 桶对但本骨架不服务（保留在 regulatory-registry，等第二骨架）：#3、#8、#16、#19、#21、#22、#23、#30。

## 5. 建议

- 这个 Orange Book 骨架诚实地只服务 **3/30**（1 全 + 2 部分），且三条全是 Orange Book 本尊；部分 fit 的两条 Drugs@FDA 半边按合同留文件。骨架本身没问题，是桶太杂：30 条里 19 条根本不是注册库，8 条是注册库但不是药品。
- 不要为了 #3/#21（NVD）、#23（FDIC/OCC）、#16（OFAC）去改列头或加 custom_ok——违反 fidelity 规则，改完的 Orange Book 就不再是 Orange Book。
- 第二个注册骨架值得建，但选型要看命中：NVD 形（CVE 详情页 + CVSS + KEV）能吃 #3、#21 两条；OFAC/SDN 形吃 #16、#12；FDIC BankFind 形吃 #23（#17 的 BankFind 只是取数入口）。每种只有 1-2 条，单独建一个都不划算；如果只建一个，NVD 形（两条 + 任务描述最清晰、公开 API 有固定 JSON 形状）优先。
- #8（ECOS）、#30（NRHP）、#19（绿建标识）各自孤立，且任务本体是跨源核验/产能测算，即便有对口骨架 GUI 也只是取数入口；建议直接丢掉不迁就。
- 先把 19 条误标按第 4 节迁桶，再决定是否建第二骨架；迁完后 regulatory-registry 剩 11 条，其中 Orange Book 3 条已可跑。
