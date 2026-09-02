# 怎么造一个骨架

骨架是**每个桶造一次**的东西：照一个真实产品复刻出可运行的空壳，之后这个桶里所有任务
都 fork 它。这份文档是流程本身；`pipeline/` 里没有 `s0_make_skeleton.py`，因为下面标了
**判断**的步骤脚本替不了，写成一键生成就是在假装那些判断不存在。

已造好的两个可以当范例对照：`job-search/`（照 BOSS直聘）、`lims/`（照 LabKey Server）。

---

## 0. 先确认这个桶值得造

看 `cluster/final/assignment_full.csv` 里该 slug 的任务，读**三到五条完整任务书**，不是只看标题。

要回答的问题只有一个：**这些任务的输入数据，在真实产品里长什么样。**

**判断 · 什么该进 GUI、什么不该。** 这一步决定成败。

> QMS 桶的例子：任务要求 agent 按 A2/D3/D4/d2 常数自己算 Xbar-R 和 Cp/Cpk、自己出
> PNG、自己写复算脚本。所以**控制图和过程能力指数绝不能进 GUI**——GUI 预先算好就把题毁了。
> 该进 GUI 的是原始测量记录、规格上下限、生产事件表、放行门槛。
>
> 找参照时因此不该去找 SPC 制图软件，该找质量检验记录系统。看错这一步，后面全白做。

顺带看一眼相邻的 slug 会不会共用同一个骨架（`lims` 和 `laboratory` 就是），
如果能，把它们一起写进 `serves_slugs`。

---

## 1. 找参照产品

**硬性条件：匿名可访问。** 我不能输密码认证——这不是麻烦，是禁止项。所以：

- 登录墙后的 demo 一律排除（SENAITE / OpenELIS / LabCollector / ERPNext 都栽在这）
- **curl 只能初筛，不能否定**。403/500/超时都不算数：bio.tools 用 `-A Mozilla` 得 403、
  默认 UA 得 200；demo.odoo.com curl 500 但浏览器能跑。**一律浏览器实证**
- 厂商官网的「Request a demo」不是 demo
- 自建实例（Docker）是合法路径，但要用户先起 daemon

找法，按命中率排序：

1. **产品自家的站就是它自己的实例** —— `labkey.org` 本身就是跑着的 LabKey Server，这是最好的一类
2. 开源产品的公开 demo（先浏览器验，别信搜索结果的描述）
3. 一次性 demo 实例（Odoo 那种自动开库的），但渲染可能不稳
4. 都没有 → **停下来问用户**，不要凭记忆写界面

**判断 · 参照选得对不对。** 标准不是「名气大」，是**对象模型对不对得上任务数据**。
LIMS 那次真正的收获是发现 LabKey 自带 `FlaggedAsExcluded / ExclusionComment`
（剔除+理由）和 `ReplacesRun / ReplacedByRun`（复测血缘）——正好是 OOS 调查和批次放行
留痕要的，不用编。这种发现只有把字段拉出来看才有。

---

## 2. 抓参照 —— 截图远远不够

用 claude-in-chrome，尽量**一次 `browser_batch` 抓完**。四件事，缺一不可：

1. **`read_page` 无障碍树** —— 真实层级与标签
2. **`javascript_tool` 取计算后 CSS** —— 精确色值/字体栈/圆角/间距刻度，比肉眼取色准
3. **接口里的真实字段名** —— 最关键的一步
   - 有 XHR：`read_network_requests` 抓响应
   - 没抓到：从页面上下文 `fetch()` 同源接口（带 cookie），比等 XHR 可靠
   - 有元数据接口更好：LabKey 的 `query-getQueryDetails.api`、Odoo 的 `fields_get`
     直接给字段名 + caption + 类型
   - **照真实字段名建槽位，比照截图猜字段像得多**，而且正是第二层灌数据要对齐的东西
4. **补抓状态** —— 翻页、空结果、独立详情页、列头菜单、导出面板、筛选下拉的**全部选项**

已知的坑：

- `javascript_tool` 返回值里带 URL / query string 会被拦（`[BLOCKED: Cookie/query string data]`），
  只返回 pathname 或字段名
- 隐藏元素的 `innerText` 是空的，用 `textContent`
- 下拉选项常常懒渲染，先 `dispatchEvent(mouseenter)` 或直接读 DOM 里已存在的 `<ul>`
- 连着 2–3 次抓不到就停下来问，别磨

写进 `reference/capture.md`：字段名全表、筛选维度与真实选项、计算后 CSS 数值、
页面结构与真实 class 名、**以及没抓到的东西**（诚实记下来，后面才知道哪些是空白）。

---

## 3. 定「有意偏离」

真站有的就抄，真站没有的就别加。每一条偏离都要写进 `skeleton.json.deliberate_deviations`，
带上 `what / real / why`。

两个对照：

- BOSS直聘 **没有导出**，只有收藏 → 招聘站骨架就**不加导出按钮**，用收藏 + 收藏夹页
- LabKey **有导出** → LIMS 骨架就照抄整个导出面板（三页签、分隔符、引号、表头模式）

