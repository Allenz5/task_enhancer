# gov-statistics-portal 骨架 × 41 条任务 适配判定

骨架：`envgen/skeletons/gov-statistics-portal/`（NOAA NCEI Storm Events Database 克隆）。无任务输入文件，全部按描述推断。

## 1. 骨架槽位（5 行）

1. 实体只有三个：`event`（州/县或海区、事件类型、起止时间、地点、震级/量级、直接与间接死亡与受伤、财产与作物损失、事件叙述）、`episode`（风暴系统：一组 event 的汇总与叙述）、`fatality`（挂在 event 下的死亡子记录：年龄、性别、地点、类型）。`custom_ok: false`，不能加字段。
2. 入口是一个查询表单：州 → 县/海区、事件类型、类型阈值、必填日期范围、叙述关键词；结果表在同页表单下方，25 行/页，10 列可排序，每行链接到 Event Details，Event 再链到 Episode Details。
3. 导出只有 `Download Table CSV`，列为真实 CSV 头（EVENT_ID、CZ_NAME、BEGIN_DATE、EVENT_TYPE、DEATHS_DIRECT、DAMAGE_PROPERTY…），带日期过滤。
4. 明确不做：Results Summary 的求和/计数（agent 自己算）、地图选区、事件类别归并（产品没有"类别"概念）、任何指标×地区×年份的宽表出表。
5. 记忆规则：塞不进真实界面的数据留在磁盘（`disposition: file`），不为迁就任务改骨架。所以一条记录只有长成"地点 + 日期 + 类型 + 几个数值 + 叙述"才进 GUI。

## 2. 逐任务判定

