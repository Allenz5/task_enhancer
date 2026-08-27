# Rule baseline: hand-written keyword -> provenance category.
# Ordered; first match wins. Built from domain knowledge of what produces each data type.
RULES = [
 ('biomechanics-simulation-suite', ['opensim','osim','.mot','.sto','motion capture','动作捕捉','生物力学','步态','gait','marker','肌肉','关节力矩','inverse kinematics','逆运动学','c3d']),
 ('seismic-data-portal',        ['obspy','mseed','miniseed','seed','地震','震相','台站','sac','stationxml','earthquake','seismic','走时']),
 ('materials-database',         ['poscar','vasp','cif','晶体','材料科学','能带','dft','第一性原理','xrd','材料基因','lattice']),
 ('gis-remote-sensing-portal',  ['geotiff','.tif','遥感','影像','landsat','sentinel','ndvi','栅格','shapefile','测绘','dem','gdal','投影带']),
 ('cad-drawing-repository',     ['dxf','dwg','qcad','autocad','图纸','标注','建筑','施工图','bim','revit']),
 ('bioinformatics-portal',      ['fastq','swc','神经元','基因','蛋白','sequence','blast','genome','生物信息','细胞']),
 ('chemistry-lims',             ['色谱','光谱','质谱','hplc','化学','反应','滴定','分子','摩尔']),
 ('ci-cd-dashboard',            ['ci/cd','pipeline run','jenkins','github actions','构建日志','流水线','单元测试报告','pytest','覆盖率']),
 ('log-search-console',         ['日志','log file','syslog','trace','抓包','pcap','packet','wireshark','tcpdump','告警','监控指标']),
 ('issue-tracker',              ['缺陷','bug 单','jira','工单','需求管理','迭代','看板','敏捷']),
 ('erp-system',                 ['erp','sap','采购','库存','供应链','订单管理','财务','报销','物料','bom','排产','mes']),
 ('ecommerce-admin',            ['电商','商城','商品','sku','购物车','小程序','店铺','促销','秒杀','拼团']),
 ('web-analytics-dashboard',    ['埋点','google analytics','uv','pv','留存','转化率','漏斗','用户行为','ab 实验','ab测试']),
 ('financial-market-terminal',  ['股票','行情','k线','证券','财报','交易','风控','wind','基金','收益率']),
 ('game-backend-console',       ['游戏','关卡','数值策划','玩家','服务端','帧同步','unity','unreal','战斗']),
 ('scada-industrial-historian', ['plc','scada','工控','传感器','采集','自动化产线','modbus','设备状态','opc']),
 ('power-grid-ems',             ['电力','电网','潮流','负荷','变电','继电','配电','光伏','储能']),
 ('statistical-report-portal',  ['统计','回归','假设检验','置信区间','抽样','p 值','方差分析','可视化图表','matplotlib']),
 ('document-library',           ['pdf','docx','word','报告','合同','文档','手册','公文','排版']),
 ('spreadsheet-workbook',       ['excel','xlsx','工作簿','单元格','数据透视','公式','libreoffice']),
]
def label(text):
    t = text.lower()
    for cat, kws in RULES:
        if any(k in t for k in kws):
            return cat
    return 'unclassified'