合法的偏离长什么样：

- 真站的限制会让数据读不到（BOSS直聘 未登录把薪资打码成 `**-**元`）→ 不复刻这个限制
- 真站没有 agent 需要的可判定状态（搜不到时静默降级成推荐，没有空结果页）→ 补一个空结果态
- 真站的形态对 agent 不可判定（无限滚动）→ 换成同产品另一版式里的翻页控件，样式实测
- 技术上做不到（纯静态前端生成不了 xlsx）→ 导出 csv，写明容器格式不同

**不合法的偏离**：为了塞下任务数据而加真站没有的**页面或控件**。
塞不下就是 `disposition: file`，留在磁盘。

**字段是可以加的（用户决定 2026-08-29，覆盖率优先于逐列保真）**：实体一律 `custom_ok: true`，
第二层可以给任务加字段、可以把既有字段的 caption 改成别的领域的说法——只要**界面形状不变**：
同样的页面、同样的控件、同样的数量。所以「把 CVE 装进 Orange Book 骨架」「把 NNDSS 周报装进
Storm Events 骨架」是合法的，改的是字段名不是界面。

判据从「字段名对不对得上」换成**记录形状对不对得上**：
- 事件型骨架要「地点 + 时间 + 类别 + 若干数值」
- 登记库骨架要「登记项 + 持有人 + 状态 + 带日期的子记录」
- 目录型骨架要「一个条目 + 元数据 + 文件清单」
形状不对（纯文档、证据包、无地点无类别的逐时序列）才是 `disposition: file`。

**这条放宽不动的另一条规则**：GUI 绝不预先算出任务要求 agent 算的东西（合计、判定、
派生列、图表）。那是 HOWTO 步骤 0 的判断，与保真度无关，不跟着一起放开。

---

## 4. 找扩展点

**判断 · 真实产品自己允许怎么被扩展。** 找到它，第二层就有了合法的填充位。

LabKey 的 assay 设计本来就允许自定义 Batch / Run / Data 字段 → 所以给任务加测量列
（吸光度、浓度、CV%、回收率）是**照真实机制走**，不算扭曲骨架。这让 LIMS 骨架的适配
空间比招聘站大一大截（招聘站的 job/brand 是固定字段集，`custom_ok: false`）。

在 `skeleton.json` 里体现为实体上的 `custom_ok` 与 `must_keep`。

---

## 5. 建站

```bash
python3 skeletons/tools/scaffold.py <bucket>     # 生成目录 + skeleton.json 模板 + verify 模板
```

然后：

- 纯静态前端（HTML/CSS/JS + `data/*.json`），不加后端。筛选/翻页/展开全前端——
  这正是要 agent 操作的东西
- CSS 色值**全部来自实测**，注释里写明出处
- 占位数据只为证明交互跑通，用 `data/_gen_placeholder.py` 生成（脚本留在仓库里）
- 页面读 `fetch('data/*.json')`，所以必须用 http 打开，`file://` 会被 CORS 拦

`skeleton.json` 必须填满 `entities`（含 `key` / `data_file` / `data_path` / `fields` /
`must_keep` / `custom_ok`）、`pages`、`layer2_contract`。
形状由 `pipeline/skeletons.py` 校验，跑一下就知道对不对：

```bash
python3 pipeline/skeletons.py <bucket>
```

---

## 6. 验收

```bash
python3 -m http.server 8130 --directory skeletons/<bucket>
npx playwright test verify/walk.spec.ts
```

`verify/walk.spec.ts` 要把 agent 会走的路都走一遍：搜索/筛选 → 翻页 → 进详情 → 状态视图 → 导出。
**期望值从 `data/*.json` 运行时读，不要硬写**——和第二层的 ground_truth spec 同一条纪律。

再和真站截图并排比一次。像不像用眼睛判断，这一步没有自动化替代。

---

## 7. 发布前体检

```bash
python3 skeletons/tools/preflight.py <bucket>
```

它查两件事：

1. **占位数据里有没有从真站抄来的值** —— 交叉比对 `data/*.json` 与 `reference/capture.md`
2. **有没有高风险字段**（法定代表人 / 统一社会信用代码 / 注册资本 …）

招聘站那次就栽在这：占位数据直接用了真站抓来的**真实公司名**（野瞳科技、边锋网络…），
还给它们配了我编的法定代表人和注册资金。本地看无所谓，**发到网上就是给真实公司挂伪造
工商记录**。全部换成虚构名之后才发的。

工具只能提示，判断还是人的：真实公司名 + 编造的工商信息 = 必须改；
真实的**品类词**（"游戏"、"20-99人"）留着没问题。

---

## 8. 接回 pipeline

在 `skeleton.json` 里填 `serves_slugs`，第二层的 S1 就能按分类结果自动选中它：

```bash
python3 pipeline/skeletons.py                      # 看有哪些骨架、各服务哪些 slug
python3 pipeline/s1_map.py "$BATCH" "$REF"          # 按 slug 自动选骨架并做映射
```
