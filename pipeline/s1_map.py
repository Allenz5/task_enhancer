"""S1 -- mapping. The first stage of the second layer.

propose -> validate -> improve, until the validator accepts.

The old S1 designed an interface from scratch for every task. That is what made the
generated environments look invented: a product category guessed per task, a layout
guessed per task, nothing anchored to anything real. This one does not design. A skeleton
has already been cloned from a real reference product, once for its whole bucket, and
this stage only decides **how this task's input lands in it**: which file fills which
entity, which column fills which slot, what interaction has to be performed to reach it,
and what stays on disk because the real product has nowhere to put it.

That last part is the point. The skeleton is the fixed thing. If a file will not fit the
slots a real product actually has, the answer is `disposition: file`, not a new page --
bending the skeleton to swallow the input throws away the fidelity the whole bucket
exercise bought.

The agent works from the staged `input/` directly. Nothing digests it first: these
archives hold spreadsheets, Word documents, CSVs with Chinese filenames, CAD drawings and
whole source trees, and any summary computed ahead of time would be a template.
"""

from __future__ import annotations

import json
from pathlib import Path

import agent
import s2_validate_map
import skeletons
import taskref

MAX_ROUNDS = 4

PROPOSE_PROMPT = """\
Map this task's input onto an existing **skeleton** -- a running application already
cloned from a real product.

This task's input currently sits in files, which makes it solvable from a terminal. Your
job is to decide how much of it should instead have to be *earned* by working through the
skeleton's interface -- searching, filtering, paging, opening detail surfaces, exporting.

You are **not designing an interface**. The skeleton is fixed and was measured against a
real product. You are deciding what goes in which of its existing slots.

## Read first

- `task_card.json` -- the task itself. `taskPrompt` says what is asked, `agentMustDo`
  lists the requirements, `inputFiles` describes some inputs. Treat `inputFiles` as
  commentary, not a manifest: it does not always list everything that shipped.
- `input/` -- the staged input, exactly as it arrived. **{n_files} files:**
{file_list}

**Open them. All of them.** Do not infer content from a filename -- across this batch the
same role appears under many names, and the names are not reliable. A `records.json` is a
flat list in one task and deeply nested in another.

- `{schema_path}` -- the schema your output must satisfy

Write your mapping to **`{mapping_path}`**.

## The skeleton you are mapping onto

{skeleton_block}

## First decide whether this task is a candidate at all

Some inputs do not belong behind this interface. A bundled source repository to be
repaired is a codebase, not data to look up. Input whose shape has nothing to do with what
this product holds does not become a better benchmark by being forced into it.

If that is the case, write `{{"candidate": false, "reason": "..."}}` and stop. That is a
real answer, not a failure.

## Then place every file

`data_placement` must account for **every** file under `input/`, exactly once:

- **`file`** -- stays on disk as it is. Give a `reason`. A validation contract, a method
  dictionary, a checksum manifest, a ten-megabyte source tree: leaving these alone is the
  honest choice. **A file that has no home among the skeleton's slots belongs here.** That
  is the designed outcome, not a shortfall.
- **`gui`** -- obtainable only by working through the application. Then give:
  - `entity` -- which of the skeleton's entities it becomes
  - `slots` -- `{{"<skeleton field>": "<column/key in the source>"}}`, field by field
  - `rows` -- how many records it becomes
  - `page` -- where it is visible (a page id from the list above)
  - `modality` -- what the agent must actually do to obtain it
  - `path` -- the sequence of actions that reaches it, in the skeleton's own vocabulary

Fill the structural fields. They are what makes the skeleton's own pages work -- keys,
foreign keys, the fields its filters and status columns read. If the task's data has no
column for one of them, you must still say what it is populated with.

## Task-specific fields

Where an entity is marked as accepting them, put the task's own measurement columns in
`custom_fields` -- this is how the real product is extended, so it is not a distortion.
Name what they replace in `dropped_fields`. Where an entity is a fixed field set, extra
columns are not an option: those go to `disposition: file`.

## Changing the skeleton

Almost never. If you must, add an entry to `skeleton_changes` and cite in `allowed_by`
the clause of the skeleton's own `layer2_contract.allowed` that permits it. Anything you
cannot cite is not allowed -- design a placement around it, or leave the data on disk.

## Budget

`budget.min_actions` / `max_actions`: how many GUI actions retrieving all the `gui`
content should take. Too few and the environment adds no work; too many and it degenerates
into tedium.
"""

