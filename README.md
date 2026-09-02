# task_enhancer

把只需命令行即可完成的 benchmark 任务，改造成同时考察 GUI 能力的任务：将任务的部分输入从文件中移出，装进一个 Web 应用。agent 不能再直接读取这部分输入，必须通过搜索、筛选、翻页、展开、导出、点击等操作才能拿到。

那个应用**不是为每条任务凭空生成的**，而是照一个真实产品复刻出来的**骨架**：每个任务品类造一次，之后该品类下的任务都 fork 它。这是本项目最重要的一次改动 —— 先前每任务自由设计界面，产出的东西离真实软件太远，而"像真的"正是这件事唯一的价值所在。

---

## 架构：两层

```
第一层 · 造骨架（每个品类一次）        ← 人主导，流程见 skeletons/HOWTO.md
   挑桶 → 找匿名可访问的真实参照 → 实地抓取 → 定有意偏离 → 建站 → 验收 → 发布前体检

第二层 · 适配任务（每条任务一次）      ← 代码驱动
   ├─ S1  映射        把输入包映到骨架的字段槽上，propose → validate → improve
   ├─ S2  校验        放置覆盖、槽位存在、结构字段未丢、骨架改动有据
   ├─ S4  建环境      fork 骨架 → 灌数据 → 写 ground_truth.spec.ts
   ├─ S5  运行验证    跑脚本、把失败喂回、修复
   └─ S6  产出        改写后的任务描述 + 放置清单
```

（没有 S3。原先每任务去搜网找界面参照，已被第一层取代。）

### 第一层：骨架

骨架是照真实产品复刻的可运行空壳，**每个桶造一次**。它带三样东西：

- `reference/capture.md` —— 实测记录：真实**接口字段名**、筛选维度的真实选项、计算后 CSS 数值
- `skeleton.json` —— 契约：有哪些实体与字段槽、哪些是结构字段（不可删）、哪些实体接受任务专属字段、以及**有意偏离**了真站的哪几处
- `verify/walk.spec.ts` —— 把 agent 会走的路走一遍

**核心原则：真实性优先于覆盖率。** 塞不进真实界面的任务数据就不进 GUI，留在磁盘当文件；
不要为迁就任务给骨架加真站没有的页面或字段 —— 那等于把好不容易建立的保真度重新丢掉。

已有骨架：

| 桶 | 参照 | 形态 | 服务的 slug |
|---|---|---|---|
| `job-search` | BOSS直聘 | 公开检索站（无导出，因为真站没有） | `job-search-sites` `job-board` |
| `lims` | LabKey Server | 内部业务台账（有导出，因为真站有） | `lims` `laboratory` |

### 第二层：适配

**S1 — 映射。** 直接打开暂存的真实文件工作。不再自由设计界面：骨架是固定的，只决定
**这条任务的输入怎么落进去** —— 哪个文件填哪个实体、哪一列填哪个槽、要做什么操作才拿得到、
以及哪些留在磁盘。骨架由分类结果（`cluster/final/assignment_full.csv` 的 slug）自动选中。

**S2 — 校验**：

- **放置** —— 每个暂存文件得到一个决定，且只有一个
- **槽位** —— 每个填充的槽真的是骨架声明过的
- **结构字段** —— `must_keep` 里的字段没有被丢弃或改名
- **任务专属字段** —— 只加在骨架声明可扩展的实体上
- **骨架改动** —— 每一条都要引用骨架自己 `layer2_contract.allowed` 里的条款，引不出来就不许改
- **预算** —— 取回全部 GUI 内容所需的动作数在上下界之间

**S4 — 建环境。** fork 骨架 → 按映射从 `input/` 灌数据 → 写 `ground_truth.spec.ts`。
服务器、Playwright 配置、包清单由代码直接写出，不让模型重打一遍。

**S5 — 运行验证。** 脚本全绿即同时确立数据保真、可达性与可解性。修复上限五轮，超限则丢弃重采。

**S6 — 产出。** 把移入界面的输入文件的路径换成应用地址，只有留在磁盘上的文件会被交回。

---

## 使用

### 依赖

- Node 20+、Python 3.11+
- `npx playwright install chromium`
- 已认证的 `claude` CLI

### 运行一个任务

