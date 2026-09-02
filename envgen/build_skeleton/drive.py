"""drive -- the build loop. The agent drives the skeleton it built and fixes what it finds.

Judged against description.md, not against the reference: the reference -> description
step is where fidelity was decided; this loop only checks that what was described was
built. Each round the agent extends `verify/walk.spec.ts` to cover more of the description,
runs it, and fixes app/ where the site falls short (or the spec where it misread the
description). This script then runs the spec and the probe itself; both must pass. K rounds,
then stop -- a skeleton that will not converge is rebuilt, not nursed.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENVGEN = HERE.parent
sys.path.insert(0, str(ENVGEN))
sys.path.insert(0, str(HERE))
import agent   # noqa: E402
import probe   # noqa: E402
from build import free_port, serve   # noqa: E402

MAX_ROUNDS = 5

PW_CONFIG = """\
import {{ defineConfig, devices }} from '@playwright/test';
const PORT = Number(process.env.PORT) || {port};
export default defineConfig({{
  testDir: './verify', testMatch: /walk\\.spec\\.ts/, workers: 1, reporter: [['list']],
  timeout: 90_000,
  use: {{ baseURL: `http://localhost:${{PORT}}`, viewport: {{ width: 1440, height: 900 }}, acceptDownloads: true }},
  webServer: {{ command: 'ENV_ROOT=. PORT=' + PORT + ' node {engine}',
               url: `http://localhost:${{PORT}}/api/health`, reuseExistingServer: true, timeout: 30_000 }},
  projects: [{{ name: 'chromium', use: {{ ...devices['Desktop Chrome'] }} }}],
}});
"""

PROMPT = """\
The skeleton in this directory is running at **{url}**. Drive it and fix it.

`description.md` is the specification. Your job this round: make the site do everything
the description says, and prove it with `verify/walk.spec.ts`.

## 1. Extend `verify/walk.spec.ts`

A Playwright spec (run with `npx playwright test`; config is already written) that walks
the site the way a person would: open each page, use each filter with an option the
description lists, sort, page to the last page and back, open a record from the list,
read its detail, run the export and parse it. Cover every page and interaction in
description.md sections 1 and 2. Expectations come from `store/*.json` **read at
runtime** -- never type a data value into the spec.

Also assert what must *not* be visible: a field the description puts only in the detail
must not appear in the list page's DOM nor in the JSON the list page fetched.

## 2. Run it, then fix what fails

`npx playwright test`. For each failure decide honestly which is wrong:
- the app does not do what the description says -> fix `app/`
- the spec misread the description -> fix the spec
- the description is silent -> pick the plainer behaviour, and add it to
  `skeleton.json` -> `deliberate_deviations` so it is on record

Do not fix a failure by exposing a field in a shallower view, by fetching more than the
view shows, or by hardcoding a value. Do not touch the engine.

## 3. Look

Take a screenshot of each page (`page.screenshot`) and compare with the images in
`reference/`. Fix layout, density and colour where they differ in ways the description
describes. Do not chase pixel identity; chase the description.

{diagnostics}

Stop when the spec passes. Report in one paragraph what you changed and what, if
anything, description.md describes that you could not make work.
"""


def run_spec(skel: Path, port: int) -> tuple[bool, str]:
    r = subprocess.run(["npx", "playwright", "test", "--reporter=line"], cwd=skel,
                       env={**os.environ, "PORT": str(port)}, capture_output=True, text=True, timeout=900)
    return r.returncode == 0, (r.stdout + r.stderr)[-6000:]


def drive(skel: Path, model: str = "opus") -> bool:
    if not (skel / "node_modules").exists():
        os.symlink(ENVGEN / "node_modules", skel / "node_modules")
    (skel / "verify").mkdir(exist_ok=True)
    port = free_port()
    (skel / "playwright.config.ts").write_text(
        PW_CONFIG.format(port=port, engine=ENVGEN / "engine" / "server.js"), encoding="utf-8")
    (skel / ".gitignore").write_text("node_modules\ntest-results/\n.server.log\n", encoding="utf-8")

    diagnostics = ""
    for round_no in range(1, MAX_ROUNDS + 1):
        print(f"round {round_no}")
        proc = serve(skel, port)
        try:
            res = agent.run(PROMPT.format(url=f"http://127.0.0.1:{port}", diagnostics=diagnostics),
                            cwd=skel, model=model, allowed_dirs=[ENVGEN])
        finally:
            proc.terminate(); proc.wait(timeout=5)
        if not res.ok:
            print(f"  agent failed: {res.text[:600]}"); return False
        print("  " + res.text[-800:].replace("\n", "\n  "))
        if res.cost_usd:
            print(f"  [{res.turns} turns, ${res.cost_usd:.2f}]")

        spec_ok, out = run_spec(skel, port)
        proc = serve(skel, port)
        try:
            fails, notes = probe.probe(skel, f"http://127.0.0.1:{port}")
        finally:
            proc.terminate(); proc.wait(timeout=5)
        print(f"  spec: {'PASS' if spec_ok else 'FAIL'}   probe: {'clean' if not fails else f'{len(fails)} leak(s)'}")
        if spec_ok and not fails:
            return True
        diagnostics = "## What the last run said\n\n```\n" + out + "\n```\n"
        if fails:
            diagnostics += "\nThe leak probe also found:\n" + "\n".join(f"- {f}" for f in fails) + "\n"
        if round_no == MAX_ROUNDS:
            print(f"exhausted {MAX_ROUNDS} rounds -- rebuild rather than nurse")
    return False


if __name__ == "__main__":
    sys.exit(0 if drive(Path(sys.argv[1])) else 1)
