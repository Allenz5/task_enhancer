"""可复刻网站的品类表 —— 给 489 条候选任务做人工标注用的选项集。

不是 G2 的品类表，也不是形态族，是二者的合并再校准：
  · 结构取自 shape.py 的 14 个形态族（决定界面骨架长什么样）
  · 具体项来自候选里真实出现过的 G2 品类（≥2 条的基本都收了）
  · 数据仓库/门户那几类来自 audit_excluded.py 回收批的来源（UCI、IRIS、NCBI…）

每一项必须能点名一个**真实参照产品** —— 这是"一个桶出一个软件"的硬要求。
点不出参照产品的项不该存在。
"""

# slug, 中文名, 参照产品, 界面一句话
CATALOG = [
    # ── 招聘与人才 ──
    ("job-board", "招聘岗位站", "BOSS直聘 / Indeed",
     "岗位列表 + 城市/薪资/经验/学历筛选 + 岗位详情 + 公司主页 + 收藏"),
    ("salary-benchmark", "薪酬与人才行情库", "Levels.fyi / 职友集",
     "按职位/城市/公司查薪酬分布，箱线图 + 明细样本表 + 导出"),

    # ── 实验室与生产质量 ──
    ("lims", "实验室信息管理 LIMS", "LabKey Server",
     "批次列表 → 上机批(含质控状态与复测血缘) → 结果行子表，引规格表，网格筛选与导出"),
    ("mes-batch-release", "生产执行与批次放行 MES", "Siemens Opcenter",
     "工单/批次列表 + 工序与设备 + 逐件量测记录 + 放行判定"),
    ("qms-capa", "质量管理 QMS", "MasterControl / ETQ Reliance",
     "不合格品/偏差/CAPA 列表 + 状态流转 + 关联批次与整改记录"),
    ("spc-measurement", "过程能力与量测台账 SPC", "InfinityQS ProFicient",
     "按产品/工序/时间查量测记录，控制图 + 子组明细 + 超限告警"),

    # ── 监管、法规与审计 ──
    ("regulatory-registry", "备案与合规申报检索库", "FDA Orange Book / ECHA",
     "申报主体与产品检索 + 详情页(批准号、成分、状态、变更史) + 导出"),
    ("law-standard-library", "法规与标准全文库", "eCFR / 国家标准全文公开系统",
     "条文树导航 + 全文检索 + 版本对比 + 生效日期 + 引用关系"),
    ("enforcement-case", "执法案件与处罚检索", "EPA ECHO / PHMSA",
     "案件列表(被查主体/日期/违规条款/处罚) + 案件详情 + 阶段时间线"),
    ("audit-findings", "审核发现与整改跟踪", "AuditBoard",
     "审核项列表 + 发现与风险等级 + 整改责任人与闭环状态"),

    # ── 公开数据仓库与门户 ──
    ("dataset-repository", "公开数据集仓库", "UCI ML Repository / Zenodo",
     "数据集列表(按领域/任务/规模筛选) → 详情页(说明、变量表、许可、引用、版本) → 下载"),
    ("omics-repository", "组学与生物数据仓库", "NCBI GEO / ENA",
     "研究/样本/运行三级检索 + 元数据表 + 批量下载"),
    ("materials-database", "材料结构与性质库", "Materials Project",
     "按元素/结构/性质检索 + 材料详情页(晶体结构、能带、力学) + 结构文件下载"),
    ("gov-statistics-portal", "政府统计与开放数据门户", "BLS / EPA / 国家统计局",
     "选指标+地区+年份 → 出表 → 下载。无实体详情页，纯查询导出"),
    ("seismic-datacenter", "台站波形与事件目录", "IRIS/FDSN Wilber",
     "台站/事件检索表单 + 结果列表 + 波形预览 + 打包下载"),
    ("weather-ocean-portal", "气象与海洋观测门户", "NOAA NCEI / Open-Meteo",
     "站点/区域+时间窗查询 + 要素选择 + 时序表与图 + 导出"),
    ("geospatial-portal", "地理与遥感数据门户", "USGS EarthExplorer / Geofabrik",
     "地图选区 + 数据集与时相筛选 + 景/瓦片列表 + 下载"),

    # ── 监控与时序 ──
    ("process-historian", "工厂位号历史库", "AVEVA PI Vision / Ignition Historian",
     "位号树 + 时间窗查询 + 多位号趋势叠加 + 报警事件子表 + 导出"),
    ("scada-hmi", "监控与报警 SCADA", "Ignition / WinCC",
     "工艺画面 + 实时位号表 + 报警列表与确认 + 历史趋势"),
    ("apm-observability", "服务指标与日志可观测", "Datadog / Grafana",
     "服务/主机列表 + 指标面板 + 日志检索 + 告警规则与事件"),
    ("iot-device-console", "IoT 设备接入与遥测", "ThingsBoard",
     "设备清单(型号/位置/在线状态) + 遥测曲线 + 属性与命令下发"),

    # ── 内部业务台账 ──
    ("crm-pipeline", "客户与商机 CRM", "Salesforce / 纷享销客",
     "客户与商机列表 + 阶段/负责人/金额筛选 + 跟进记录时间线 + 报表"),
    ("contract-project-ledger", "合同与项目结算台账", "广联达 / 明源云",
     "合同/项目列表 + 变更签证 + 进度与付款子表 + 结算审核"),
    ("procurement-sourcing", "采购与供应商管理", "Coupa / 用友采购云",
     "请购/订单/供应商列表 + 询比价 + 到货与对账"),
    ("inventory-wms", "库存与仓储台账", "旺店通 / NetSuite WMS",
     "库存清单(仓/批次/效期) + 出入库流水 + 盘点与调拨"),
    ("back-office-ledger", "其他内部业务台账", "飞书多维表格 / 简道云",
     "通用台账列表 + 多维筛选 + 行内展开 + 导出。装不进上面几类的内部记录表"),

    # ── 订单与交易 ──
    ("order-management", "订单与履约管理", "Shopify Admin / 旺店通",
     "订单主表 + 支付/退款/发货子记录 + 状态流转 + 批量导出"),
    ("ecommerce-catalog", "商品目录与详情页", "淘宝 / Shopify 店铺前台",
     "商品列表 + 类目与属性筛选 + 商品详情(图文/SKU/评价)"),
    ("payment-reconciliation", "支付对账与清结算", "Adyen / 支付宝商家后台",
     "交易流水 + 渠道对账差异 + 结算批次与手续费明细"),
    ("ad-campaign-console", "广告投放与效果", "巨量引擎 / Google Ads",
     "计划/单元/创意三级 + 曝光点击转化指标 + 时间与渠道筛选"),

    # ── 主体档案与事件时间线 ──
    ("ehr-patient-record", "病历与受试者档案", "Epic / OpenClinica",
     "患者主索引 + 就诊/访视时间线 + 检验检查结果 + 用药记录"),
    ("clinical-trial-edc", "临床试验数据采集 EDC", "Medidata Rave",
     "中心/受试者列表 + 访视 CRF 表单 + SAE 与质疑管理"),
    ("insurance-claims", "保险理赔案件", "Guidewire ClaimCenter",
     "赔案列表 + 出险与定损明细 + 单证与审批时间线"),
    ("bank-account-ledger", "账户与交易流水", "核心银行/网银后台",
     "账户主表 + 交易流水 + 对手方与渠道筛选 + 对账"),

    # ── 资产、工单与现场 ──
    ("asset-maintenance", "资产台账与维护记录 CMMS", "Fiix / eMaint",
     "资产清单(类型/位置/状态) + 规格 + 保养/维修/故障子表 + 工单派发"),
    ("ticket-tracker", "工单与缺陷跟踪", "Jira / Zendesk",
     "工单列表(状态/优先级/负责人) + 排序 + 处理过程与附件"),
    ("field-inspection", "现场查验与整改", "SafetyCulture iAuditor",
     "查验任务列表 + 检查项打分 + 问题照片与整改闭环"),

    # ── 代码、实验与运营后台 ──
    ("code-hosting", "代码托管站", "GitHub",
     "仓库列表 + 提交/PR/issue 列表 + 文件浏览 + Release 与产物下载"),
    ("ml-experiment-tracking", "ML 实验跟踪与模型注册", "MLflow / Weights & Biases",
     "实验 → run 列表(超参与指标列) + 指标对比图 + 产物与模型版本"),
    ("game-liveops-console", "游戏运营后台", "自研 GM/运营后台",
     "活动与卡池配置 + 玩家账号与道具账本查询 + 排行榜结算"),

    # ── 内容与文档 ──
    ("document-library", "文档库与版本管理", "SharePoint / 语雀",
     "文档树与列表 + 元数据筛选 + 版本历史 + 预览与下载"),
    ("content-social-feed", "内容与社媒浏览", "小红书 / Steam 商店",
     "无固定筛选维度，搜索+翻页浏览卡片，点开看图文详情与评论"),
]

SLUGS = {c[0] for c in CATALOG}
BY_SLUG = {c[0]: c for c in CATALOG}


def menu_text():
    return '\n'.join(f'{s} | {zh} | 参照：{ref} | {ui}' for s, zh, ref, ui in CATALOG)


if __name__ == '__main__':
    print(f'{len(CATALOG)} 项\n')
    print(menu_text())
