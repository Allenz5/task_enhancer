# noisegen

Surround one task's data with fabricated records, so that retrieving the right data
through the interface takes judgement.

An environment that holds only the task's own records is not much of an exercise:
whatever the application shows *is* the answer set. Noise makes the retrieving agent
decide **which** records the task is about. It must never make them unobtainable.

## The contract

> **Noise must never make any field value of a task record ambiguous.**

Noise goes *beside* the task's data, never mixed into it: it lives in partition values the
task does not occupy, never claims to be the same real-world record as a task row, never
attaches to a parent record the task occupies, and nothing is ever written onto a task row.

Two rows disagreeing about the same real-world thing would destroy the task. Two rows
about different things that both look plausible are the whole point.

## Three steps

| | who | what |
|---|---|---|
| 1 `plan.py` | agent | reads `skeleton.json` and the task's rows; writes `noise_plan.json` (counts, partitions, separability) and `filler.task.py` (the generator: value rules for numbers, dates, ids, foreign keys, and the prompts for text) |
| 2 `generate.py` | code | runs the generator per entity in declaration order, verifies with `checks.py`, composes `store/<entity>.json` and `store/noise.manifest.json` |
| 3 `review.py` | agent | reads the filled store and judges what the checks cannot: contradictions, tells, boundary leaks, and whether the task's rows can still be selected at all |

Step 2 contains no decisions, only execution -- which is what lets a rerun at the same
seed reproduce the store byte for byte. Numbers come from `random.Random(seed)`; text
comes from `textgen.text()`, which caches every request in `store/text_cache.json`.

`run.py` drives the three, feeding failures from either the checks or the review back into
step 1, which rewrites the generator. K=3.

## Running

```bash
python3 envgen/noisegen/run.py <env> [seed]        # all three steps

python3 envgen/noisegen/plan.py     <env>          # or one at a time
python3 envgen/noisegen/generate.py <env> [seed]
python3 envgen/noisegen/review.py   <env>
```

`plan.py` is skipped by `run.py` when `noise_plan.json` and `filler.task.py` already
exist, so a hand-edited generator can be re-run without being overwritten.

## What an env looks like

```
<env>/
  skeleton.json           the bucket's contract
  mapping.json            optional; `custom_fields` and `budget` are read from it
  noise_plan.json         step 1
  filler.task.py          step 1
  textgen.py              copied in by step 2
  noise_review.json       step 3
  store/
    .task/<entity>.json   the task's rows, frozen on the first run, never written again
    noise/<entity>.json   what the generator produced
    <entity>.json         .task + noise -- what the application serves
    text_cache.json       every text request, so a rerun is identical
    noise.manifest.json   counts, noise keys, partitions used, failures
```

## The generator's contract

```
python3 filler.task.py --entity <name> --n <int> --seed <int> --out <path>
```

Writes a JSON array. Run once per entity in the order `skeleton.json` declares them, so a
child entity can read `store/noise/<parent>.json` and attach real foreign keys to it.

Text values come from the helper:

```python
from textgen import text
titles = text("jobName", "<what these values are, what domain, what register>", 40)
```

A text field exposed in a **list** view is read 30 rows at a time, so it needs one distinct
value per row. A text field that appears only in a **detail** view is read one row at a
time, so a pool of blocks assembled per row is enough -- and keeps the cost flat as `n`
grows.

## What `checks.py` enforces

1. no noise row shares an entity's `identity` fields with a task row
2. no noise row's `partition` value is one the task occupies, or one the plan did not declare
3. no noise row carries a foreign key held by a task row, and none dangles
4. every value of a field with an `enum` is inside that enum
5. **populated-column parity** -- a field populated on most task rows is populated on the
   noise too, and a field empty on task rows is empty on the noise. A column filled on one
   side only turns the judgement into a lookup
6. keys present and unique across task rows plus noise
7. a text field the task's own rows barely repeat stays about as varied across the
   noise. Fields the task repeats -- a city, a grade -- are filter dimensions and are
   left alone
8. the task's rows are byte-identical to the frozen snapshot

## Limits

- The generator is written per task, so its vocabulary is as wide as one agent session
  made it. Repetition is checked only where it shows: fields on a list view.
- `textgen` calls the model directly, so the first run of a large `n` is slow. Later runs
  hit the cache.
- Step 3 judges the data, not the interface. Whether the retrieval path itself works is
  `ground_truth.spec.ts`'s job.
