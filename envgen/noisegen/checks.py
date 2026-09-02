"""Mechanical checks on generated noise. Nothing here is trusted to the agent.

The contract the noise has to satisfy is one sentence: **noise must never make any field
value of a task record ambiguous.** The retrieving agent should have to work out *which*
records the task is about; it must never be unable to obtain the right ones.

That splits into checks a script can run. Noise lives in partitions the task does not
occupy, never claims to be the same real-world record as a task row, and never attaches
itself to an entity the task occupies. The remaining checks are about the noise not
giving itself away -- a column that is populated only on task rows, or only on noise
rows, turns the judgement into a lookup.
"""

from __future__ import annotations

import hashlib
import json
import math
import re

# A field is "populated" or not; parity is judged on those two rates, not on values.
PARITY_HIGH = 0.8      # task rows populate it this often ...
PARITY_LOW = 0.5       # ... so noise must too
PARITY_EMPTY = 0.2     # task rows never populate it, so noise must (almost) never either
VARIETY_TASK_MIN = 0.8   # only judge variety on fields the task's own rows barely repeat
VARIETY_RATIO = 0.5      # noise may repeat twice as readily as the task does, no more


def norm(v) -> str:
    s = "" if v is None else (" ".join(map(str, v)) if isinstance(v, list) else str(v))
    return re.sub(r"[\s\W_]+", "", s).lower()


def populated(v) -> bool:
    return v not in (None, "", [], {})


def identity_of(row: dict, fields: list[str]) -> tuple:
    return tuple(norm(row.get(f)) for f in fields)


