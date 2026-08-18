"""S1 -- FSM synthesis. The first stage.

propose -> validate -> improve, until the validator accepts.

The agent works from the staged `input/` directory directly. Nothing summarises the
data for it first: these archives hold JSON records, Markdown briefs, spreadsheets, Word
documents, CAD drawings, CSVs with Chinese filenames, and in places an entire bundled
source tree. Any digest computed ahead of time would be a template, and a template is
exactly what makes every generated environment look like the last one. So the agent
opens the files and sees what is actually there.

It decides three things: what belongs in the interface, how that content divides across
surfaces, and what is better left on disk. Not everything belongs in a GUI, and saying
so is a legitimate outcome -- as is concluding that the whole task is not a candidate.

Open-ended generation drifts into mode collapse on its own, so two forces push back: a
per-run seed that picks an unfamiliar product genre, and the pool of FSMs already
synthesised, handed to the proposer as shapes to avoid.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import agent
import s2_fsm_validate
import taskref

MAX_ROUNDS = 4
POOL = Path("refs/fsm_pool.jsonl")

GENRE_SEEDS = [
    "an internal admin console", "a monitoring and observability product",
    "a customer support desk", "a financial back-office system",
    "a laboratory information system", "a logistics and fleet tracker",
    "a content management system", "a data catalog and lineage browser",
    "a procurement and vendor portal", "an HR and staffing platform",
    "a security and compliance auditing tool", "a manufacturing MES console",
    "a clinical trial management system", "a media asset library",
    "an energy grid operations console", "a legal matter management system",
]

PROPOSE_PROMPT = """\
Design a **GUI environment specification** for an agent benchmark.

This task's input currently sits in files, which makes it solvable from a terminal. Your
job is to decide how much of that input should instead have to be *earned* by working
through an application — searching, filtering, paging, expanding, exporting, drilling in.

## Read first

- `task_card.json` — the task itself. `taskPrompt` says what is being asked, `agentMustDo`
  lists the requirements, `inputFiles` describes some of the inputs. Treat `inputFiles`
  as commentary, not a manifest: it does not always list everything that shipped.
- `input/` — the staged input, exactly as it arrived. **{n_files} files:**
{file_list}

**Open them. All of them.** Do not infer content from a filename — the same role appears
under many names across this batch, and the names are not reliable. A file called
`records.json` in one task is a flat list and in another is deeply nested; a `.xlsx`, a
`.docx`, a `.dxf` drawing or a bundled `.zip` source tree may be sitting there too. What
you design has to fit what is actually in these files.

- `{schema_path}` — the schema your output must satisfy

Write your design to **`{fsm_path}`**.

## First decide whether this task is a candidate at all

Some inputs do not belong behind an interface. A bundled source repository to be repaired
is a codebase, not data to look up; forcing it into a file browser would add clicking
without adding anything to measure.

If that is the case here, write `{{"candidate": false, "reason": "..."}}` and stop. That
is a real answer, not a failure. Otherwise set `"candidate": true` and continue.

## Then place every file

`data_placement` must account for **every** file under `input/`, exactly once, with one
of two dispositions:

- **`file`** — stays on disk as it is. Give a `reason`. A validation contract, a
  provenance manifest, a ten-megabyte source tree: leaving these alone is the honest
  choice, and there is no requirement to put everything in the interface.
- **`gui`** — obtainable only by working through the application. Then say **how it
  divides** (`split`) and **what interaction earns it** (`modality`), and give the
  `state` it becomes legible in and the `path` of actions that reaches it.

Let the content decide the division. A list of records suggests one piece per detail
surface; a single policy object suggests one settings screen; a spreadsheet suggests a
grid you must filter; a long document suggests something you page or search through.
Pick what suits *this* file. An interaction with nothing to do with the shape of the
content is just friction, and relevance beats novelty every time.

Mixing several modalities across one environment is much better than repeating one.

## Make the barriers real

`states[].visible_data` is a two-sided contract: it says what is legible in that state,
and by omission what that surface must never show. If a value is already readable on an
earlier screen, the interaction meant to earn it is decorative. Check each placement
against the states that precede it.

## Be a real product

Give it a name and a coherent concept, and include chrome that has nothing to do with
the task — widgets, banners, unrelated sections — via `noise_plan`.

