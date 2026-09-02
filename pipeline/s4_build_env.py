"""S4 -- environment build. Fork the skeleton, load this task's data into it.

The old S4 generated a whole application per task from an FSM and a retrieved style.
This one does not generate an application at all: the application already exists and was
cloned from a real product. What happens here is narrower and therefore far more
reliable --

  1. the skeleton is forked verbatim into the environment directory
  2. the agent rewrites `data/*.json` from `input/`, following `mapping.json` slot by slot
  3. where the mapping declares task-specific fields, it swaps them into the pages'
     column definitions -- the extension mechanism the real product itself provides
  4. it writes `ground_truth.spec.ts`, proving every `gui` placement is retrievable

The server, the Playwright config and the package manifest are written here, in code,
rather than asked for: they are plumbing, identical for every environment, and nothing is
gained by having a language model retype them.

What keeps the spec honest is a separation, not a restriction: it may encode *how to
reach* content but never the content itself. Expectations are read from `input/` at
runtime, so there is nowhere to hardcode an answer.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import agent
import skeletons
import taskref

SERVER_JS = """\
// Static file server for this environment. No dependencies, honours $PORT.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || {port};
const ROOT = __dirname;
const TYPES = {{
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
}};

http.createServer((req, res) => {{
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/health') {{
    res.writeHead(200, {{'Content-Type': 'application/json'}});
    return res.end('{{"ok":true}}');
  }}
  let file = path.join(ROOT, url === '/' ? '/index.html' : url);
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) {{
    res.writeHead(403); return res.end('forbidden');
  }}
  fs.readFile(file, (err, buf) => {{
    if (err) {{ res.writeHead(404); return res.end('not found'); }}
    res.writeHead(200, {{'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}});
    res.end(buf);
  }});
}}).listen(PORT, () => console.log(`serving ${{ROOT}} on ${{PORT}}`));
"""

PLAYWRIGHT_CONFIG = """\
import {{ defineConfig, devices }} from '@playwright/test';

const PORT = Number(process.env.PORT) || {port};

