# task_enhancer

把只需命令行即可完成的 benchmark 任务，改造成同时考察 GUI 能力的任务：将任务的部分输入从文件中移出，装进一个为它专门生成的 Web 应用。agent 不能再直接读取这部分输入，必须通过搜索、筛选、翻页、展开、导出、点击等操作才能拿到。

---

## 架构

### 流水线

```
<domain>/<task_id>
  │
  ├─ S1  FSM 合成      propose → validate → improve
  ├─ S3  风格检索      追溯数据来源 → 截取真实软件界面 → 抽出样式
  ├─ S4  代码合成      应用与 ground-truth 脚本，一次产出
  ├─ S5  运行验证      跑脚本、把失败喂回、修复
  └─ S6  产出          改写后的任务描述 + 放置清单
```

**S1 — FSM 合成。** 直接打开暂存的真实文件工作。逐个文件判断：内容是否应该被放到GUI中、如何在各界面间分割、还是留在磁盘上更诚实 —— 契约文件、溯源清单、十兆的源码树通常属于后者。

**S2 — 校验**：

- **放置** —— 每个暂存文件得到一个决定。
- **无影子副本** —— 藏在界面后面的内容，不得从留在旁边的文件里读到。
- **可达性** —— 无孤儿状态、无悬空边
- **无单向门** —— 从任意可达状态出发，尚未收集的内容必须仍然可达。
- **路径** —— 每条声明的路径在动作图上可以链接起来
- **预算** —— 下界保证环境确有工作量，上界防止它退化成考耐心

随后由 critic agent 判断结构表达不了的部分：障碍是真实的还是装饰性的、分割方式是否契合内容、是否由单一机制包办全部。

**S3 — 风格检索。** 追问这份数据在现实中会存在于何处：带优先级顺序的配置记录来自配置管理平台，行程记录来自调度系统。找出这些产品，截取其界面，抽出布局 DSL 与设计 token。多样性由任务本身的差异带来，而非靠人为注入的审美取向。

**S4 — 代码合成。**  同时产出两样东西：应用本身，以及一份 Playwright 脚本模拟一个 agent 走完整个界面，把放进 GUI 的内容取回。

**S5 — 运行验证。** 脚本全绿即同时确立数据保真、可达性与可解性。修复上限五轮，超限则丢弃重采。

**S6 — 产出。** 改写任务描述的方式是**替换路径而非改写散文**：任务描述以绝对路径列出输入，因此把移入界面的那些路径换成应用地址，其余一字不动。只有留在磁盘上的文件会被交回。

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

python3 pipeline/taskref.py      "$BATCH" "$REF"        # 暂存 input.zip 并查看
python3 pipeline/s1_fsm_synth.py "$BATCH" "$REF" 11     # FSM 合成 + 校验（seed 可选）
python3 pipeline/s3_style_rag.py "$BATCH" "$REF"        # 来源追溯 → 样式
python3 pipeline/s4_codegen.py   "$BATCH" "$REF" 5173   # 构建环境
python3 pipeline/s5_repair.py    envs/<work_dir> 5173   # 验证与修复
python3 pipeline/s6_emit.py      "$BATCH" "$REF" 5173   # 产出 bundle
```

退出码：`0` 成功，`1` 失败，`2` 该任务无 `input.zip`、不可增强。

### 期望的输入布局

```
<batch>/tasks/<domain>/<task_id>/task_card.json
<batch>/data/<domain>/<task_id>/base/input.zip
```

### 产出

```
work/<domain>__<task_id>/     暂存的输入、任务卡、fsm.json        （已 gitignore）
envs/<domain>__<task_id>/     可运行的环境及其验证脚本
  ├─ ground_truth.spec.ts     可检索性证明
  └─ bundle/
     ├─ task_card.enhanced.json   改写后的任务描述
     ├─ agent_input/              仅留在磁盘上的那些文件
     └─ manifest.json             放置决定、模态、预算
```

---

## 目录结构

```
pipeline/    taskref.py（载入）、agent.py（无头驱动）、s1–s6
schemas/     fsm.schema.json
refs/        shots/ styles/ fsm_pool.jsonl —— 截取的参考与多样性池
work/        逐任务的暂存工作区（已 gitignore）
envs/        生成的环境
```

---

## 已知局限

- **泄漏防线。** 暂存的输入仍位于环境目录内，能读取文件系统的 agent 可能完全绕过界面。方向是让后端只提供按 FSM 状态切片的端点。
- **基线审计。** 目前没有任何经验证据表明增强后的任务确实能挡住纯 CLI 的 agent。
- **多样性未量化。** FSM 池能抑制重复，但没有指标证实这一点。
