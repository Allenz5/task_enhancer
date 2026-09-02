"""S2 -- mapping validation. The cheap gate, run before any coding-agent tokens are spent.

It checks what a mapping can be objectively wrong about, and nothing else. Which slot a
column belongs in, whether a task is worth enhancing at all, how much of the input
deserves to be behind the interface -- those are S1's judgements and are where the value
lives, so they are not policed here.

  placement    every staged input file is accounted for, exactly once
  skeleton     the named skeleton exists and loads
  slots        every slot a placement fills is really declared by that entity
  must_keep    no structural field was dropped or renamed away
  custom       extra fields only go on entities the skeleton says accept them
  changes      every skeleton change cites a clause of the skeleton's own contract
  budget       the declared action budget is present and sane
"""

from __future__ import annotations

import json
from pathlib import Path

import skeletons


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.info: dict = {}

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        lines = [f"  {k:<22} {v}" for k, v in self.info.items()]
        lines += [f"  WARN  {w}" for w in self.warnings]
        lines += [f"  FAIL  {e}" for e in self.errors]
        lines.append(f"  {'RESULT':<22} {'PASS' if self.ok else 'FAIL'}")
        return "\n".join(lines)


def _source_file(source: str) -> str:
    """The file part of a placement source, dropping any fragment.

    A fragment names a part of a file -- `records.json#/records`. What it means depends
    on the format, so it is not interpreted here.
    """
    return source.split("#", 1)[0]


def _check_placement(mapping: dict, input_files: list[str], rep: Report) -> None:
    """Every staged file gets a decision, and no file gets two.

    Leaving a file on disk is legitimate and needs no justification beyond a stated
    reason. What is not acceptable is a file nobody decided about: silence there means an
    input quietly vanished from the enhanced task.
    """
    placements = mapping.get("data_placement", [])
    if not placements:
        rep.errors.append("data_placement is empty: no input was accounted for")
        return

    seen: dict[str, int] = {}
    for p in placements:
        source = p.get("source")
        if not source:
            rep.errors.append("a placement has no source")
            continue
        f = _source_file(source)
        seen[f] = seen.get(f, 0) + 1
        if p.get("disposition") == "file" and not p.get("reason"):
            rep.errors.append(f"{source}: left as a file without a stated reason")

    for f, n in sorted(seen.items()):
        if f not in input_files:
            rep.errors.append(f"{f}: placed but not among the staged input files")
    for f in input_files:
        if f not in seen:
            rep.errors.append(f"{f}: staged but no placement decided about it")

    gui = [p for p in placements if p.get("disposition") == "gui"]
    rep.info["placement"] = f"{len(gui)} into the GUI, {len(placements) - len(gui)} left on disk"
    if not gui:
        rep.errors.append("nothing was placed in the GUI: the environment would add no work")


def _check_slots(mapping: dict, sk: skeletons.Skeleton, rep: Report) -> None:
    entities = sk.entities
    custom = mapping.get("custom_fields") or {}
    dropped = mapping.get("dropped_fields") or {}
    filled: dict[str, set[str]] = {}

    for p in mapping.get("data_placement", []):
        if p.get("disposition") != "gui":
            continue
        src = p.get("source", "?")
        ent_name = p.get("entity")
        if not ent_name:
            rep.errors.append(f"{src}: placed into the GUI but names no entity")
            continue
        ent = entities.get(ent_name)
        if ent is None:
            rep.errors.append(
                f"{src}: entity {ent_name!r} is not in skeleton {sk.bucket!r} "
                f"(has: {', '.join(entities)})")
            continue
        known = set(ent.fields) | {c["name"] for c in custom.get(ent_name, [])}
        for slot in (p.get("slots") or {}):
            if slot not in known:
                rep.errors.append(
                    f"{src}: slot {ent_name}.{slot} is not declared by the skeleton and "
                    f"is not in custom_fields")
        filled.setdefault(ent_name, set()).update(p.get("slots") or {})

        if p.get("page") and p["page"] not in {pg["id"] for pg in sk.pages}:
            rep.errors.append(f"{src}: page {p['page']!r} is not a page of this skeleton")

    for ent_name, keys in filled.items():
        ent = entities[ent_name]
        missing = [k for k in ent.must_keep if k not in keys]
        if missing:
            rep.warnings.append(
                f"{ent_name}: structural field(s) {', '.join(missing)} got no source column "
                f"-- they must still be populated, even if synthesised")

    for ent_name, fields in custom.items():
        ent = entities.get(ent_name)
        if ent is None:
            rep.errors.append(f"custom_fields names unknown entity {ent_name!r}")
            continue
        if not ent.custom_ok:
            rep.errors.append(
                f"custom_fields adds {len(fields)} field(s) to {ent_name!r}, but this "
                f"skeleton declares that entity as a fixed field set")
        for c in fields:
            if c["name"] in ent.must_keep:
                rep.errors.append(f"custom_fields redefines structural field {ent_name}.{c['name']}")

    for ent_name, names in dropped.items():
        ent = entities.get(ent_name)
        if ent is None:
            rep.errors.append(f"dropped_fields names unknown entity {ent_name!r}")
            continue
        for n in names:
            if n in ent.must_keep:
                rep.errors.append(f"dropped_fields drops structural field {ent_name}.{n}")
            elif n not in ent.fields:
                rep.warnings.append(f"dropped_fields names {ent_name}.{n}, which the skeleton does not have")

    n_custom = sum(len(v) for v in custom.values())
    rep.info["slots"] = f"{sum(len(v) for v in filled.values())} filled, {n_custom} task-specific added"


