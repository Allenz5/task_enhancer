# 参照实测记录 — LabKey Server（www.labkey.org）

抓取时间 2026-08-25，**未登录、匿名访问**，claude-in-chrome 实地抓取。
入口：`https://www.labkey.org/Explore/Assay%20Data%20Analysis/` —— LabKey 官方站本身就是一个跑着的
LabKey Server 实例，Assay Data Analysis 这个项目对匿名用户开放。

为什么选它：候选里 SENAITE / OpenELIS / LabCollector 的 demo 全在登录墙后（我不能输密码认证），
LabKey 是唯一一个**活的、匿名可读、且自家就卖 LabKey LIMS** 的真实产品。

## 1. 真实字段名（匿名可调的两个接口）

- `GET <container>/query-getQueryDetails.api?schemaName=<s>&queryName=<q>` → 字段名 + caption + 类型 + lookup
- `GET <container>/query-selectRows.api?schemaName=<s>&query.queryName=<q>` → 数据行
- `GET <container>/assay-assayList.api` → assay 设计清单

实测 schema `assay.General.Cell Culture`，三个 domain：

**Batches（批次）**
```
Name | Hypothesis | Contact | ExperimentDescriptionURL(Description URL) | Comments
Created | CreatedBy | Modified | ModifiedBy | RunCount(Run Count) | BatchProtocolId | Folder | Project
```

**Runs（运行/检测批）**
```
Flag | Links | Name(Assay ID) | Folder | Comments
Created | CreatedBy | Modified | ModifiedBy
JobId(Job) | ReplacedByRun(Replaced By) | ReplacesRun(Replaces)   ← 复测/重做的血缘
Protocol | RunGroups | RunGroupToggle | Input | Output | DataInputs | DataOutputs
WorkflowTask(Workflow Task) | QCFlags(QC Flags)                    ← 质控状态
cellCultureUser(Lab Technician) | incubatorName(Incubator/Instrument) | Batch
```

**Data / Results（结果行）**
```
ParticipantID(Sample Id) | Date | Day | cellCount(Cell Count) | media(Media) | Run
FlaggedAsExcluded(Flagged As Excluded) | ExclusionComment(Exclusion Comment)   ← 剔除+理由
Created | CreatedBy | Modified | ModifiedBy | Folder
```

`FlaggedAsExcluded` + `ExclusionComment` 这对字段就是 OOS 剔除与理由留痕；
`ReplacesRun` / `ReplacedByRun` 就是复测批次血缘。**这两组都是真实产品自带的，不是我加的。**

实测 5 条 Runs：
```
Data_2023-04-26_15-45-06-1.xlsx  Molly O  INC-001  2023-04-26 16:15  QCFlags=124
CellCulture-Group1               Molly O  INC-001  2023-04-26 15:48  QCFlags=123
CellCulture-Group4               Steve H  INC-001  2019-08-07 15:08  QCFlags=36
CellCulture-Group3               Molly O  INC-002  2019-08-06 16:33  QCFlags=34
CellCulture-Group2               Molly O  INC-002  2019-08-06 16:32  QCFlags=35
```
QC 状态三态（页面渲染值）：`Not Yet Reviewed` / `Reviewed - Passed` / `Reviewed - Rejected`

另有一个 Study 侧的网格（`/home/Demos/HIV Study Tutorial/`），同样匿名可读，
列：Participant ID / Visit / Date / Viral Load Nasba / Viral Load PCR / CD4 / White Blood Count /
Hemoglobin / Hivstatus / Cohort，翻页 `1 - 100 of 300`。用来核对网格 chrome 的一致性。

## 2. 页面结构

### 项目页签（顶部右侧）
`Overview | Data Dashboard | QC | Reports`

### Data Dashboard
左：说明 web part + **Cell Culture Runs** 网格
右：**Files** 面板（工具条：上传↑ / 刷新⟳ / Manage），列出 `CellCulture_run1..4.xlsx` 与两个文件夹
—— 即每个批次的原始读数文件

### QC 页签
说明 web part（写清 Group 4 细胞死亡、违反 QC 判据、标为 Reviewed - Rejected、排除出分析）
\+ 三个具名视图链接：`Results - Passed QC Review` / `Results - Did Not Pass QC Review` /
`Results - Not Yet Reviewed` / `Number of Replicates`
\+ **Quality Control Assessments** 网格：`Flag | Assay ID | Created | Created By | QC Flags |
Lab Technician | Incubator/Instrument`

