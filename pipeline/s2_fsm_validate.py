"""S2 -- FSM validation. The cheap gate, run before any coding-agent tokens are spent.

It only catches what is genuinely fatal. It does not police topology, modality choice or
how much of the input was placed in the interface, since those are judgements S1 makes
and where richness is supposed to live.

  placement    every staged input file is accounted for, exactly once
  reachability every state is reachable from the initial state, no dangling edges
  no dead ends from anywhere reachable, everything still to collect stays reachable
  paths        every declared path chains on the action graph and lands where it claims
  budget       the estimated cost of collecting the GUI-placed content is within bounds
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path


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
    on the format, so it is not interpreted here; validating it would mean assuming a
    format, which is the thing this pipeline is meant not to do.
    """
    return source.split("#", 1)[0]


def _check_placement(fsm: dict, input_files: list[str], rep: Report) -> None:
    """Every staged file gets a decision, and no file gets two.

    Leaving a file on disk is a legitimate decision and needs no justification beyond a
    stated reason. What is not acceptable is a file nobody decided about: silence there
    means an input quietly vanished from the enhanced task.
    """
    placements = fsm.get("data_placement", [])
    if not placements:
        rep.errors.append("data_placement is empty: no input was accounted for")
        return

    placed: dict[str, int] = {}
    for p in placements:
        source = p.get("source")
        if not source:
            rep.errors.append("a placement has no source")
            continue
        placed[_source_file(source)] = placed.get(_source_file(source), 0) + 1

        if p.get("disposition") == "file" and not p.get("reason"):
            rep.errors.append(f"{source}: left as a file without a stated reason")

    unknown = sorted(set(placed) - set(input_files))
    if unknown:
        rep.errors.append(
            f"placements name files that were not staged: {', '.join(unknown[:5])}"
        )

    unplaced = sorted(set(input_files) - set(placed))
    if unplaced:
        rep.errors.append(
            f"{len(unplaced)} staged file(s) with no placement decision: "
            f"{', '.join(unplaced[:5])}"
        )

    doubled = sorted(f for f, n in placed.items() if n > 1)
    if doubled:
        rep.warnings.append(
            f"placed more than once (fine if the fragments differ): {', '.join(doubled[:5])}"
        )

    gui = [p for p in placements if p.get("disposition") == "gui"]
    if not gui:
        rep.errors.append("nothing is placed in the GUI, so there is no environment to build")

    for p in gui:
        for field in ("state", "path", "modality", "split"):
            if not p.get(field):
                rep.errors.append(f"{p.get('source')}: gui placement is missing {field}")

    rep.info["files placed"] = f"{len(placed)}/{len(input_files)} ({len(gui)} in GUI)"


def _check_no_shadow_copies(fsm: dict, input_dir: Path, rep: Report) -> None:
    """Content hidden behind the interface must not be readable from a file left on disk.

    These archives duplicate themselves: one task's `output_contract.json` embeds the
    whole of its `rules.json` under `input.policy_exact_value`. Placing `rules.json` in
    the GUI while leaving the contract on disk builds a barrier around something the
    agent can simply read, and every interaction guarding it is theatre.

    Whitespace-insensitive containment catches the case that matters -- one file carried
    verbatim inside another -- without parsing either, so it stays out of the business of
    assuming formats. Partial overlap is left to the critic.
    """
    placements = fsm.get("data_placement", [])
    on_disk = [_source_file(p["source"]) for p in placements
               if p.get("disposition") == "file" and p.get("source")]
    in_gui = [_source_file(p["source"]) for p in placements
              if p.get("disposition") == "gui" and p.get("source")]
    if not on_disk or not in_gui:
        return

    def squeeze(name: str) -> str | None:
        path = input_dir / name
        try:
            if path.stat().st_size > 5_000_000:
                return None
            return "".join(path.read_text(encoding="utf-8").split())
        except (UnicodeDecodeError, OSError):
            return None

    disk_text = {name: squeeze(name) for name in set(on_disk)}
    for hidden in set(in_gui):
        body = squeeze(hidden)
        if not body or len(body) < 24:
            continue
        for name, text in disk_text.items():
            if text and body in text:
                rep.errors.append(
                    f"{hidden} is placed in the GUI but its contents appear verbatim "
                    f"inside {name}, which is left on disk -- the barrier around it is "
                    "not real"
                )
                break


def _check_reachability(fsm: dict, rep: Report) -> None:
    states = {s["id"]: s for s in fsm.get("states", [])}
    initial = [s["id"] for s in fsm.get("states", []) if s.get("initial")]
    if len(initial) != 1:
        rep.errors.append(f"expected exactly one initial state, found {len(initial)}")
        return

    for a in fsm.get("actions", []):
        for end in ("from", "to"):
            if a[end] not in states:
                rep.errors.append(f"action {a['id']} references unknown state {a[end]!r}")

    adj: dict[str, list[str]] = {sid: [] for sid in states}
    for a in fsm.get("actions", []):
        if a["from"] in adj and a["to"] in states:
            adj[a["from"]].append(a["to"])

    seen = {initial[0]}
    q = deque(initial)
    while q:
        for nxt in adj[q.popleft()]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)

    orphans = sorted(set(states) - seen)
    if orphans:
        rep.errors.append(f"states unreachable from {initial[0]}: {', '.join(orphans)}")
    rep.info["states / actions"] = f"{len(states)} / {len(fsm.get('actions', []))}"


