"""Step 1 -- the agent decides what noise to add, and writes the generator that makes it.

Two artefacts, in one session. `noise_plan.json` records the decisions: how many rows per
entity, which partitions they live in, what makes them separable from the task's own
records. `filler.task.py` is the generator that carries those decisions out -- the value
rules for numbers, dates, ids and foreign keys, and the prompts for the text fields.

Splitting the plan out from the script is not bookkeeping. The plan is cheap and can be
checked before a single row is generated, and it is what step 3 reads to know what the
noise was *supposed* to be.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import agent                                  # noqa: E402  envgen/agent.py
import generate                               # noqa: E402

PROMPT = """\
Add fabricated records to this environment, around the task's own data.

The application in this directory holds one benchmark task's real data. On its own that
data is trivially retrievable: whatever the interface shows *is* the answer set. Your job
is to surround it with other records, so that an agent working through the interface has
to decide **which** records the task is about.

## The one contract

**Noise must never make any field value of a task record ambiguous.**

The retrieving agent should have to exercise judgement to select the right records. It
must never be unable to obtain them. So noise is added *beside* the task's data, never
mixed into it:

- noise rows live in partition values the task does not occupy -- they read as another
  city's jobs, another folder's runs, another quarter's cases
- a noise row never claims to be the same real-world record as a task row (the entity's
  `identity` fields)
- a noise row never attaches to an entity the task occupies -- it brings its own parent
  records rather than borrowing the task's
- nothing is ever written onto a task row. Not one field.

Two rows that disagree about the same real-world thing would destroy the task. Two rows
about different things that both look plausible are exactly the point.

## Read first

- `skeleton.json` -- the contract. `entities.*.fields` (types, `enum`), `key`,
  `identity`, `partition`, and `views`. **`views` matters most**: a field's `exposes`
  placement decides whether it is read 30 rows at a time or one at a time.
- `store/.task/<entity>.json` -- the task's records, frozen. **Read these, not
  `store/<entity>.json`**: on a rewrite the latter already holds the noise from the
  previous attempt. Read them properly; the noise has to be in the same domain, the same
  value ranges, the same vocabulary.
- `mapping.json` if present -- `custom_fields` are task-specific fields added to the
  skeleton. Noise rows must populate them too, or an empty column marks the noise.
- `textgen.py` -- the text helper your generator will call.
- `filters` in `skeleton.json` -- the interface's filter drop-downs. A noise value outside
  those option sets is unreachable, or worse, adds a rogue option.

Do not read `input/`. The task's staged input is not yours; work from `store/.task/`.

## Write `noise_plan.json`

```json
{
  "entities": {
    "<entity>": {
      "n": 320,
      "task_partitions": ["<values the task occupies>"],
      "noise_partitions": ["<values the noise will occupy, disjoint from the above>"],
      "grouping": "how the noise is organised, in one line",
      "separability": "why no task field value becomes ambiguous",
      "text_fields": ["<fields whose values come from textgen>"],
      "value_rules": "how numbers, dates and ids are derived, in one line"
    }
  },
  "judgment_required": "what the retrieving agent must work out in order to select the task's records"
}
```

Choose `n` yourself, from the task's own size and the list views' `page_size`. Enough that
the task's rows do not simply fill the first page; not so many that retrieval becomes
page-turning drudgery. Say why in `grouping`.

## Write `filler.task.py`

```
python3 filler.task.py --entity <name> --n <int> --seed <int> --out <path>
```

It writes a JSON array of records to `--out`. It is run once per entity, in the order
`skeleton.json` declares them, so a child entity can read the parent's noise from
`store/noise/<parent>.json` and attach real foreign keys to it. Read the task's own rows
from `store/.task/<entity>.json`, never from `store/<entity>.json`.

**Division of labour.** The script computes what a script can compute -- numbers, dates,
ids, keys, foreign keys, enum choices, and the arrangement of everything into rows. Text
values come from the helper:

```python
from textgen import text
titles = text("jobName", "<what these values are, what domain, what register>", 40)
```

`text()` returns that many distinct English strings and caches them, so a rerun with the
same seed reproduces the store exactly. Follow that: every random draw goes through
`random.Random(seed)`, and nothing calls `datetime.now()`, `uuid4()` or an unseeded
`random`. Two runs at the same seed must be byte-identical.

How much text to ask for, and how to spend it:

- a text field exposed in a **list** view is read 30 rows at a time. Ask `text()` for one
  distinct value per row.
- a text field that appears only in a **detail** view is read one row at a time. Ask for a
  pool of blocks -- say 8 openers, 8 bodies, 6 closers -- and have the script assemble
  them per row. This is what keeps the cost flat as `n` grows.
- assembled text must not contradict the row's own structured fields. A description that
  says "5+ years" on an entry-level row is a defect.

## What will be checked mechanically after you finish

Write the generator so these pass. They are checked, not trusted:

1. no noise row shares an entity's `identity` fields with a task row
2. no noise row's `partition` value is one the task occupies, or one the plan did not declare
3. no noise row carries a foreign key held by a task row, and none dangles
4. every value of a field with an `enum` is inside that enum
5. **no drop-down option belongs to the task alone** -- a filterable dimension value that
   only task rows carry is a one-click answer. Partitions are exempt: that one is the
   selection criterion. Everything else the noise must also use
6. **populated-column parity**: a field populated on most task rows must be populated on
   the noise too, and a field empty on task rows must be empty on the noise. A column
   filled on one side only turns the judgement into a lookup
7. keys are present and unique across task rows plus noise
8. a text field the task's own rows barely repeat stays about as varied across the
   noise -- a list view shows 30 rows at once, and a small text pool shows there
9. the rows are enough to fill more than one page of every list view
10. the task's rows are byte-identical to what they were before you ran

## Done means

`noise_plan.json` and `filler.task.py` exist, the generator runs for every entity in the
plan, and you believe all eight checks pass. Do not run the generator for the full counts
yourself if that would be slow -- a small `--n` smoke run is enough to prove it executes.
"""

IMPROVE = """\
The generated noise failed these checks:

{failures}

Fix `filler.task.py`, and `noise_plan.json` where the plan itself was wrong. Change only
what the failures name. Do not lower `n` to dodge a check, and do not write anything onto
the task's rows.

Every `[blocking]` one has to be fixed. Fix the `[cosmetic]` ones too where doing so
cannot put a blocking one back.
"""


def plan(env: Path, model: str = "opus", failures: list[str] | None = None) -> agent.AgentResult:
    env = Path(env)
    generate.stage_textgen(env)
    # Freeze the task's rows before the agent sees them: from the second attempt on,
    # store/<entity>.json is task + last attempt's noise, and only the snapshot is clean.
    generate.snapshot(env, json.loads((env / "skeleton.json").read_text(encoding="utf-8")))
    prompt = (IMPROVE.format(failures="\n".join(f"- {f}" for f in failures))
              if failures else PROMPT)
    return agent.run(prompt, cwd=env, model=model)


if __name__ == "__main__":
    env = Path(sys.argv[1])
    result = plan(env)
    print(result.text[-4000:])
    if result.cost_usd:
        print(f"\n[{result.turns} turns, ${result.cost_usd:.2f}]")
    ok = result.ok and (env / "noise_plan.json").exists() and (env / "filler.task.py").exists()
    if result.ok and not ok:
        print("\nplan: agent finished but noise_plan.json / filler.task.py is missing")
    sys.exit(0 if ok else 1)