IMPROVE_PROMPT = """\
The validator rejected your mapping:

{report}

Fix `mapping.json` and stop. Change only what the report names. Do not widen the mapping
to make a check pass -- if the honest answer is that a file has no home in this skeleton,
say so with `disposition: "file"` and a reason.
"""


def _validate(task: taskref.Task, staged: list[str]) -> tuple[bool, str]:
    path = task.work_dir / "mapping.json"
    if not path.exists():
        return False, "  FAIL  mapping.json was not written"
    try:
        mapping = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return False, f"  FAIL  mapping.json is not valid JSON: {e}"
    rep = s2_validate_map.validate(mapping, staged)
    return rep.ok, rep.render()


def _choose(task: taskref.Task, bucket: str | None) -> skeletons.Skeleton | None:
    """Which skeleton this task maps onto.

    An explicit bucket wins. Otherwise the corpus already carries a classification for
    this task, so use it rather than asking the agent to re-derive a category the whole
    `cluster/` exercise exists to have settled.
    """
    if bucket:
        return skeletons.load(bucket)
    slug = lookup_slug(task.task_id)
    if slug:
        sk = skeletons.for_slug(slug)
        if sk:
            print(f"  slug {slug!r} -> skeleton {sk.bucket!r}")
            return sk
        print(f"  slug {slug!r} has no skeleton built yet")
    return None


ASSIGNMENT = Path("cluster/final/assignment_full.csv")


def lookup_slug(task_id: str) -> str | None:
    if not ASSIGNMENT.exists():
        return None
    import csv

    with ASSIGNMENT.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("custom_id") == task_id:
                return row.get("slug") or None
    return None


def synthesize(task: taskref.Task, bucket: str | None = None, model: str = "opus") -> bool:
    sk = _choose(task, bucket)
    if sk is None:
        print("no skeleton covers this task -- build one for its bucket first "
              "(see skeletons/HOWTO.md), or pass a bucket explicitly")
        return False

    schema = Path("schemas/mapping.schema.json").resolve()
    files = task.input_files()
    listing = "\n".join(
        f"    {name}  ({(task.input_dir / name).stat().st_size:,} bytes)" for name in files
    )

    prompt = PROPOSE_PROMPT.format(
        n_files=len(files),
        file_list=listing,
        schema_path=schema,
        mapping_path=(task.work_dir / "mapping.json").resolve(),
        skeleton_block=skeletons.describe(sk),
    )
    res = agent.run(prompt, cwd=task.work_dir, model=model,
                    allowed_dirs=[schema.parent, sk.path.resolve()])
    if not res.ok:
        print(f"proposer failed: {res.text[:400]}")
        return False

    for round_no in range(1, MAX_ROUNDS + 1):
        ok, report = _validate(task, files)
        if ok:
            print(f"round {round_no}: ACCEPTED")
            print(report)
            return True

        print(f"round {round_no}: rejected")
        print("  " + report.replace("\n", "\n  ")[:1200])
        if round_no == MAX_ROUNDS:
            print(f"\nexhausted {MAX_ROUNDS} rounds -- discard and resample with a new seed")
            return False

        res = agent.run(IMPROVE_PROMPT.format(report=report), cwd=task.work_dir,
                        model=model, allowed_dirs=[schema.parent, sk.path.resolve()])
        if not res.ok:
            print(f"  improver failed: {res.text[:400]}")
            return False

    return False


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    bucket = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        task = taskref.load(batch_root, ref, refresh=True)
    except taskref.TaskNotEnhanceable as e:
        print(f"not enhanceable: {e}")
        sys.exit(2)

    print(f"S1 mapping: {task.ref}")
    print(f"  {len(task.input_files())} input files staged in {task.input_dir}")
    sys.exit(0 if synthesize(task, bucket) else 1)