def _check_no_dead_ends(fsm: dict, rep: Report) -> None:
    """No state may strand the agent.

    Forward reachability from the initial state is not enough: a synthesised FSM readily
    produces one-way doors, where committing to a scope or drilling into a section has no
    edge back. Every target is still reachable from s0, so nothing looks wrong -- but an
    agent that explores before it commits can put itself somewhere the rest is
    permanently out of reach. That yields an environment solvable only by an agent that
    never explores, which penalises exactly the behaviour a benchmark should reward.
    """
    initial = next((s["id"] for s in fsm.get("states", []) if s.get("initial")), None)
    if initial is None:
        return

    adj: dict[str, set[str]] = {s["id"]: set() for s in fsm.get("states", [])}
    for a in fsm.get("actions", []):
        if a["from"] in adj:
            adj[a["from"]].add(a["to"])

    def reach(start: str) -> set[str]:
        seen, q = {start}, deque([start])
        while q:
            for nxt in adj.get(q.popleft(), ()):
                if nxt not in seen:
                    seen.add(nxt)
                    q.append(nxt)
        return seen

    targets = {p["state"] for p in fsm.get("data_placement", [])
               if p.get("disposition") == "gui" and p.get("state")}
    for state in sorted(reach(initial)):
        stranded = targets - reach(state)
        if stranded:
            rep.errors.append(
                f"entering {state!r} strands the agent: {', '.join(sorted(stranded))} "
                "can no longer be reached, so exploring before committing makes the "
                "task unsolvable"
            )


def _check_paths(fsm: dict, rep: Report) -> None:
    """Each declared path must actually be walkable on the action graph.

    A synthesised FSM will happily list a plausible-looking sequence of action ids that
    does not chain. Caught here it costs nothing; caught later it costs a coding-agent run.
    """
    initial = next((s["id"] for s in fsm.get("states", []) if s.get("initial")), None)
    by_id: dict[str, list[dict]] = {}
    for a in fsm.get("actions", []):
        by_id.setdefault(a["id"], []).append(a)

    for p in fsm.get("data_placement", []):
        if p.get("disposition") != "gui":
            continue
        label = p.get("source", "?")
        path = p.get("path") or []
        if not path:
            rep.errors.append(f"{label}: empty path -- available without any interaction")
            continue

        cur = initial
        for step, aid in enumerate(path):
            options = by_id.get(aid)
            if not options:
                rep.errors.append(f"{label}: unknown action {aid!r} at step {step}")
                cur = None
                break
            move = next((a for a in options if a["from"] == cur), None)
            if move is None:
                froms = ", ".join(sorted({a["from"] for a in options}))
                rep.errors.append(
                    f"{label}: action {aid!r} at step {step} starts from [{froms}] "
                    f"but the path is in {cur!r}"
                )
                cur = None
                break
            cur = move["to"]
        if cur is not None and cur != p.get("state"):
            rep.errors.append(
                f"{label}: path ends in {cur!r} but the content is declared to surface "
                f"in {p.get('state')!r}"
            )


def _estimate_cost(fsm: dict) -> int:
    """Estimated actions to collect everything placed in the GUI.

    Placements sharing a path prefix share that visit, so opening one surface and
    reading two things from it is costed once. Repeated placements are multiplied by a
    nominal piece count, since how many pieces a file holds is not known here.
    """
    gui = [p for p in fsm.get("data_placement", []) if p.get("disposition") == "gui"]
    paths = [tuple(p.get("path") or []) for p in gui]
    if not paths:
        return 0

    lcp = 0
    for col in zip(*paths):
        if len(set(col)) == 1:
            lcp += 1
        else:
            break

    buckets: dict[tuple, list[dict]] = {}
    for p in gui:
        buckets.setdefault(tuple((p.get("path") or [])[:-1]), []).append(p)

    total = lcp
    for prefix, group in buckets.items():
        repeats = 4 if any(p.get("repeat_per_piece") for p in group) else 1
        per_visit = max(0, len(prefix) - lcp) + len(group)
        total += per_visit * repeats
        if repeats > 1:
            total += repeats - 1
    return total


def validate(fsm: dict, input_files: list[str], input_dir: Path | None = None) -> Report:
    rep = Report()

    if fsm.get("candidate") is False:
        rep.info["candidate"] = f"no -- {fsm.get('reason', '(no reason given)')}"
        if not fsm.get("reason"):
            rep.errors.append("candidate is false but no reason was given")
        return rep

    _check_placement(fsm, input_files, rep)
    if input_dir is not None:
        _check_no_shadow_copies(fsm, Path(input_dir), rep)
    _check_reachability(fsm, rep)
    _check_no_dead_ends(fsm, rep)
    _check_paths(fsm, rep)

    cost = _estimate_cost(fsm)
    budget = fsm.get("budget") or {}
    lo, hi = budget.get("min_actions"), budget.get("max_actions")
    if lo is None or hi is None:
        rep.errors.append("budget.min_actions / budget.max_actions missing")
    else:
        rep.info["est. actions"] = f"{cost} (budget {lo}-{hi})"
        if cost < lo:
            rep.errors.append(f"estimated cost {cost} below min_actions {lo}: too little GUI work")
        if cost > hi:
            rep.errors.append(f"estimated cost {cost} above max_actions {hi}: degenerates into tedium")

    modalities = sorted({p["modality"] for p in fsm.get("data_placement", [])
                         if p.get("modality")})
    rep.info["modalities"] = f"{len(modalities)} distinct"
    for m in modalities:
        rep.info[f"  - {m}"] = ""
    return rep


if __name__ == "__main__":
    import sys

    work_dir = Path(sys.argv[1])
    fsm = json.loads((work_dir / "fsm.json").read_text(encoding="utf-8"))
    input_dir = work_dir / "input"
    files = sorted(str(p.relative_to(input_dir)) for p in input_dir.rglob("*") if p.is_file())

    rep = validate(fsm, files, input_dir)
    print(f"S2 validation: {work_dir}")
    print(rep.render())
    sys.exit(0 if rep.ok else 1)
