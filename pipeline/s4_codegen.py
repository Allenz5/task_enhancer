"""S4 -- Code synthesis.

The coding agent receives the FSM, the retrieved style and the staged input, and
produces two artifacts in one pass:

  1. the GUI application
  2. ground_truth.spec.ts -- a Playwright script that walks the declared paths and
     actually retrieves every GUI-placed input through its declared modality

The script is written by the same agent that built the DOM because modalities are
free-form: "expand a tab, hit export, parse the CSV" or "collect thirty pieces scattered
across as many detail surfaces" cannot be mechanically expanded from an FSM template,
and only the author of those interactions knows how to walk them.

What keeps the script honest is a separation, not a restriction: it may encode *how to
reach* content but never the content itself. Expectations are read from `input/` at
runtime, so there is nowhere to hardcode an answer.

The script proves data fidelity and solvability without knowing anything about the
task's answer. That matters -- these tasks are graded on a set of delivered artifacts by
their own evaluator, not on a single value, so there is no answer for a spec to
reconstruct. What can be established is that everything placed in the interface really
is retrievable from it, unchanged.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import agent
import taskref

DEFAULT_STYLE = {
    "provenance": "not retrieved -- S3 did not run for this task",
    "layout_dsl": ["Sidebar-Left", "Top-Breadcrumb", "Dense-Table", "Light-Theme"],
    "design_tokens": {
        "palette": "cool neutral greys with a single saturated accent for status",
        "typography": "compact sans-serif UI stack, tabular numerals in tables",
        "density": "high -- dense rows, tight vertical rhythm",
        "components": "flat cards with 1px borders, subtle hover states, pill-shaped chips",
    },
}

PROMPT = """\
You are building a **GUI environment for an agent benchmark**. This task's input used to
sit in files, which made it solvable from a terminal. Part of that input must now be
obtainable only by working through a web application.

Everything you need is in this directory:

- `fsm.json` — the contract you must satisfy. Read it fully.
- `input/` — the staged input, exactly as it shipped. **The single source of truth.**
- `style.json` — the visual direction, and what real software this data would come from.

## What you must build

### 1. The application

A runnable web app in this directory presenting the content as the product described in
`fsm.json` → `meta.app_concept`.

`fsm.json` → `data_placement` says what goes where. Entries with `disposition: "gui"`
must be obtainable **only** through the interface, divided as `split` describes and
earned through the interaction `modality` describes — an export really downloads a file,
a tooltip really requires hover, a collapsed section really starts collapsed.

Entries with `disposition: "file"` are not yours to render. Leave them alone; they stay
on disk for the agent to read directly.

`fsm.json` → `states[].visible_data` is a **two-sided** contract. It says what a user
standing in that state can see, and by omission what that surface must **not** reveal.
If a state says a field is not a column, then no view reachable at that point may render
it — not in a tooltip, not in a `title=`, not in a data attribute, not in the JSON the
page fetches for that view. The whole point is that content is contingent on
interaction; a value leaking onto an earlier surface silently destroys the environment.

### 2. `ground_truth.spec.ts`

A Playwright spec that plays a competent agent: for every `gui` placement it walks the
declared path and genuinely retrieves the content through its declared modality —
parsing the downloaded file, hovering to read the tooltip, opening each surface in turn,
expanding the collapsed section.

It must then assert what it retrieved against the corresponding file in `input/`,
**read at runtime**. Retrieved content must match the original: same values, same
structure, nothing dropped, nothing invented. Where the interface necessarily reformats
(a number rendered with a thousands separator, a date shown in a display format), assert
the parsed value rather than the raw string, and say in a comment why the transform is
lossless.

> **The one inviolable rule: never type a data value into any file you write.**
> Not into the app, not into the spec, not into a fixture. Every value is read from
> `input/` at runtime. The app serves from there; the spec reads from there to build its
> expectations. A hardcoded value makes the spec worthless as verification, because it
> would then be asserting against you rather than against the data.