```bash
BATCH=/path/to/batch                     # 内含 tasks/ 与 data/
REF=computing_math/config_precedence_audit_5900b9da

python3 pipeline/taskref.py       "$BATCH" "$REF"        # 暂存 input.zip 并查看
python3 pipeline/s1_map.py        "$BATCH" "$REF"        # 映射到骨架 + 校验（骨架按 slug 自动选）
python3 pipeline/s4_build_env.py  "$BATCH" "$REF" 5173   # fork 骨架并灌数据
python3 pipeline/s5_repair.py     envs/<work_dir> 5173   # 验证与修复
python3 pipeline/s6_emit.py       "$BATCH" "$REF" 5173   # 产出 bundle
```

骨架相关：

```bash
python3 pipeline/skeletons.py                    # 有哪些骨架、各服务哪些 slug
python3 pipeline/skeletons.py lims               # 某个骨架有哪些实体与字段槽
python3 skeletons/tools/scaffold.py <bucket>     # 起一个新骨架（先读 skeletons/HOWTO.md）
python3 skeletons/tools/preflight.py             # 发布前体检占位数据
```

退出码：`0` 成功，`1` 失败，`2` 该任务无 `input.zip`、不可增强。

### 期望的输入布局

```
<batch>/tasks/<domain>/<task_id>/task_card.json
<batch>/data/<domain>/<task_id>/base/input.zip
```

### 产出

```
work/<domain>__<task_id>/     暂存的输入、任务卡、mapping.json     （已 gitignore）
envs/<domain>__<task_id>/     可运行的环境及其验证脚本
  ├─ ground_truth.spec.ts     可检索性证明
  └─ bundle/
     ├─ task_card.enhanced.json   改写后的任务描述
     ├─ agent_input/              仅留在磁盘上的那些文件
     └─ manifest.json             放置决定、模态、预算
```

生成的环境会随仓库一起提交，因此 clone 下来即可直接运行、无需重新生成。

### 运行一个已生成的环境

```bash
cd envs/<domain>__<task_id>
npm install              # 仅首次
PORT=5173 npm start      # 然后打开 http://localhost:5173
```

完整演示一遍取回全部 GUI 内容所需的操作路径：

```bash
npx playwright test --headed
```

## 目录结构

```
skeletons/   第一层的产物：每个桶一个骨架
  ├─ HOWTO.md              怎么造一个骨架（流程 + 那些脚本替不了的判断）
  ├─ tools/                scaffold.py（起架子）、preflight.py（发布前体检）
  └─ <bucket>/             skeleton.json（契约）、reference/capture.md（实测记录）、
                           assets/ data/ *.html、verify/walk.spec.ts
pipeline/    taskref.py（载入）、skeletons.py（骨架注册表）、agent.py（无头驱动）、
             s1_map · s2_validate_map · s4_build_env · s5_repair · s6_emit
schemas/     mapping.schema.json
cluster/     分类结果：assignment_full.csv 把 1299 条任务落到 slug 上
work/        逐任务的暂存工作区（已 gitignore）
envs/        生成的环境（随仓库提交，clone 后可直接运行）
```

`node_modules/` 与运行时产物（`test-results/`、`downloads/`、`.server.log`）不入库，所以运行前需要 `npm install`。

---

## 已知局限

- **骨架只有两个。** 1299 条任务落在 217 个 slug 上，目前只有 `job-search`（19 条）与 `lims`（15 条，加相邻的 `laboratory` 约 20 条）有骨架。覆盖率是靠一个个桶造出来的，没有捷径。
- **第一层没有端到端跑通过。** S1/S2/S4 的管道逻辑用合成数据验过，但还没有拿一条带真实 `input.zip` 的任务从头跑到尾 —— 这批任务的输入包目前不在本地。
- **仅支持 Claude Code 生成。** 各阶段通过 `claude -p` 调用，未做模型/工具抽象，换用其他 coding agent 需要改 `pipeline/agent.py`。
- **泄漏防线。** 暂存的输入仍位于环境目录内，能读取文件系统的 agent 可能完全绕过界面。方向是让后端只提供按 FSM 状态切片的端点。
- **基线审计。** 目前没有任何经验证据表明增强后的任务确实能挡住纯 CLI 的 agent。
- **多样性未量化。** 产品品类由数据决定、机制池抑制重复，但没有指标证实结果确实是多样的。
