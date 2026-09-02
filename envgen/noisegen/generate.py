"""Step 2 -- run the generator the planning agent wrote, and check what came out.

There is no decision in this step. The entity order, the counts, the value rules and the
text prompts were all settled in step 1 and are sitting in `filler.task.py` and
`noise_plan.json`; here they are executed. That is what lets a rerun with the same seed
reproduce the same store: numbers come from the seed, text comes from the cache.

Entities are generated in the order `skeleton.json` declares them, because a generator
for a child entity reads the parent's noise rows to attach its foreign keys -- the same
ordering rule the skeletons' own fillers already rely on.

The task's own rows are snapshotted once, into `store/.task/`, and are never written to
again. Every run rebuilds `store/<entity>.json` as snapshot + noise, so running twice
does not append twice.
"""

from __future__ import annotations

import json
import random
import shutil
import subprocess
import sys
from pathlib import Path

import checks

HERE = Path(__file__).resolve().parent
TIMEOUT = 3600.0


def stage_textgen(env: Path) -> None:
    """The generator imports `textgen`, so it has to sit beside it in the env."""
    shutil.copy(HERE / "textgen.py", env / "textgen.py")


def snapshot(env: Path, spec: dict) -> dict[str, list]:
    """Freeze the task's rows on first run; read them back on every later run."""
    task_dir = env / "store" / ".task"
    task_dir.mkdir(parents=True, exist_ok=True)
    rows = {}
    for ename in spec["entities"]:
        frozen, live = task_dir / f"{ename}.json", env / "store" / f"{ename}.json"
        if not frozen.exists():
            if live.exists():
                shutil.copy(live, frozen)
            else:
                # The task fills no rows here; the entity is still the skeleton's, and
                # noise may be planned for it.
                frozen.write_text("[]", encoding="utf-8")
        rows[ename] = json.loads(frozen.read_text(encoding="utf-8"))
    return rows


def run_generator(env: Path, ename: str, n: int, seed: int) -> list[dict]:
    out = env / "store" / "noise" / f"{ename}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [sys.executable, "filler.task.py", "--entity", ename, "--n", str(n),
         "--seed", str(seed), "--out", str(out.relative_to(env))],
        cwd=str(env), capture_output=True, text=True, timeout=TIMEOUT)
    if proc.returncode != 0:
        raise RuntimeError(f"filler.task.py failed for {ename}:\n"
                           f"{(proc.stderr or proc.stdout)[-3000:]}")
    if not out.exists():
        raise RuntimeError(f"filler.task.py wrote no {out.relative_to(env)} for {ename}")
    rows = json.loads(out.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise RuntimeError(f"filler.task.py: {ename} output is not a JSON array")
    return rows


def generate(env: Path, seed: int = 0) -> dict:
    """Generate, verify, and compose the store. Returns a report; never raises on a check."""
    env = Path(env)
    spec = json.loads((env / "skeleton.json").read_text(encoding="utf-8"))
    plan = json.loads((env / "noise_plan.json").read_text(encoding="utf-8"))
    mapping_file = env / "mapping.json"
    budget = (json.loads(mapping_file.read_text(encoding="utf-8")).get("budget")
              if mapping_file.exists() else None)

    stage_textgen(env)
    task_rows = snapshot(env, spec)
    before = {e: checks.rows_hash(r) for e, r in task_rows.items()}

    # Reset the store to the task's rows before generating. On a second attempt it still
    # holds the first attempt's noise, and a generator that reads a sibling entity would
    # otherwise build on top of records that are about to be thrown away.
    for ename, rows in task_rows.items():
        (env / "store" / f"{ename}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    noise_rows: dict[str, list] = {}
    failures: list[str] = []
    for i, ename in enumerate(spec["entities"]):          # declaration order: parents first
        n = ((plan.get("entities") or {}).get(ename) or {}).get("n", 0)
        if not n:
            continue
        try:
            noise_rows[ename] = run_generator(env, ename, n, seed + i)
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            failures.append(str(exc))
            noise_rows[ename] = []

    failures += checks.run_checks(spec, plan, task_rows, noise_rows, before, budget)

    # Merge, interleaved. Concatenating would put every task row at the head of an
    # unsorted list view, and the first page would hand over the answer set for free.
    for ename in task_rows.keys() | noise_rows.keys():
        task, noise = task_rows.get(ename, []), noise_rows.get(ename, [])
        composed = task + noise
        random.Random(f"{seed}:{ename}").shuffle(composed)
        (env / "store" / f"{ename}.json").write_text(
            json.dumps(composed, ensure_ascii=False, indent=1), encoding="utf-8")
        failures += checks.check_head_bias(
            spec, ename, composed, {checks.norm(r[spec["entities"][ename]["key"]]) for r in task})

    key_of = lambda e: spec["entities"][e]["key"]
    manifest = {
        "seed": seed,
        "ok": not failures,
        "entities": {
            e: {"task_rows": len(task_rows.get(e, [])),
                "noise_rows": len(rows),
                "noise_keys": [r.get(key_of(e)) for r in rows],
                "partition": spec["entities"][e].get("partition"),
                "noise_partitions": sorted(
                    {r.get(spec["entities"][e]["partition"]) for r in rows}
                    if spec["entities"][e].get("partition") else set())}
            for e, rows in noise_rows.items()},
        "failures": failures,
    }
    (env / "store" / "noise.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    env = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    report = generate(env, seed)
    for ename, r in report["entities"].items():
        print(f"  {ename:<14} task {r['task_rows']:>4}  noise {r['noise_rows']:>4}  "
              f"partitions {r['noise_partitions'][:4]}")
    if report["failures"]:
        print(f"\n{len(report['failures'])} failures:")
        for f in report["failures"]:
            print(f"  - {f}")
    sys.exit(0 if report["ok"] else 1)