def rows_hash(rows: list[dict]) -> str:
    return hashlib.sha256(
        json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _rate(rows: list[dict], field: str) -> float:
    return sum(populated(r.get(field)) for r in rows) / len(rows) if rows else 0.0


def _fk_fields(spec: dict, ename: str) -> dict[str, str]:
    """Fields on this entity that carry another entity's key -> that entity."""
    keys = {e["key"]: name for name, e in spec["entities"].items() if name != ename}
    return {f: keys[f] for f in spec["entities"][ename]["fields"] if f in keys}


def _list_views(spec: dict, ename: str) -> list[tuple[str, dict]]:
    return [(n, v) for n, v in spec["views"].items()
            if v["entity"] == ename and v["kind"] == "list"]


# --------------------------------------------------------------------------- checks

def check_plan(spec: dict, plan: dict) -> list[str]:
    bad = []
    entities = plan.get("entities") or {}
    if not entities:
        return ["plan: no entities"]
    for ename, p in entities.items():
        if ename not in spec["entities"]:
            bad.append(f"plan: unknown entity {ename!r}")
            continue
        if not isinstance(p.get("n"), int) or p["n"] < 0:
            bad.append(f"plan[{ename}]: n must be a non-negative integer")
        part = spec["entities"][ename].get("partition")
        if part:
            task_p = set(p.get("task_partitions") or [])
            noise_p = set(p.get("noise_partitions") or [])
            if not noise_p:
                bad.append(f"plan[{ename}]: no noise_partitions declared for partition {part!r}")
            overlap = task_p & noise_p
            if overlap:
                bad.append(f"plan[{ename}]: noise_partitions overlap task_partitions on {sorted(overlap)}")
    if not (plan.get("judgment_required") or "").strip():
        bad.append("plan: judgment_required is empty -- say what the retrieving agent must decide")
    return bad


def check_identity(spec: dict, ename: str, task: list[dict], noise: list[dict]) -> list[str]:
    ent = spec["entities"][ename]
    ident = ent.get("identity") or [ent["key"]]
    taken = {identity_of(r, ident) for r in task}
    hits = [r for r in noise if identity_of(r, ident) in taken]
    if hits:
        return [f"{ename}: {len(hits)} noise rows share identity {ident} with a task row "
                f"(first: {identity_of(hits[0], ident)})"]
    return []


def check_partition(spec: dict, ename: str, plan_ent: dict,
                    task: list[dict], noise: list[dict]) -> list[str]:
    part = spec["entities"][ename].get("partition")
    if not part:
        return []
    task_values = {r.get(part) for r in task if populated(r.get(part))}
    declared = set(plan_ent.get("noise_partitions") or [])
    bad = []
    inside = sorted({r.get(part) for r in noise if r.get(part) in task_values})
    if inside:
        bad.append(f"{ename}: noise rows land in task partitions {inside} on {part!r}")
    undeclared = sorted({r.get(part) for r in noise
                         if declared and r.get(part) not in declared})
    if undeclared:
        bad.append(f"{ename}: noise rows use undeclared {part!r} values {undeclared[:5]}")
    return bad


def check_foreign_keys(spec: dict, ename: str, task_rows: dict, noise_rows: dict) -> list[str]:
    bad = []
    for field, target in _fk_fields(spec, ename).items():
        task_keys = {norm(r.get(spec["entities"][target]["key"])) for r in task_rows.get(target, [])}
        noise_keys = {norm(r.get(spec["entities"][target]["key"])) for r in noise_rows.get(target, [])}
        borrowed, dangling = set(), set()
        for r in noise_rows.get(ename, []):
            v = norm(r.get(field))
            if not v:
                continue
            if v in task_keys:
                borrowed.add(r.get(field))
            elif v not in noise_keys:
                dangling.add(r.get(field))
        if borrowed:
            bad.append(f"{ename}.{field}: noise rows attach to task-owned {target} records "
                       f"{sorted(borrowed)[:5]} -- noise must bring its own")
        if dangling:
            bad.append(f"{ename}.{field}: {len(dangling)} noise rows point at no {target} record "
                       f"(first: {sorted(dangling)[0]!r})")
    return bad


def check_enums(spec: dict, ename: str, noise: list[dict]) -> list[str]:
    bad = []
    for field, meta in spec["entities"][ename]["fields"].items():
        allowed = meta.get("enum")
        if not allowed:
            continue
        seen = {r.get(field) for r in noise if populated(r.get(field))}
        off = sorted(v for v in seen if v not in set(allowed))
        if off:
            bad.append(f"{ename}.{field}: noise values outside the skeleton's enum {off[:5]}")
    return bad


def check_parity(spec: dict, ename: str, task: list[dict], noise: list[dict]) -> list[str]:
    """A column populated on one side only is a give-away, in either direction."""
    if not task or not noise:
        return []
    bad = []
    fields = set(spec["entities"][ename]["fields"]) | {k for r in task for k in r}
    for field in sorted(fields):
        t, n = _rate(task, field), _rate(noise, field)
        if t >= PARITY_HIGH and n < PARITY_LOW:
            bad.append(f"{ename}.{field}: populated on {t:.0%} of task rows but {n:.0%} of noise "
                       f"-- an empty cell would mark the noise")
        if t <= PARITY_EMPTY < n:
            bad.append(f"{ename}.{field}: empty on task rows ({t:.0%}) but populated on {n:.0%} "
                       f"of noise -- a filled cell would mark the noise")
    return bad


def _distinct(rows: list[dict], field: str) -> float:
    values = [norm(r.get(field)) for r in rows if populated(r.get(field))]
    return len(set(values)) / len(values) if values else 0.0


def check_list_variety(spec: dict, ename: str, task: list[dict], noise: list[dict]) -> list[str]:
    """Text shown 30 rows at a time has to differ row by row; detail text does not.

    Which fields those are is read off the task's own rows rather than declared. A field
    the task repeats -- a city, a grade, an industry -- is a filter dimension and is
    supposed to repeat. A field the task barely repeats is free text, and noise that
    repeats it is noise assembled from too small a pool.
    """
    if len(noise) < 10 or len(task) < 10:
        return []
    exposed = {f for _, v in _list_views(spec, ename) for f in v.get("exposes", [])}
    bad = []
    for field, meta in spec["entities"][ename]["fields"].items():
        if field not in exposed or meta.get("type") not in ("string", "text") or meta.get("enum"):
            continue
        task_ratio = _distinct(task, field)
        if task_ratio < VARIETY_TASK_MIN:
            continue
        noise_ratio = _distinct(noise, field)
        if noise_ratio < VARIETY_RATIO * task_ratio:
            bad.append(f"{ename}.{field}: {noise_ratio:.0%} distinct across noise rows against "
                       f"{task_ratio:.0%} on task rows, and it is shown in a list view "
                       f"-- repetition reads as generated")
    return bad


def check_keys(spec: dict, ename: str, task: list[dict], noise: list[dict]) -> list[str]:
    key = spec["entities"][ename]["key"]
    rows = task + noise
    missing = [r for r in noise if not populated(r.get(key))]
    if missing:
        return [f"{ename}: {len(missing)} noise rows have no {key}"]
    keys = [norm(r.get(key)) for r in rows]
    if len(set(keys)) != len(keys):
        dupes = sorted({k for k in keys if keys.count(k) > 1})
        return [f"{ename}: duplicate {key} across task+noise {dupes[:5]}"]
    return []


def check_volume(spec: dict, ename: str, task: list[dict], noise: list[dict],
                 budget: dict | None) -> list[str]:
    views = _list_views(spec, ename)
    if not views:
        return []
    total = len(task) + len(noise)
    bad = []
    for name, view in views:
        size = view.get("page_size") or total
        pages = math.ceil(total / size) if size else 1
        if pages < 2 and len(task) > 0:
            bad.append(f"{ename}: {total} rows fit on one page of {size} in view {name!r} "
                       f"-- no paging, so the noise costs the retrieving agent nothing")
        if budget and pages > budget.get("max_actions", 10 ** 6):
            bad.append(f"{ename}: {pages} pages exceeds budget.max_actions "
                       f"{budget['max_actions']}")
    return bad


def check_head_bias(spec: dict, ename: str, composed: list[dict],
                    task_keys: set[str]) -> list[str]:
    """Row order must not correlate with task-versus-noise.

    Partitioning the noise is what keeps the task answerable; it must not also be what
    orders the rows. Task rows concatenated ahead of the noise sit at the head of an
    unsorted list view, and taking the top of the first page returns the answer set with
    no filtering at all -- the noise then costs the retrieving agent nothing.
    """
    if not task_keys or len(composed) <= len(task_keys):
        return []
    key = spec["entities"][ename]["key"]
    share = len(task_keys) / len(composed)
    bad = []
    for name, view in _list_views(spec, ename):
        size = view.get("page_size")
        if not size or len(composed) <= size:
            continue
        head = sum(1 for r in composed[:size] if norm(r.get(key)) in task_keys)
        if head > max(2, 2 * size * share):
            bad.append(f"{ename}: {head} of the first {size} rows of view {name!r} are task "
                       f"rows, against {size * share:.1f} expected -- row order gives the "
                       f"answer away")
    return bad


def check_task_untouched(before: dict[str, str], task_rows: dict[str, list]) -> list[str]:
    bad = []
    for ename, digest in before.items():
        if rows_hash(task_rows.get(ename, [])) != digest:
            bad.append(f"{ename}: task rows were modified -- nothing may be written onto them")
    return bad


def run_checks(spec: dict, plan: dict, task_rows: dict[str, list],
               noise_rows: dict[str, list], before: dict[str, str],
               budget: dict | None = None) -> list[str]:
    """Every failure, as a line the planning agent can act on."""
    bad = check_plan(spec, plan) + check_task_untouched(before, task_rows)
    for ename in spec["entities"]:
        task, noise = task_rows.get(ename, []), noise_rows.get(ename, [])
        if not noise:
            continue
        plan_ent = (plan.get("entities") or {}).get(ename, {})
        bad += check_identity(spec, ename, task, noise)
        bad += check_partition(spec, ename, plan_ent, task, noise)
        bad += check_foreign_keys(spec, ename, task_rows, noise_rows)
        bad += check_enums(spec, ename, noise)
        bad += check_parity(spec, ename, task, noise)
        bad += check_list_variety(spec, ename, task, noise)
        bad += check_keys(spec, ename, task, noise)
        bad += check_volume(spec, ename, task, noise, budget)
    return bad