Seed: **{seed}**. Lean toward {genre}, unless the input genuinely resists it.

{prior_block}

## Budget

Set `budget.min_actions` and `budget.max_actions` around your honest estimate of the
actions needed to collect everything placed in the GUI. The lower bound is what makes the
environment worth testing; the upper bound stops it becoming a test of patience. Paging
through twenty-five screens is not difficulty.

## Rules

- Describe **what** must be true, never **how** to build it. No selectors, no DOM
  structure, no component or framework choices.
- Do not put concrete data values, or the task's answer, anywhere in the FSM. Refer to
  content by file path, by position, or by predicate.
- Every `path` must chain: each action's `from` has to be where the previous one left
  you, and the last must land in the declared `state`.
- No one-way doors. From anywhere reachable, everything still to be collected must
  remain reachable — an environment only solvable by an agent that never explores
  punishes exactly the behaviour worth rewarding.
"""

CRITIQUE_PROMPT = """\
Review `fsm.json` against `task_card.json` and the real files in `input/`. Structure has
already been machine-checked — paths chain, every file is placed, every state is
reachable, no dead ends. Do not re-check those.

Judge what structure cannot express:

1. **Are the barriers real?** For each `gui` placement, is there an earlier state whose
   `visible_data` would plausibly already show it?
2. **Does the placement fit the content?** Open the files and check. A division that
   ignores how the content is actually organised will produce an awkward interface and
   arbitrary work.
3. **Are the `file` dispositions honest?** Leaving a contract or a source tree alone is
   right. Leaving something alone because placing it looked like effort is not.
4. **Is one mechanism doing all the work?** If everything is earned the same way, the
   environment tests one skill repeatedly.
5. **Is it a coherent product**, and is anything unbuildable or self-contradictory?

Write your verdict to exactly this path, and nowhere else:

**`{critique_path}`**


```json
{{"accept": true, "issues": [{{"severity": "blocking|minor", "issue": "...", "fix": "..."}}]}}
```

Set `accept` false only for issues that genuinely undermine the environment. A design
that is sound but not to your taste is an accept. Be concrete: name the state or file.
"""

IMPROVE_PROMPT = """\
`fsm.json` was rejected. Revise it in place.

{report}