| 序号 | 任务名 | 判定 | 进 GUI 的部分 | 留文件的部分 / 原因 |
|---|---|---|---|---|
| 1 | 航空航天工程师人才市场研究(BLS OOH) | 不 fit | — | 职业 2024/2034 就业预测、薪酬分位、行业占比快照，是职业×指标宽表，无地点/日期/事件 |
| 2 | 石油工程师就业薪酬研究(BLS OEWS) | 不 fit | — | 职业×年份×指标序列与行业/地域分布表，无事件形状 |
| 3 | UN Comtrade HS 版本迁移审计 | 不 fit | — | 商品码×年贸易流水 + HS 对照图，纯贸易统计表 |
| 4 | CDC NNDSS 第 52 周暂定/最终调和 | 不 fit | — | 疾病×周计数带 U/N/NN 标记，周报表格，无地点事件 |
| 5 | EPA TRI PFAS 释放变更控制 | 不 fit | — | 设施×化合物×年 Form R 释放/废物量，上百列年度申报表，无事件日期与叙述 |
| 6 | BTS-CBP 陆路口岸月度货运 | 不 fit | — | 口岸×月×8 类流量指标，月度时间序列 |
| 7 | NCUA 信用社资本分类审计 | 不 fit | — | 季度 Call Report 科目余额 ZIP，机构财务报表 |
| 8 | USDA RMA 作物保险损失原因闭包 | 部分 fit(弱) | 县 + 月 + 损失原因(→event_type) + 赔款(→damage_crops) 可作事件行浏览导出 | 作物、保险计划、损失阶段代码、保费、保单数无槽位，而任务核心正是县—作物—计划闭包，这些全留文件 |
| 9 | FCC E-Rate FY2023 资助生命周期 | 不 fit | — | FRN 承诺/拨款/发票 + NCES 学校名录，是资助合同台账 |
| 10 | 张掖乡镇耕地质量 PCA 标定 | 不 fit | — | 乡镇×两期×17 项指标工作簿 + Shapefile，无事件 |
| 11 | 中国车企进入英国市场研究 | 不 fit | — | 无任何数据记录，只有案例 PPT 与待检索政策文本，不是统计门户 |
| 12 | BTS 2025-01 航空准点率复现 | 不 fit | — | 54 万条航班行（承运人、机场、计划/实际时刻、5 类延误分钟、取消/备降）：把承运人当类型、延误当量级是硬套，5 类延误无槽位 |
| 13 | NHTSA FARS 2024 超速致死审计 | 部分 fit | 事故表→event（州、县、日期时间、事故类型、FATALS→deaths_direct、经纬度）；人员表→fatality（年龄、性别、类型） | 车辆表（超速标记在车辆级）、BAC 多重插补 64,616 行、道路功能分类、分析手册全留文件 |
| 14 | NOAA 风暴事件月度灾损统计 | 全 fit | 75,593 条事件行，含 K/M/B 损失字符串，按州+月检索、CSV 导出 | 无；聚合由 agent 算 |
| 15 | 风暴致死月度统计 | 全 fit | 事件表 + 1,466 条致死记录（Event Details 页 Fatalities 块） | 无 |
| 16 | 风暴事件类型归类统计 | 全 fit | 事件行含 EVENT_TYPE（51 类） | `event_category_map.csv`（51→7 类）留文件，产品无类别概念 |
| 17 | 风暴系统(episode)月度统计 | 全 fit | 每行带 episode_id，Episode Details 页列出同系统全部事件 | 无 |
| 18 | 五因子基金无前视回测 | 不 fit | — | Fama/French 日因子收益序列 + 回测脚本，不是政府统计 |
| 19 | 平面设计师薪酬研究(加州—得州) | 不 fit | — | 55 行地理层级×薪酬分位表 + 技能表，是薪酬行情 |
| 20 | CISO 2021Q3 净负荷爬坡复核 | 不 fit | — | 2,208 小时×44 列电网运行序列 |
| 21 | 证券投资专业人员行业结构研究 | 不 fit | — | 职业大典条目 + 协会披露汇总数，无记录级数据 |
| 22 | MSHA 2024 Part 50 矿山伤害对账 | 部分 fit | 伤害记录→event（矿山所在州/县、事故日期、伤害分类→event_type、死亡/损失工日、事故叙述） | 季度工时暴露档案、operator/contractor 身份（无槽位）、定长格式手册、官方 Tables 1-8 留文件；对账本身在文件侧 |
| 23 | 匿名化贸易面板出口管制评估 | 不 fit | — | 产品×流向×年金额数量面板，纯贸易表 |
| 24 | 德国电力负荷月度预测 | 不 fit | — | 49,680 行逐时负荷/发电序列 |
| 25 | EPA 2022–2024 臭氧设计值复算 | 不 fit | — | 站点×日臭氧日汇总（百万级）+ 设计值报表，是监测时序而非事件；缺叙述、无伤亡损失 |
| 26 | 希腊逐小时电力负荷预测 | 不 fit | — | 逐小时负荷序列 + 特征配置 |
| 27 | 平面设计师职业市场与 AI 转型 | 不 fit | — | BLS/O*NET/WEF 职业指标摘录 |
| 28 | 平面设计师用工薪酬技能结构(OEWS) | 不 fit | — | 526 条地区薪酬 + 306 条行业就业记录，是地区×职业指标表 |
| 29 | 机械工程师用工薪酬产业分布(OEWS) | 不 fit | — | 同上（17-2141） |
| 30 | 微生物学家人才市场基准研究 | 不 fit | — | BLS Table 1.2 六职业预测 + O*NET 条目 |
| 31 | IRS 2022–2023 县际迁移走廊审计 | 不 fit | — | 起讫 GEOID×迁移户数/AGI 流量表 + 邻接文件，无事件 |
| 32 | 城市交通变化桑基图 | 不 fit | — | 现成 Excel 城市×5 维类别表，无来源系统 |
| 33 | HUD FY2025 小区域公平市场租金审计 | 不 fit | — | 县/ZIP×年租金与支付标准区间表 |
| 34 | 三维条带图 | 不 fit | — | 年份×区域城镇化指标矩阵，无来源系统 |
| 35 | 三维锥形曲线图 | 不 fit | — | 同 34 |
| 36 | 三维带状图绘制 | 不 fit | — | 同 34 |
| 37 | 联邦渔业库存状态季度迁移审计 | 不 fit | — | 库存×季度状态表（PDF 抽取），无地点事件；原文点名 NOAA ENC 是误归 |
| 38 | 中国人力资源服务行业研究 | 不 fit | — | 脱敏经营台账 + 上市公司年报摘录，不是统计门户 |
| 39 | 装配式建筑施工员职业研究 | 不 fit | — | 职业标准、考试大纲、培训目录 + 四地面积统计，文档为主 |
| 40 | 商业车险责任险准备金基准复核 | 不 fit | — | 公司×事故年×开发期三角表（CAS 整理），不是政府门户 |
| 41 | 2023 Delaware HMDA 发布控制审计 | 不 fit | — | 贷款级 LAR 上百字段（定价、人口统计、地理），只有年份无事件日期，`custom_ok:false` 装不下 |

