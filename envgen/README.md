# envgen

从参照到虚拟环境的两层流水线。设计见 `DESIGN.md`，这里只说目录里有什么、怎么跑。

```
DESIGN.md            设计（定稿）
contracts/           skeleton.json 与 mapping.json 的 schema

build_skeleton/      造骨架（每桶一次）
  describe.py          参照 → description.md
  build.py             description.md → skeleton.json / app / filler.py；seed；引擎起得来；探针干净
  seed.py              用骨架自己的 filler.py 生成 store/
  drive.py             agent 驱动自己建的站，写 verify/walk.spec.ts，修 app/；spec + 探针全过才停

load_task/           装任务（每任务一次）
  map.py               input/ → mapping.json                          [未写]
  validate.py          校验 mapping.json                               [未写]
  load.py              按映射把 input/ 写进 store/                      [未写]
  fill.py              已废弃，由 noisegen/ 取代
  verify.py            ground_truth.spec.ts + 探针                      [未写]
  repair.py            失败喂回修复                                     [未写]
  emit.py              改写任务描述，交付 bundle                         [未写]

noisegen/            造干扰数据（每任务一次）：plan（agent 决定造什么并写生成器）
                     → generate（跑生成器 + 机械校验）→ review（agent 复查）

engine/server.js     两层共用的服务端：按 views 投影、页上限、无整表端点、store/ 不可寻址
probe.py             两层共用的泄漏探针：试所有不经界面拿数据的便宜路径
fixtures/mini/       最小夹具骨架，给自测用
selftest.py          自测：夹具 → 填充 → 起引擎 → 探针 → 断言
```

```bash
python3 envgen/selftest.py
```

## 一个环境目录长什么样

```
<env>/
  skeleton.json   契约
  mapping.json    第二层的映射（骨架本身没有）
  store/          <entity>.json 数组；.task/ 任务原始行；noise/ 干扰行；noise.manifest.json
  app/            前端；列定义从 /api/views 读
  filler.py       骨架的数据生成器
  input/          任务的原始输入（只有验证进程读）
```

起服务：`ENV_ROOT=<env> PORT=5173 node envgen/engine/server.js`

## 接口

- `GET /api/views` —— 视图形状（字段、页大小、可筛选、可排序），前端据此渲染；不含数据
- `GET /api/v/<list>?f.<field>=<op>:<v>&sort=[-]field&page=n&size=n` —— `size` 只能比 page_size 小
- `GET /api/v/<detail>/<key>`
- `GET /api/v/<export>?f...` —— CSV，遵守筛选；`headers=fieldkey` 用字段名做表头

筛选算子：`eq neq contains startswith gt gte lt lte blank nonblank`。
对未暴露或未声明可筛选的字段筛选 / 排序 → 400。

## 造一个骨架

```bash
mkdir -p envgen/skeletons/<bucket>/reference     # 放截图 / 接口响应 / DOM 笔记，什么形态都行
python3 envgen/build_skeleton/describe.py envgen/skeletons/<bucket>
python3 envgen/build_skeleton/build.py    envgen/skeletons/<bucket>     # 断网可 --resume <session>
python3 envgen/build_skeleton/drive.py    envgen/skeletons/<bucket>
```

已跑通的两个（都是 fake 数据，没装任务）：

| 骨架 | 参照 | describe | build | drive | walk spec |
|---|---|---|---|---|---|
| job-search | BOSS直聘，2 张截图 + capture.md | 7 轮 $1.09 | 37 轮 $6.48 | 1 轮 | 851 行 / 20 test |
| lims | LabKey，4 张截图 + capture.md | 10 轮 $1.20 | 31 轮 $5.26 | 1 轮 40 轮 $4.78 | 945 行 / 58 test |

每个约 50 分钟。断网会杀掉 build，`--resume <session>` 接着跑，上下文不丢。

## 还没有的

`load_task/` 里标 [未写] 的。