Fix the causes rather than the symptoms, and keep what was working — this is a revision,
not a rewrite. The same rules hold: describe what must be true and not how to build it,
keep concrete data values out of the file, account for every file under `input/` exactly
once, and make sure every path chains from the initial state to its declared state.
"""


def _prior_block(limit: int = 8) -> str:
    if not POOL.exists():
        return "No environments have been synthesised yet, so nothing to avoid."
    seen = [json.loads(l) for l in POOL.read_text().splitlines() if l.strip()]
    if not seen:
        return "No environments have been synthesised yet, so nothing to avoid."
    lines = [
        f"  - {e['app_concept']} ({e['domain']}) — earned via: {', '.join(e['modalities'])}"
        for e in seen[-limit:]
    ]
    return (
        "Environments already synthesised. Do not reproduce these shapes — pick a "
        "different product genre and a different combination of modalities:\n"
        + "\n".join(lines)
    )


def _record_in_pool(fsm: dict) -> None:
    POOL.parent.mkdir(parents=True, exist_ok=True)
    modalities = sorted({p["modality"] for p in fsm.get("data_placement", [])
                         if p.get("modality")})
    with POOL.open("a") as f:
        f.write(json.dumps({
            "task_ref": fsm["meta"]["task_ref"],
            "domain": fsm["meta"]["domain"],
            "app_concept": fsm["meta"]["app_concept"].split("--")[0].strip(),
            "modalities": modalities,
            "n_states": len(fsm.get("states", [])),
        }, ensure_ascii=False) + "\n")


def _sweep_input(task: taskref.Task, expected: set[str]) -> list[str]:
    """Remove anything an agent left inside input/.

    The staged input is the task's, not ours, and agents write scratch files wherever
    they happen to be standing. One stray file there becomes a sixth input: it shows up
    in the placement check, and S4 would copy it into the environment as if it had
    shipped with the task.
    """
    strays = [name for name in task.input_files() if name not in expected]
    for name in strays:
        (task.input_dir / name).unlink()
    return strays


def _validate(task: taskref.Task, model: str, staged: set[str]) -> tuple[bool, str]:
    """S2 structure first (free), then the critic (not free)."""
    fsm_path = task.work_dir / "fsm.json"
    if not fsm_path.exists():
        return False, "fsm.json was never written."

    try:
        fsm = json.loads(fsm_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return False, f"fsm.json is not valid JSON: {e}"

    if fsm.get("candidate") is False:
        return True, f"not a candidate: {fsm.get('reason', '(no reason given)')}"

    strays = _sweep_input(task, staged)
    if strays:
        print(f"  swept {len(strays)} stray file(s) out of input/: {', '.join(strays)}")

    rep = s2_fsm_validate.validate(fsm, sorted(staged), task.input_dir)
    if not rep.ok:
        return False, "## Structural problems\n\n" + "\n".join(
            f"- {e}" for e in rep.errors)

    # Outside input/, and named explicitly: told only a filename, the critic once wrote
    # its verdict into the staged input, which would have shipped as a sixth input file.
    crit_path = (task.work_dir / "_critique.json").resolve()
    res = agent.run(CRITIQUE_PROMPT.format(critique_path=crit_path),
                    cwd=task.work_dir, model=model)
    if not res.ok or not crit_path.exists():
        why = res.text[:200] if not res.ok else "it wrote no verdict file"
        return True, (
            f"  WARN  the critic did not run ({why}); accepted on structure alone, "
            "so nothing checked whether the barriers are real\n" + rep.render()
        )

    crit = json.loads(crit_path.read_text(encoding="utf-8"))
    crit_path.unlink()
    blocking = [i for i in crit.get("issues", []) if i.get("severity") == "blocking"]
    if crit.get("accept") and not blocking:
        return True, rep.render()

    return False, "## Design problems\n\n" + "\n".join(
        f"- {i['issue']}\n  suggested fix: {i.get('fix', 'n/a')}"
        for i in blocking or crit.get("issues", []))


def synthesize(task: taskref.Task, seed: int | None = None, model: str = "opus") -> bool:
    seed = seed if seed is not None else random.randrange(10**6)
    rng = random.Random(seed)
    schema = Path("schemas/fsm.schema.json").resolve()

    files = task.input_files()
    staged = set(files)
    listing = "\n".join(
        f"    {name}  ({(task.input_dir / name).stat().st_size:,} bytes)" for name in files
    )

    prompt = PROPOSE_PROMPT.format(
        n_files=len(files),
        file_list=listing,
        schema_path=schema,
        fsm_path=(task.work_dir / "fsm.json").resolve(),
        seed=seed,
        genre=rng.choice(GENRE_SEEDS),
        prior_block=_prior_block(),
    )
    res = agent.run(prompt, cwd=task.work_dir, model=model, allowed_dirs=[schema.parent])
    if not res.ok:
        print(f"proposer failed: {res.text[:400]}")
        return False

    for round_no in range(1, MAX_ROUNDS + 1):
        ok, report = _validate(task, model, staged)
        if ok:
            print(f"round {round_no}: ACCEPTED")
            print(report)
            fsm = json.loads((task.work_dir / "fsm.json").read_text(encoding="utf-8"))
            if fsm.get("candidate") is not False:
                _record_in_pool(fsm)
            return True

        print(f"round {round_no}: rejected")
        print("  " + report.replace("\n", "\n  ")[:1200])
        if round_no == MAX_ROUNDS:
            print(f"\nexhausted {MAX_ROUNDS} rounds -- discard and resample with a new seed")
            return False

        res = agent.run(IMPROVE_PROMPT.format(report=report), cwd=task.work_dir,
                        model=model, allowed_dirs=[schema.parent])
        if not res.ok:
            print(f"  improver failed: {res.text[:400]}")
            return False

    return False


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else None

    try:
        task = taskref.load(batch_root, ref, refresh=True)
    except taskref.TaskNotEnhanceable as e:
        print(f"not enhanceable: {e}")
        sys.exit(2)

    print(f"S1 FSM synthesis: {task.ref} (seed {seed})")
    print(f"  {len(task.input_files())} input files staged in {task.input_dir}")
    sys.exit(0 if synthesize(task, seed) else 1)