def _check_changes(mapping: dict, sk: skeletons.Skeleton, rep: Report) -> None:
    """Any change to the skeleton has to point at the clause that permits it.

    The whole reason skeletons exist is that per-task freedom is what made the previous
    generation of environments look invented. A change nobody can justify against the
    skeleton's own contract is that freedom coming back.
    """
    allowed = sk.contract.get("allowed") or []
    for ch in mapping.get("skeleton_changes") or []:
        cite = ch.get("allowed_by", "")
        if not any(cite and (cite in a or a in cite) for a in allowed):
            rep.errors.append(
                f"skeleton change {ch.get('what', '?')!r} cites {cite!r}, which is not one "
                f"of this skeleton's allowed changes")
    rep.info["skeleton changes"] = str(len(mapping.get("skeleton_changes") or []))


def validate(mapping: dict, input_files: list[str],
             root: Path = skeletons.SKELETON_ROOT) -> Report:
    rep = Report()

    if mapping.get("candidate") is False:
        rep.info["candidate"] = f"no -- {mapping.get('reason', '(no reason given)')}"
        if not mapping.get("reason"):
            rep.errors.append("candidate is false but no reason was given")
        return rep

    bucket = (mapping.get("skeleton") or {}).get("bucket")
    if not bucket:
        rep.errors.append("skeleton.bucket is missing: no skeleton was chosen")
        return rep
    try:
        sk = skeletons.load(bucket, root=root)
    except skeletons.SkeletonError as e:
        rep.errors.append(str(e))
        return rep
    rep.info["skeleton"] = f"{sk.bucket} ({sk.name})"
    if not (mapping.get("skeleton") or {}).get("why"):
        rep.errors.append("skeleton.why is missing: say why this data belongs to this product category")

    _check_placement(mapping, input_files, rep)
    _check_slots(mapping, sk, rep)
    _check_changes(mapping, sk, rep)

    budget = mapping.get("budget") or {}
    lo, hi = budget.get("min_actions"), budget.get("max_actions")
    if lo is None or hi is None:
        rep.errors.append("budget.min_actions / budget.max_actions missing")
    elif lo > hi:
        rep.errors.append(f"budget min_actions {lo} exceeds max_actions {hi}")
    else:
        rep.info["budget"] = f"{lo}-{hi} actions"

    return rep


if __name__ == "__main__":
    import sys

    work_dir = Path(sys.argv[1])
    mapping = json.loads((work_dir / "mapping.json").read_text(encoding="utf-8"))
    input_dir = work_dir / "input"
    files = sorted(str(p.relative_to(input_dir)) for p in input_dir.rglob("*") if p.is_file())

    rep = validate(mapping, files)
    print(f"S2 mapping validation: {work_dir}")
    print(rep.render())
    sys.exit(0 if rep.ok else 1)