## 3. 计数

- 全 fit：4（#14 #15 #16 #17，全部是 NOAA Storm Events 本尊）
- 部分 fit：3（#13 FARS、#22 MSHA Part 50、#8 USDA RMA，其中 #8 很弱）
- 不 fit：34

## 4. 错标与建议归属

按 catalog 对 `gov-statistics-portal` 的定义（"选指标+地区+年份 → 出表 → 下载"），BLS/HUD/IRS/NNDSS/BTS/Comtrade/TRI/HMDA 这批并没有标错——是建出来的骨架（Storm Events）跟这个定义对不上。下面只列按现有 catalog 明显有更贴切桶的：

- → `salary-benchmark`：#1 #2 #19 #27 #28 #29 #30（7 条，全是 BLS OEWS/OOH + O*NET 的职业薪酬行情，#19 已有另一票）
- → `dataset-repository`：#18 Fama/French、#40 CAS Schedule P（学术公开数据集，不是政府门户）
- → `process-historian`：#20 EIA-930、#24 #26 OPSD（逐时电网序列，位号+时间窗+趋势）
- → `weather-ocean-portal`：#25 EPA AQS（站点×日监测值）
- → `regulatory-registry`：#7 NCUA Call Report、#41 HMDA LAR（机构申报披露）
- → `contract-project-ledger`：#9 E-Rate（FRN 承诺/拨款/发票生命周期）
- → `document-library`：#11 #38 #39（输入是 PPT/年报/标准文本，无记录级数据）
- 无来源系统、建议剔除或归 `back-office-ledger`：#32 #34 #35 #36（四条绘图任务，输入是一份现成 Excel）
- #37 原文点名字段写的是 NOAA ENC（海图），实际是 NOAA Fisheries 库存状态 PDF 表，点名需修正；桶可留

## 5. 建议

1. 老实说：这个骨架真正服务的是 41 条里的 4 条（全是同一份 NOAA 2023 风暴数据的四个变体），再加 FARS、MSHA 两条能把事故/伤害记录当事件行装进去的部分 fit；#8 只是表面像。有效覆盖 6–7/41，约 15%。
2. 桶必须拆。现在 `gov-statistics-portal` 混了四种东西：事件记录门户（storm/FARS/MSHA/RMA）、指标×地区×年份出表门户（BLS、HUD、IRS、NNDSS、BTS、Comtrade、TRI、HMDA，约 14 条）、逐时时序（EIA/OPSD/AQS，5 条）、根本不是门户的文档与绘图任务（11 条）。
3. 建议把现骨架改挂到新 slug（如 `event-records-portal` / `storm-events`，skeleton.json 的 `serves_slugs` 里已经有 `storm-events`），把 `gov-statistics-portal` 留给"指标出表"形态，另建一个 data.bls.gov / Census 风格的宽表查询骨架来接那 14 条——那才是 catalog 原本写的界面。
4. 时序类三条移到 `process-historian`，AQS 移到 `weather-ocean-portal`；薪酬七条移到 `salary-benchmark`，那个桶已经有对应界面。
5. #11 #32 #34–36 #38 #39 这 7 条没有任何可回建的来源系统，应从骨架适配流程里剔除，不要为它们建页面。
6. 部分 fit 的 FARS 和 MSHA 若真要装：只放事故/伤害主表和人员子记录，车辆表、工时暴露、多重插补一律 `disposition: file`，别给 event 加字段。