Also assert the **negative** side of the contract: that content is genuinely absent from
the surfaces `visible_data` says must not carry it, including the payloads those surfaces
fetch.

Finally have the spec write `ground_truth_retrieval.json` in this directory: one entry
per `gui` placement recording its source, the path it walked, how many pieces it
retrieved, and that they matched. That file is the environment's proof of solvability.

Do not try to solve the benchmark task itself. Whether the task's own answer is correct
is graded elsewhere by machinery you are not part of, and it is not your concern. Your
concern is that everything placed in the interface can be retrieved from it, unchanged.

## Runtime contract

- `npm install && npm start` serves the app on **port {port}** (honour `$PORT`).
- `npx playwright test` runs the spec against a server already listening on that port.
- Downloads must land somewhere the spec can read.
- Serving must be stateless enough that a fresh start reproduces identical results.
- Any delay you simulate must be deterministic and bounded, and the spec must wait on an
  explicit ready signal rather than sleeping.

## Where you are free

Layout, visual design, component structure, framework, page count, copy, iconography,
extra navigation, and the chrome listed in `fsm.json` → `noise_plan`.

`style.json` → `provenance` says what real system this data would come from, and
`reference_shots` lists screenshots of it. **Open them and look before you write any
CSS.** They carry what prose cannot: how tight the rows actually are, how little colour
real software uses, how much chrome surrounds the content, where borders are simply
absent. Build something that would sit convincingly alongside them, and borrow the
domain's vocabulary — the labels and units a practitioner would expect.

Take the visual language, not the identity: no real product's name, logo or wordmark.

Density, polish and incidental detail are wanted — the environment should be convincing
enough that finding content in it is genuine work.

Keep the stack boring and dependency-light so it starts reliably: Node + Express and a
no-build frontend is a good default. Do not add a build step you do not need.

## Done means

`npm start` runs, `npx playwright test` passes, and `ground_truth_retrieval.json`
accounts for every `gui` placement in `fsm.json`. Verify this yourself before finishing.
"""


def prepare_env(task: taskref.Task, env_dir: Path, style: dict | None = None) -> None:
    """Stage what the coding agent works from."""
    env_dir = Path(env_dir)
    env_dir.mkdir(parents=True, exist_ok=True)

    # The input lands verbatim. Nothing is normalised, merged or converted on the way
    # in -- these archives carry spreadsheets, drawings and bundled source trees, and
    # reshaping any of it would be inventing data.
    shutil.copytree(task.input_dir, env_dir / "input", dirs_exist_ok=True)
    shutil.copy(task.work_dir / "fsm.json", env_dir / "fsm.json")

    if style is None and (task.work_dir / "style.json").exists():
        style = json.loads((task.work_dir / "style.json").read_text(encoding="utf-8"))
    style = style or DEFAULT_STYLE

    # The captured references travel with it; a rendered interface carries density and
    # restraint that a token list does not.
    staged_shots = []
    for src in style.get("reference_shots", []):
        src = Path(src)
        if src.exists():
            (env_dir / "refs").mkdir(exist_ok=True)
            shutil.copy(src, env_dir / "refs" / src.name)
            staged_shots.append(f"refs/{src.name}")
    style = {**style, "reference_shots": staged_shots}

    (env_dir / "style.json").write_text(
        json.dumps(style, indent=2, ensure_ascii=False), encoding="utf-8")


def build(task: taskref.Task, env_dir: Path, port: int = 5173,
          model: str = "opus") -> agent.AgentResult:
    prepare_env(task, env_dir)
    return agent.run(PROMPT.format(port=port), cwd=Path(env_dir), model=model)


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 5173

    task = taskref.load(batch_root, ref)
    env_dir = Path("envs") / task.work_dir.name

    print(f"S4 codegen: {task.ref} -> {env_dir} (port {port})")
    result = build(task, env_dir, port)
    print(result.text[-4000:])
    if result.cost_usd:
        print(f"\n[{result.turns} turns, ${result.cost_usd:.2f}]")
    sys.exit(0 if result.ok else 1)
