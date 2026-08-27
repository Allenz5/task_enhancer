# lims 骨架

照 **LabKey Server**（`labkey.org` 的 Assay Data Analysis 项目，匿名可访问）复刻的
实验室数据管理界面。参照实测记录见 `reference/capture.md`，可改/不可改的边界见
`skeleton.json` 的 `layer2_contract`。

## 跑起来

```bash
python3 -m http.server 8130 --directory .
# 打开 http://localhost:8130/index.html
```

必须用 http 打开：页面用 `fetch` 读 `data/*.json`，`file://` 下会被 CORS 拦掉。

## 结构

```
index.html      Overview / Data Dashboard（说明 + Runs 网格 + Files 面板）
runs.html       Cell Culture Runs（含 Replaces / Replaced By / Comments）
batches.html    Cell Culture Batches
results.html    Cell Culture Results   ?run= / ?qc= / ?excluded=1
qc.html         QC 页签（三个具名视图 + Quality Control Assessments）
assets/grid.js  DataRegion —— 列头菜单、筛选对话框、筛选芯片、排序、选择、翻页、导出
assets/app.js   共用外壳（顶栏、页签、面包屑、动作条、数据加载）
assets/style.css 色值/间距全部来自实测计算后 CSS
data/           batches / runs / results / assay —— 第二层按任务替换的就是这几个
skeleton.json   契约：对象模型、扩展点、网格交互、导出口、有意偏离项
```

## 三层对象模型

```
Batch（研究批）──< Run（上机批，质控与放行的单位）──< Result（结果行）
                     QCFlags: Reviewed - Passed / Reviewed - Rejected / Not Yet Reviewed
                     ReplacesRun / ReplacedByRun  ← 复测血缘
                                                     FlaggedAsExcluded / ExclusionComment  ← 剔除+理由
```

这三组字段全是 LabKey 真实产品自带的，不是为了迁就任务加的。

## 第二层怎么用

LabKey 的 assay 设计**本来就允许自定义 Batch / Run / Data 字段**，所以给任务加测量列
（吸光度、浓度、CV%、回收率、时间点…）是照真实机制走，不算扭曲骨架。
必须保留的结构字段见 `skeleton.json.extension_point.must_keep`。
塞不进对象模型的数据标 `disposition: file` 留在磁盘。
