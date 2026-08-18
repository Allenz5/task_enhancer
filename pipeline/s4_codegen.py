"""S4 -- Code synthesis.

The coding agent receives the FSM, the style DSL, the noise plan and the corpus, and
produces two artifacts in one pass:

  1. the GUI application
  2. ground_truth.spec.ts -- a Playwright script that walks the FSM paths and actually
     *earns* every answer-critical fact through the declared modality

The script is written by the same agent that built the DOM because acquisition
modalities are free-form: "expand a tab, hit export, parse the CSV" or "collect thirty
datapoints scattered across as many detail pages" cannot be mechanically expanded from
an FSM template, and only the author of those interactions knows how to walk them.

What keeps the script honest as a verification artifact is a separation, not a
restriction: it may encode *how to reach* a value but never the value itself. Expected
values are read from data.json at runtime, so there is nowhere to hardcode an answer.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import agent

DEFAULT_STYLE = {
    "layout_dsl": ["Sidebar-Left", "Top-Breadcrumb", "Dense-Table", "Light-Theme"],
    "reference_products": ["Buildkite", "CircleCI"],
    "design_tokens": {
        "palette": "cool neutral greys with a single saturated accent for status",
        "typography": "compact sans-serif UI stack, tabular numerals in tables",
        "density": "high -- dense rows, tight vertical rhythm",
        "components": "flat cards with 1px borders, subtle hover states, pill-shaped status chips",
    },
}

PROMPT = """\
You are building a **GUI environment for an agent benchmark**. A task whose input data
used to sit in a JSON file must become a task where the data can only be earned by
interacting with a web application.

Everything you need is in this directory:

- `fsm.json` — the contract you must satisfy (read it fully)
- `facts.json` — which values are answer-critical
- `style.json` — visual direction
- `server/data.json` — the corpus. **The single source of truth for every value.**

## What you must build

### 1. The application

A runnable web app under this directory that presents the corpus as the product
described in `fsm.json` → `meta.app_concept`.

`fsm.json` → `states[].visible_data` is a **two-sided** contract. It says what a user
standing in that state can see, and by omission what that surface must **not** reveal.
If a state says duration is not a column, then no view reachable at that point may
render it — not in a tooltip, not in a `title=`, not in a data attribute, not in the
JSON the page fetches for that view. The whole point of this environment is that facts
are contingent on interaction; a value leaking onto an earlier surface silently
destroys the task.

`fsm.json` → `fact_acquisition` tells you, per group of facts, the modality through
which it must be earned. Implement those faithfully — an export really downloads a
file, a tooltip really requires hover, a collapsed section really starts collapsed.

### 2. `ground_truth.spec.ts`

A Playwright spec that plays the role of a competent agent solving the task: it walks
the paths in `fact_acquisition` and genuinely acquires every answer-critical fact
through its declared modality — parsing the downloaded CSV, hovering to read the
tooltip, opening each detail surface in turn, expanding the collapsed section.

It must then assert every acquired value against `server/data.json`, **loaded at
runtime**.

> **The one inviolable rule: never type a data value into any file you write.**
> Not into the app, not into the spec, not into a fixture. Every value — every
> duration, sha, branch, status, id — is read from `server/data.json` at runtime.
> The app serves it from there; the spec reads it from there to build its expectations.
> A hardcoded value makes the spec worthless as verification, because it would then be
> asserting against you rather than against the data.

Finally, have the spec reconstruct the task's answer from what it collected
(`total_failed_duration_sec`, `longest_failure_commit_sha`) and write it to
`ground_truth_answer.json` in this directory. That file proves the environment is
solvable, and it is checked against the task's original, untouched verifier.

## Runtime contract

- `npm install && npm start` serves the app on **port {port}** (honour `$PORT`).
- `npx playwright test` runs the spec against a server already listening on that port.
- Downloads must land somewhere the spec can read.
- Serving must be stateless enough that a fresh start reproduces identical results.

## Where you are free

Layout, visual design, component structure, framework, page count, copy, iconography,
extra navigation, and the chrome listed in `fsm.json` → `noise_plan`.

`style.json` carries the visual direction, and `style.json` → `reference_shots` lists
screenshots of **real products in this domain**. Open them and look before you write any
CSS. They are there for what prose cannot carry: how tight the rows actually are, how
little colour real software uses, how much chrome surrounds the content, where borders
are simply absent. Build something that would sit convincingly alongside them.

Take the visual language, not the identity — these are fictional products, so no real
product's name, logo or wordmark belongs in what you build.

Density, polish and incidental detail are wanted: the environment should be visually
convincing enough that finding data in it is genuine work.

Any delay you simulate must be deterministic and bounded, and the spec must wait on an
explicit ready signal rather than sleeping.

Keep the stack boring and dependency-light so it starts reliably: Node + Express and a
no-build frontend is a good default. Do not add a build step you do not need.

## Done means

`npm start` runs, `npx playwright test` passes, and `ground_truth_answer.json` matches
the answer implied by `server/data.json`. Verify this yourself before finishing.
"""


def prepare_env(task_dir: Path, env_dir: Path, port: int, style: dict | None = None) -> None:
    """Stage the inputs the coding agent works from."""
    task_dir, env_dir = Path(task_dir), Path(env_dir)
    (env_dir / "server").mkdir(parents=True, exist_ok=True)

    # S3's output if it ran, the built-in direction otherwise.
    if style is None and (task_dir / "style.json").exists():
        style = json.loads((task_dir / "style.json").read_text())

    # The captured references travel with it. A rendered interface carries density and
    # restraint that a token list does not, so the agent is later told to look at these.
    staged_shots = []
    for src in (style or {}).get("reference_shots", []):
        src = Path(src)
        if src.exists():
            (env_dir / "refs").mkdir(exist_ok=True)
            shutil.copy(src, env_dir / "refs" / src.name)
            staged_shots.append(f"refs/{src.name}")
    if style is not None:
        style = {**style, "reference_shots": staged_shots}

    fsm = json.loads((task_dir / "fsm.json").read_text())
    facts = json.loads((task_dir / "facts.json").read_text())

    shutil.copy(task_dir / fsm.get("input_file", facts["input_file"]), env_dir / "server" / "data.json")
    (env_dir / "fsm.json").write_text(json.dumps(fsm, indent=2))

    # The agent needs to know which facts matter, but not the baseline answer --
    # that would let it shortcut the environment it is supposed to be building.
    (env_dir / "facts.json").write_text(json.dumps({
        k: v for k, v in facts.items() if k != "baseline_answer"
    }, indent=2))
    (env_dir / "style.json").write_text(json.dumps(style or DEFAULT_STYLE, indent=2))


def build(task_dir: Path, env_dir: Path, port: int = 5173, model: str = "opus") -> agent.AgentResult:
    prepare_env(task_dir, env_dir, port)
    return agent.run(PROMPT.format(port=port), cwd=env_dir, model=model)


if __name__ == "__main__":
    import sys

    task_dir = Path(sys.argv[1])
    env_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("envs") / task_dir.name
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 5173

    print(f"S4 codegen: {task_dir} -> {env_dir} (port {port})")
    result = build(task_dir, env_dir, port)
    print(result.text[-4000:])
    if result.cost_usd:
        print(f"\n[{result.turns} turns, ${result.cost_usd:.2f}]")
    sys.exit(0 if result.ok else 1)
