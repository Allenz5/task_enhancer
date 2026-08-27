# job-search 骨架

照 BOSS直聘（www.zhipin.com）复刻的静态招聘站。参照实测记录见 `reference/capture.md`，
可改/不可改的边界见 `skeleton.json` 的 `layer2_contract`。

## 跑起来

```bash
python3 -m http.server 8099 --directory .
# 打开 http://localhost:8099/index.html
```

必须用 http 打开：页面用 `fetch` 读 `data/*.json`，`file://` 下会被 CORS 拦掉。

## 结构

```
index.html       两栏搜索页（左卡片列表 + 右详情面板，点卡不跳页）
job.html         独立岗位详情页  ?jobId=
company.html     公司主页        ?brandId=
companies.html   公司列表
favorites.html   收藏夹
assets/          style.css（色值全部来自实测计算后 CSS）、app.js（共用逻辑）
data/            jobs.json / companies.json —— 第二层按任务替换的就是这两个文件
skeleton.json    契约：页面、字段槽、筛选维度、有意偏离项
```

## 第二层怎么用

S1 把任务输入包映射到 `skeleton.json.record_schema` 的字段名上，
S4 fork 本目录 → 覆盖 `data/*.json` → 写 `ground_truth.spec.ts`。
塞不进 `record_schema` 的数据标 `disposition: file` 留在磁盘，**不要给骨架加页面或字段**。