export default defineConfig({{
  testDir: '.',
  testMatch: /ground_truth\\.spec\\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  use: {{
    baseURL: `http://localhost:${{PORT}}`,
    viewport: {{ width: 1440, height: 900 }},
    acceptDownloads: true,
  }},
  webServer: {{
    command: 'node server.js',
    url: `http://localhost:${{PORT}}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  }},
  projects: [{{ name: 'chromium', use: {{ ...devices['Desktop Chrome'] }} }}],
}});
"""

PROMPT = """\
Load this task's data into the skeleton that is already in this directory.

The application is **already built**. It was cloned from a real product and measured
against it. You are not designing or redesigning anything. Your job is to make it hold
*this task's* data, and then to prove that data can be retrieved from it.

Everything you need is here:

- `mapping.json` -- the contract. Read it fully; it is what you implement.
- `input/` -- the staged input, exactly as it shipped. **The single source of truth.**
- `skeleton.json` -- what this skeleton holds, and what you may and may not change.
- the skeleton's own `README.md` is not present; `skeleton.json` is the contract.

## 1. Load the data

For every `data_placement` entry with `disposition: "gui"`, read its `source` from
`input/` and write it into the entity's `data_file`, field by field, exactly as `slots`
says. Keep the file's existing top-level shape -- the pages read `data_path` from it.

- Fill the structural fields. The skeleton's own filters, keys and status columns read
  them; a page whose key is empty stops working.
- Where `custom_fields` declares task-specific fields, add them to the records **and** to
  the column definitions of the pages that show that entity, replacing whatever
  `dropped_fields` names. This is the extension mechanism the real product provides.
- Apply every entry in `skeleton_changes`, and nothing beyond them.

Entries with `disposition: "file"` are **not yours to render**. Leave them in `input/`
untouched; they stay on disk for the agent to read directly. Do not add a page for them,
do not slip them into a data file, do not mention them in the interface.

Do not restyle the skeleton, do not add pages, do not remove interactions. If something
in the mapping cannot be implemented without changing the skeleton beyond
`skeleton.json` -> `layer2_contract.allowed`, stop and say so in your final message
rather than doing it.

## 2. `ground_truth.spec.ts`

A Playwright spec that plays a competent agent: for every `gui` placement it walks the
declared `path` and genuinely retrieves the content through its declared `modality` --
filtering the grid, opening each detail surface in turn, paging to the end, running the
export and parsing what came out.

It must assert what it retrieved against the corresponding file in `input/`, **read at
runtime**.

> **The one inviolable rule: never type a data value into any file you write.**
> Not into the data files, not into the spec, not into a fixture. Values come from
> `input/` at runtime -- the loader reads them, the spec reads them to build its
> expectations. A hardcoded value makes the spec worthless as verification, because it
> would then be asserting against you rather than against the data.

Where the interface necessarily reformats (a number rendered with a thousands separator,
a date shown in a display format), assert the parsed value rather than the raw string,
and say in a comment why the transform is lossless.

Also assert the negative side: content that `mapping.json` says is only reachable deeper
must not already be readable on the surface above it -- not in the DOM, not in a
`title=`, not in the JSON that surface fetches.

Finally have the spec write `ground_truth_retrieval.json` in this directory with exactly
this shape:

```json
{{
  "placements": [
    {{
      "source": "<matching mapping.json data_placement source, verbatim>",
      "path": ["<actions walked>"],
      "pieces_retrieved": 24,
      "matched": true
    }}
  ]
}}
```

One entry per `gui` placement, and `source` must match the mapping's spelling exactly: it
is how coverage is checked, so a renamed source reads as a placement nobody retrieved.

Do not try to solve the benchmark task itself. Whether the task's own answer is correct is
graded elsewhere. Your concern is that everything placed in the interface really is
retrievable from it, unchanged.

## Runtime contract

`server.js`, `package.json` and `playwright.config.ts` are already written and correct.
Do not modify them. `npm install && npm start` serves on port {port}; `npx playwright
test` runs your spec.

## Done means

`npm start` runs, `npx playwright test` passes, and `ground_truth_retrieval.json`
accounts for every `gui` placement in `mapping.json`. Verify this yourself before
finishing.
"""


def prepare_env(task: taskref.Task, env_dir: Path, port: int = 5173) -> skeletons.Skeleton:
    """Fork the skeleton and stage what the coding agent works from."""
    env_dir = Path(env_dir)
    mapping = json.loads((task.work_dir / "mapping.json").read_text(encoding="utf-8"))
    if mapping.get("candidate") is False:
        raise ValueError(f"{task.ref} was judged not a candidate: {mapping.get('reason')}")

    sk = skeletons.load(mapping["skeleton"]["bucket"])
    env_dir.mkdir(parents=True, exist_ok=True)
    sk.fork(env_dir)

    # The input lands verbatim. Nothing is normalised or converted on the way in --
    # these archives carry spreadsheets, drawings and bundled source trees, and reshaping
    # any of it would be inventing data.
    shutil.copytree(task.input_dir, env_dir / "input", dirs_exist_ok=True)
    shutil.copy(task.work_dir / "mapping.json", env_dir / "mapping.json")
    shutil.copy(task.work_dir / "task_card.json", env_dir / "task_card.json")

    (env_dir / "server.js").write_text(SERVER_JS.format(port=port), encoding="utf-8")
    (env_dir / "playwright.config.ts").write_text(
        PLAYWRIGHT_CONFIG.format(port=port), encoding="utf-8")
    (env_dir / "package.json").write_text(json.dumps({
        "name": f"env-{task.task_id}",
        "private": True,
        "scripts": {"start": "node server.js", "test": "playwright test"},
        "devDependencies": {"@playwright/test": "^1.62.0"},
    }, indent=2), encoding="utf-8")
    return sk


def build(task: taskref.Task, env_dir: Path, port: int = 5173,
          model: str = "opus") -> agent.AgentResult:
    prepare_env(task, env_dir, port)
    return agent.run(PROMPT.format(port=port), cwd=Path(env_dir), model=model)


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 5173

    task = taskref.load(batch_root, ref)
    env_dir = Path("envs") / task.work_dir.name

    print(f"S4 build env: {task.ref} -> {env_dir} (port {port})")
    result = build(task, env_dir, port)
    print(result.text[-4000:])
    if result.cost_usd:
        print(f"\n[{result.turns} turns, ${result.cost_usd:.2f}]")
    sys.exit(0 if result.ok else 1)
