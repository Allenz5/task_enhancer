"""Scaffold a new skeleton directory.

Writes the plumbing that is identical for every skeleton -- directory layout, a
`skeleton.json` with every field the loader requires, a verification spec that already
knows how to serve the thing -- so the work left is the part that is actually different:
the reference capture, the pages, and the judgements `HOWTO.md` walks through.

It deliberately writes TODOs rather than plausible defaults. A pre-filled reference block
or an invented entity is exactly the kind of thing that survives to publication because
it looked finished.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SKELETON_JSON = {
    "bucket": None,
    "name": "TODO 这个骨架是什么产品品类",
    "reference": {
        "product": "TODO 复刻的真实产品名",
        "url": "TODO 实地抓取的入口 URL",
        "captured": "TODO YYYY-MM-DD",
        "access": "TODO 匿名可访问 / 需要什么前提",
        "capture_notes": "reference/capture.md",
        "field_names_source": "TODO 真实字段名从哪个接口拿的",
    },
    "serves_slugs": ["TODO cluster/final/assignment_full.csv 里的 slug"],
    "runtime": {"type": "static", "backend": "none", "serve": "任意静态服务器，见 README.md"},
    "entities": {
        "TODO_entity": {
            "_desc": "TODO 这个实体是什么",
            "key": "TODO 主键字段名，没有就填 null",
            "data_file": "data/TODO.json",
            "data_path": "rows",
            "custom_ok": False,
            "must_keep": [],
            "fields": {
                "TODO_field": {"caption": "TODO 真站上的显示名", "desc": "TODO"},
            },
        }
    },
    "pages": [
        {"id": "TODO", "file": "index.html", "shows": ["TODO_entity"], "title": "TODO"}
    ],
    "interactions": ["TODO agent 能做的操作"],
    "export_points": [],
    "deliberate_deviations": [
        {"what": "TODO 改了什么", "real": "TODO 真站是怎样的", "why": "TODO 为什么改"}
    ],
    "layer2_contract": {
        "allowed": ["替换 data/*.json"],
        "forbidden": ["新增真站不存在的页面", "删掉 entities.*.must_keep 里的字段"],
        "unmappable": "塞不进 entities 的任务数据标 disposition=file 留在磁盘，不进 GUI",
    },
}

CAPTURE_MD = """\
# 参照实测记录 — TODO 产品名

抓取时间 TODO，TODO 登录状态，claude-in-chrome 实地抓取。
入口：TODO

为什么选它：TODO（尤其写清其它候选为什么不行）

## 1. 真实字段名

TODO 从哪个接口拿的，字段名 + caption + 类型全表。
**照真实字段名建槽位，比照截图猜字段像得多。**

## 2. 筛选 / 检索维度与真实选项

TODO 每个维度对应哪个字段，选项逐字抄下来。

## 3. 计算后 CSS（实测值，不是肉眼取色）

TODO 色值 / 字体栈 / 间距 / 圆角 / 真实 class 名。

## 4. 页面结构

TODO 每个页面的区块自上而下。

## 5. 没能拿到的

TODO 诚实记下来 —— 后面才知道哪些地方是空白，哪些偏离是因为抓不到而不是有意为之。
"""

WALK_SPEC = """\
import {{ test, expect }} from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// 期望值运行时从 data/ 读，不硬写 —— 与第二层的 ground_truth spec 同一条纪律。
const BASE = 'http://localhost:{port}';
const D = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));

test('TODO 走通 agent 会走的路：检索 → 筛选 → 翻页 → 详情 → 导出', async ({{ page }}) => {{
  const errs: string[] = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(`${{BASE}}/index.html`);
  // TODO 断言列表渲染、翻页、筛选、进详情、导出
  expect(errs).toEqual([]);
}});
"""

README = """\
# {bucket} 骨架

照 **TODO 产品名** 复刻。参照实测记录见 `reference/capture.md`，
可改/不可改的边界见 `skeleton.json` 的 `layer2_contract`。

## 跑起来

```bash
python3 -m http.server {port} --directory .
# 打开 http://localhost:{port}/index.html
```

必须用 http 打开：页面用 `fetch` 读 `data/*.json`，`file://` 下会被 CORS 拦掉。

## 验收

```bash
npx playwright test verify/walk.spec.ts
```
"""


def scaffold(bucket: str, port: int = 8140) -> Path:
    dest = ROOT / bucket
    if dest.exists():
        raise SystemExit(f"{dest} already exists -- refusing to overwrite")

    for sub in ("assets", "data", "reference", "verify"):
        (dest / sub).mkdir(parents=True)

    spec = json.loads(json.dumps(SKELETON_JSON))
    spec["bucket"] = bucket
    (dest / "skeleton.json").write_text(
        json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    (dest / "reference" / "capture.md").write_text(CAPTURE_MD, encoding="utf-8")
    (dest / "verify" / "walk.spec.ts").write_text(WALK_SPEC.format(port=port), encoding="utf-8")
    (dest / "README.md").write_text(README.format(bucket=bucket, port=port), encoding="utf-8")
    (dest / ".gitignore").write_text("node_modules\ntest-results/\n", encoding="utf-8")
    (dest / "data" / "_gen_placeholder.py").write_text(
        '"""占位数据生成脚本。字段名照 reference/capture.md 里的真实字段名。"""\n'
        "# TODO\n", encoding="utf-8")

    return dest


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: scaffold.py <bucket> [port]")
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8140
    dest = scaffold(sys.argv[1], port)
    print(f"scaffolded {dest}")
    print("next: skeletons/HOWTO.md 步骤 1 —— 先找到匿名可访问的真实参照，别先写页面")
