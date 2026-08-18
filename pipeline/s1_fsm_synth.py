"""S1 -- FSM synthesis.

propose -> validate -> improve, until the validator accepts.

The FSM is where richness comes from, so the proposer is deliberately under-constrained:
it is given the data, the schema and a set of examples explicitly framed as inspiration
rather than a menu, and is pushed to invent acquisition modalities beyond them. What it
is *not* free to do is produce something incoherent, and that is what validation is for.

Two forces work against the mode collapse that open-ended generation drifts into:

  * a per-run seed that picks an unfamiliar product genre
  * the pool of FSMs already synthesised, handed to the proposer as shapes to avoid

Validation is two-sided. S2 checks structure programmatically -- coverage, reachability,
walkable paths, budget. A critic agent then checks what structure cannot express: whether
the barriers are real or decorative, and whether the environment actually suits the task.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import agent
import s2_fsm_validate

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

A task's input data currently sits in a file, which makes the task solvable from a
terminal. Your job is to design an application in which that same data can only be
obtained by interacting: searching, filtering, paginating, expanding, exporting,
hovering, drilling in.

Read these first:

- `task.md` — what the task asks for
- `facts.json` — which values are answer-critical. `role: payload` means the value is
  consumed by the answer; `role: selection` means it decides whether a record is in the
  answer set at all.
- `input/` — the corpus
- `{schema_path}` — the schema your output must satisfy

Write your design to **`fsm.json`** in this directory.

## What makes this good

**Every answer-critical fact must be earned.** For each one, decide what interaction
stands between the agent and the value, then encode that in `fact_acquisition`. The
`states[].visible_data` field is a two-sided contract: it says what is legible in that
state, and by omission what must never appear there. Use it to state plainly that the
list does not carry the column, that the summary omits the field.

**Vary how facts are earned.** A single mechanism repeated is a weak environment. Some
shapes, purely as inspiration — you are expected to go past this list and to combine
several within one environment:

  a value that exists only in a downloaded export · a value that only appears on hover ·
  values scattered one per detail page so a total must be assembled piece by piece ·
  a field inside a section that starts collapsed · results that only exist after a form
  is submitted · a figure legible only from a chart · data split across two applications
  that must be cross-referenced · a record reachable only by sorting or paging to it ·
  a value rendered to canvas rather than text

Pick what genuinely suits *this* task's data. If the answer needs an aggregate, scattering
the datapoints is apt. If it needs one field of one record, burying that record behind a
search is apt. If it needs the whole dataset, an export flow is apt. Relevance beats
novelty: an interaction that has nothing to do with the shape of the data is just friction.

**Make the barriers real, not decorative.** If a value is legible on an earlier screen,
the interaction that supposedly earns it is theatre. Check each fact: is there any state
before its acquisition state where it would plausibly be rendered? If so, say so in that
state's `visible_data` and design around it.

**Be a real product.** Give it a name and a coherent concept. Include chrome that has
nothing to do with the task — widgets, banners, unrelated tabs — via `noise_plan`.

## This run

Seed: **{seed}**. Lean toward {genre}, unless the data genuinely resists it.

{prior_block}

## Budget

Set `budget.min_actions` and `budget.max_actions` around your honest estimate of the
actions needed to collect every answer-critical fact. The lower bound is what makes the
environment worth testing; the upper bound is what stops it from becoming a test of
patience rather than capability. Paging through twenty-five screens is not difficulty.

## Rules

- Describe **what** must be true, never **how** to build it. No selectors, no DOM
  structure, no component or framework choices — those belong to the coding agent, and
  constraining them is what makes environments look alike.
- Do not put concrete data values or the task's answer anywhere in `fsm.json`. Refer to
  records by index or by predicate.
- Every path in `fact_acquisition` must chain: each action's `from` has to be where the
  previous action left you, and the last one must land in the declared state.
"""

CRITIQUE_PROMPT = """\
Review `fsm.json` in this directory against `task.md`, `facts.json` and the corpus in
`input/`. Structure has already been machine-checked — paths chain, every fact is
covered, every state is reachable. Do not re-check those.

Judge the things structure cannot express:

1. **Are the barriers real?** For each fact, is there an earlier state whose
   `visible_data` would plausibly include it? A duration hidden behind a hover is
   decorative if the list it came from shows a duration column.
2. **Does the environment suit the task?** The interactions should fall where the task's
   own work falls. Friction unrelated to the shape of the data is padding.
3. **Is one mechanism doing all the work?** If every fact is earned the same way, the
   environment tests one skill repeatedly.
4. **Is it a coherent product?** Would the states plausibly belong to one real
   application?
5. **Is anything unbuildable or self-contradictory?**

Write your verdict to `_critique.json`:

```json
{{"accept": true, "issues": [{{"severity": "blocking|minor", "issue": "...", "fix": "..."}}]}}
```

Set `accept` false only for issues that genuinely undermine the environment. A design
that is sound but not to your taste is an accept. Be concrete: name the state or fact.
"""