### 结果页（点 Runs 里的 Assay ID 进入）
```
面包屑： Assay List / Cell Culture Batches / Cell Culture Runs
标题：   Cell Culture Results  📁 Assay Data Analysis
描述行： Cultures different participant cells for 14 days in different media
动作条： MANAGE ASSAY DESIGN ▸ VIEW BATCHES ▸ VIEW RUNS ▸ VIEW RESULTS ▸
        VIEW LINK TO STUDY HISTORY ▸ VIEW EXCLUDED DATA ▸
网格工具条： [网格视图▾] [图表▾] [导出▾] [Replaced Filter▾] [打印]        右侧： 1 - 84 of 84 ▾
筛选芯片行： ✕ ▼ Run = 1606
列： Sample Id | Date | Day | Cell Count | Media | Lab Technician | Incubator/Instrument | Assay ID | Project
```

### 列头菜单（点列头上的 ⊙）
```
Sort Ascending
Sort Descending
Clear Sort           （无排序时禁用）
─────────
Filter...
Clear Filter         （无筛选时禁用）
─────────
Remove Column
Summary Statistics...
Bar Chart
Pie Chart
Quick Chart
```

### 导出面板（点工具条导出图标，就地展开在网格上方）
```
页签： Excel | Text | Script
Excel 页： ( ) Excel Workbook (.xlsx)   Maximum 1,048,576 rows and 16,384 columns.
          ( ) Excel Old Binary Workbook (.xls)  Maximum 65,536 rows and 256 columns.
          ( ) Refreshable Web Query (.iqy)
          Column headers: [Caption ▾]
          [ ] Export selected rows      （未选行时禁用）
          [ Export ]  ← 橙色描边按钮
```
Text 页（实测）：
```
Separator:      (•)Tab  ( )Comma  ( )Colon  ( )Semicolon
Quote:          (•)Double (")  ( )Single (')
Column headers: ( )None  (•)Caption  ( )Field Key
[ ] Export selected rows
[ Export ]
```
Script 页：生成调用 API 的代码片段（未展开抓）。

**注意：LabKey 真有导出。**招聘站骨架当初不加导出是因为 BOSS直聘 没有；这里加导出是照抄。

## 3. 计算后 CSS（实测值）

```
body            font-family: Roboto, Arial, Helvetica, sans-serif
                font-size 14px   color rgb(0,0,0)   background rgb(248,248,248)
顶栏            background rgb(17,101,150)   height 54px
页签条          浅蓝，选中态白底方角贴在条上

table.labkey-data-region   class="table-bordered table-condensed labkey-data-region"
                border 1px solid rgb(211,211,211)   border-collapse: collapse   font-size 14px
td.labkey-column-header    padding 1px 4px   font-weight 400   font-size 14px
                border-bottom 1px solid rgb(170,170,170)   border-right 1px solid rgb(211,211,211)
td（数据格）     padding 3px   font-size 14px   border-bottom 1px solid rgb(211,211,211)
tr.labkey-row              background rgb(255,255,255)
tr.labkey-alternate-row    background rgb(244,244,244)
.labkey-button             color rgb(17,101,150)  透明底  padding 4px 20px  font-size 12px  radius 1px
.labkey-text-link          font-size 11px  uppercase  font-weight 700  letter-spacing .5px
.labkey-page-header        font-size 14px  font-weight 400  padding 12px 0
```

真实 class 词表（页面上出现的全部 labkey-* 类）：
```
labkey-page-header  labkey-text-link  labkey-page-nav  labkey-button-bar  labkey-button
labkey-down-arrow   labkey-help-pop-up  labkey-disabled  labkey-pagination  labkey-paginationText
labkey-data-region  labkey-col-header-row  labkey-column-header  labkey-selectors
labkey-col-header-filter  labkey-alternate-row  labkey-row
```
（同时挂着 Bootstrap 的 `table-bordered table-condensed`）

## 4. 没能拿到的

- Sample Manager / Biologics LIMS 只有 labkey.com 上的营销页，没有匿名实例
- 部分 web part 显示 "Please log in to see this data"，这些没抓
- 登录后才有的 QC 状态**修改**动作（设置 Reviewed - Passed 等）没抓到交互，只抓到展示态
