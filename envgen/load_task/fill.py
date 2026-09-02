"""S4 -- fill. Surround the task's records with fabricated ones, without touching the answer.

The skeleton's own `filler.py` does the generating; this drives it and checks the result.
The filler is given the task's records as exemplars, so what it makes is in the same
domain, value range and vocabulary. Two rules are then verified here, not trusted:

  identity    a filler record never equals a task record on the entity's identity fields
  partition   a filler record never lands in a partition value the task occupies

The second is what keeps the task's answer unchanged: however the task selects its rows
(by status, by date, by predicate the pipeline does not know), rows in another partition
are outside that selection. In the interface they read as somebody else's data.

Cosmetic fields (`fill: cosmetic` in skeleton.json) may be copied from generated records
onto task records that lack them. Nothing else is written onto a task record.

Everything added is written to store/filler.manifest.json so the verifier can exclude it.

Filler interface (a script the skeleton ships as filler.py):
    python3 filler.py --entity <name> --n <count> --spec <json> --exemplars <json>
                      --avoid <json> --exclude-partition <json> --seed <int>
    -> JSON array of records on stdout
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


def norm(v) -> str:
    s = "" if v is None else (" ".join(map(str, v)) if isinstance(v, list) else str(v))
    return re.sub(r"[\s\W_]+", "", s).lower()


def identity_of(row: dict, fields: list[str]) -> tuple:
    return tuple(norm(row.get(f)) for f in fields)


def fill_entity(env: Path, spec: dict, ename: str, target: int, seed: int) -> dict:
    ent = spec["entities"][ename]
    store = env / "store" / f"{ename}.json"
    task_rows = json.loads(store.read_text(encoding="utf-8"))
    key = ent["key"]
    ident = ent.get("identity") or [key]
    part = ent.get("partition")
    n_new = max(0, target - len(task_rows))
    report = {"task_rows": len(task_rows), "added_keys": [], "cosmetic_filled": {}, "rejected": 0}

    if n_new == 0 and not any(m.get("fill") == "cosmetic" for m in ent["fields"].values()):
        return report

    avoid = [dict(zip(ident, identity_of(r, ident))) for r in task_rows]
    used_keys = {norm(r[key]) for r in task_rows}
    used_parts = sorted({r.get(part) for r in task_rows if part and r.get(part) is not None})

    cmd = [sys.executable, str(env / "filler.py"), "--entity", ename, "--n", str(max(n_new, 8)),
           "--spec", json.dumps(ent, ensure_ascii=False),
           "--exemplars", json.dumps(task_rows[:50], ensure_ascii=False),
           "--avoid", json.dumps(avoid, ensure_ascii=False),
           "--exclude-partition", json.dumps(used_parts, ensure_ascii=False),
           "--seed", str(seed)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if out.returncode != 0:
        raise RuntimeError(f"filler.py failed for {ename}: {out.stderr[-2000:]}")
    generated = json.loads(out.stdout)

    task_ident = {identity_of(r, ident) for r in task_rows}
    accepted = []
    for g in generated:
        if norm(g.get(key)) in used_keys:
            report["rejected"] += 1; continue
        if identity_of(g, ident) in task_ident:
            report["rejected"] += 1; continue
        if part and g.get(part) in used_parts:
            report["rejected"] += 1; continue
        used_keys.add(norm(g.get(key)))
        accepted.append(g)

    # cosmetic fields: copy onto task rows that lack them
    cosmetic = [f for f, m in ent["fields"].items() if m.get("fill") == "cosmetic"]
    if cosmetic and accepted:
        for i, r in enumerate(task_rows):
            src = accepted[i % len(accepted)]
            filled = []
            for f in cosmetic:
                if (r.get(f) in (None, "", [])) and src.get(f) not in (None, "", []):
                    r[f] = src[f]; filled.append(f)
            if filled:
                report["cosmetic_filled"][str(r[key])] = filled

    added = accepted[:n_new]
    report["added_keys"] = [g[key] for g in added]
    store.write_text(json.dumps(task_rows + added, ensure_ascii=False, indent=1), encoding="utf-8")
    return report


def fill(env: Path, targets: dict | None = None, seed: int = 0) -> dict:
    spec = json.loads((env / "skeleton.json").read_text(encoding="utf-8"))
    mapping_path = env / "mapping.json"
    mapping = json.loads(mapping_path.read_text(encoding="utf-8")) if mapping_path.exists() else {}
    targets = {**(spec.get("fill") or {}), **(mapping.get("fill") or {}), **(targets or {})}

    manifest = {"seed": seed, "entities": {}}
    for i, ename in enumerate(spec["entities"]):
        t = targets.get(ename)
        if t is None:
            continue
        manifest["entities"][ename] = fill_entity(env, spec, ename, t, seed + i)
    (env / "store" / "filler.manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    env = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    m = fill(env, seed=seed)
    print(f"fill: {env}")
    for e, r in m["entities"].items():
        print(f"  {e:<12} task {r['task_rows']:>4}  +{len(r['added_keys']):<4} "
              f"cosmetic on {len(r['cosmetic_filled'])}  rejected {r['rejected']}")