IMPROVE_PROMPT = """\
`fsm.json` in this directory was rejected. Revise it in place.

{report}

Fix the causes rather than the symptoms, and keep the parts that were working — this is
a revision, not a rewrite. The same rules still hold: describe what must be true and not
how to build it, keep concrete data values and the answer out of the file, and make sure
every acquisition path chains from the initial state to its declared state.
"""


def _prior_block(task_id: str, limit: int = 8) -> str:
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
        "different product genre and a different combination of acquisition modalities:\n"
        + "\n".join(lines)
    )


def _leak_check(task_dir: Path) -> list[str]:
    """The FSM travels to the coding agent, so a value written into it would leak."""
    fsm_text = (task_dir / "fsm.json").read_text()
    facts = json.loads((task_dir / "facts.json").read_text())
    corpus = json.loads((task_dir / facts["input_file"]).read_text())

    suspicious = set()
    for rec in corpus:
        for k, v in rec.items():
            if isinstance(v, str) and len(v) >= 8:
                suspicious.add(v)
    for v in facts["baseline_answer"].values():
        suspicious.add(str(v))

    return [f"concrete data value {v!r} appears in fsm.json" for v in suspicious if str(v) in fsm_text]


def _record_in_pool(task_dir: Path) -> None:
    fsm = json.loads((task_dir / "fsm.json").read_text())
    POOL.parent.mkdir(parents=True, exist_ok=True)
    with POOL.open("a") as f:
        f.write(json.dumps({
            "task_id": fsm["meta"]["task_id"],
            "domain": fsm["meta"]["domain"],
            "app_concept": fsm["meta"]["app_concept"].split("--")[0].strip(),
            "modalities": sorted({g["modality"] for g in fsm["fact_acquisition"]}),
            "n_states": len(fsm["states"]),
        }) + "\n")


def _validate(task_dir: Path, model: str) -> tuple[bool, str]:
    """S2 structure first (free), then the critic (not free)."""
    if not (task_dir / "fsm.json").exists():
        return False, "fsm.json was never written."

    try:
        rep = s2_fsm_validate.validate(task_dir)
    except Exception as e:
        return False, f"fsm.json could not be validated -- it may be malformed: {e}"

    leaks = _leak_check(task_dir)
    if not rep.ok or leaks:
        problems = rep.errors + leaks
        return False, "## Structural problems\n\n" + "\n".join(f"- {p}" for p in problems)

    res = agent.run(CRITIQUE_PROMPT, cwd=task_dir, model=model)
    crit_path = task_dir / "_critique.json"
    if not res.ok or not crit_path.exists():
        return True, "critic unavailable; accepted on structure alone"

    crit = json.loads(crit_path.read_text())
    crit_path.unlink()
    blocking = [i for i in crit.get("issues", []) if i.get("severity") == "blocking"]
    if crit.get("accept") and not blocking:
        return True, rep.render()

    return False, "## Design problems\n\n" + "\n".join(
        f"- {i['issue']}\n  suggested fix: {i.get('fix', 'n/a')}" for i in blocking or crit.get("issues", [])
    )


def synthesize(task_dir: Path, seed: int | None = None, model: str = "opus") -> bool:
    task_dir = Path(task_dir)
    seed = seed if seed is not None else random.randrange(10**6)
    rng = random.Random(seed)
    schema = Path("schemas/fsm.schema.json").resolve()
    task_id = task_dir.name

    prompt = PROPOSE_PROMPT.format(
        schema_path=schema,
        seed=seed,
        genre=rng.choice(GENRE_SEEDS),
        prior_block=_prior_block(task_id),
    )
    res = agent.run(prompt, cwd=task_dir, model=model, allowed_dirs=[schema.parent])
    if not res.ok:
        print(f"proposer failed: {res.text[:400]}")
        return False

    for round_no in range(1, MAX_ROUNDS + 1):
        ok, report = _validate(task_dir, model)
        if ok:
            print(f"round {round_no}: ACCEPTED")
            print(report)
            _record_in_pool(task_dir)
            return True

        print(f"round {round_no}: rejected")
        print("  " + report.replace("\n", "\n  ")[:1200])
        if round_no == MAX_ROUNDS:
            print(f"\nexhausted {MAX_ROUNDS} rounds -- discard and resample with a new seed")
            return False

        res = agent.run(IMPROVE_PROMPT.format(report=report), cwd=task_dir, model=model,
                        allowed_dirs=[schema.parent])
        if not res.ok:
            print(f"  improver failed: {res.text[:400]}")
            return False

    return False


if __name__ == "__main__":
    import sys

    task_dir = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else None
    print(f"S1 FSM synthesis: {task_dir} (seed {seed})")
    sys.exit(0 if synthesize(task_dir, seed) else 1)
