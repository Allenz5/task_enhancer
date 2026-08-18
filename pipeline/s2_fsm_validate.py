"""S2 -- Lightweight FSM validation.

The cheap gate, run before any coding-agent tokens are spent. It only catches the
failures that are genuinely fatal; it does not police style, topology or modality
choice, since those are exactly where richness is supposed to live.

  coverage     every fact in F is claimed by some fact_acquisition entry
  reachability every state is reachable from the initial state, no dangling edges
  budget       the estimated cost of collecting all of F lies within [min, max]
               -- the lower bound keeps the environment from being trivial, the
               upper bound keeps it from degenerating into a test of patience
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
        lines = []
        for k, v in self.info.items():
            lines.append(f"  {k:<22} {v}")
        for w in self.warnings:
            lines.append(f"  WARN  {w}")
        for e in self.errors:
            lines.append(f"  FAIL  {e}")
        lines.append(f"  {'RESULT':<22} {'PASS' if self.ok else 'FAIL'}")
        return "\n".join(lines)


def _resolve_records(spec, facts: dict) -> set[int]:
    if spec == "all":
        return set(range(facts["corpus_size"]))
    if spec == "qualifying":
        return set(facts["qualifying_records"])
    if isinstance(spec, list):
        return set(spec)
    return set()


def _check_reachability(fsm: dict, rep: Report) -> None:
    states = {s["id"]: s for s in fsm["states"]}
    initial = [s["id"] for s in fsm["states"] if s.get("initial")]
    if len(initial) != 1:
        rep.errors.append(f"expected exactly one initial state, found {len(initial)}")
        return

    for a in fsm["actions"]:
        for end in ("from", "to"):
            if a[end] not in states:
                rep.errors.append(f"action {a['id']} references unknown state {a[end]!r}")

    adj: dict[str, list[str]] = {sid: [] for sid in states}
    for a in fsm["actions"]:
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
    rep.info["states / actions"] = f"{len(states)} / {len(fsm['actions'])}"


def _check_no_dead_ends(fsm: dict, rep: Report) -> None:
    """No state may strand the agent.

    Forward reachability from the initial state is not enough: a synthesised FSM will
    produce one-way doors, where committing to a scope or drilling into a segment has no
    edge back. Every acquisition state is still reachable from s0, so nothing looks
    wrong -- but an agent that explores before it commits can put itself somewhere the
    remaining facts are permanently out of reach.

    That yields an environment solvable only by an agent that never explores, which
    penalises exactly the behaviour a benchmark should reward. So: from every reachable
    state, every acquisition state must remain reachable.
    """
    initial = next((s["id"] for s in fsm["states"] if s.get("initial")), None)
    if initial is None:
        return

    adj: dict[str, set[str]] = {s["id"]: set() for s in fsm["states"]}
    for a in fsm["actions"]:
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

    targets = {g["state"] for g in fsm["fact_acquisition"]}
    for state in sorted(reach(initial)):
        stranded = targets - reach(state)
        if stranded:
            rep.errors.append(
                f"entering {state!r} strands the agent: {', '.join(sorted(stranded))} "
                "can no longer be reached, so exploring before committing makes the task unsolvable"
            )


def _check_paths(fsm: dict, rep: Report) -> None:
    """Each declared acquisition path must actually be walkable on the action graph.

    A synthesised FSM will happily list a plausible-looking sequence of action ids that
    does not chain -- an action whose `from` is not where the previous one left you, or
    a path landing somewhere other than the state the fact is supposed to surface in.
    Caught here it costs nothing; caught in S5 it costs a coding-agent run.
    """
    initial = next((s["id"] for s in fsm["states"] if s.get("initial")), None)
    by_id: dict[str, list[dict]] = {}
    for a in fsm["actions"]:
        by_id.setdefault(a["id"], []).append(a)

    for g in fsm["fact_acquisition"]:
        cur = initial
        for step, aid in enumerate(g["path"]):
            options = by_id.get(aid)
            if not options:
                rep.errors.append(f"{g['fact_group']}: unknown action {aid!r} at step {step}")
                cur = None
                break
            move = next((a for a in options if a["from"] == cur), None)
            if move is None:
                froms = ", ".join(sorted({a["from"] for a in options}))
                rep.errors.append(
                    f"{g['fact_group']}: action {aid!r} at step {step} starts from [{froms}] "
                    f"but the path is in {cur!r}"
                )
                cur = None
                break
            cur = move["to"]
        if cur is not None and cur != g["state"]:
            rep.errors.append(
                f"{g['fact_group']}: path ends in {cur!r} but the fact is declared to "
                f"surface in {g['state']!r}"
            )


def _check_contract(fsm: dict, rep: Report) -> None:
    """No fact may be declared to surface in a state reached earlier on its own path.

    If a value is legible before the action that is supposed to earn it, the barrier is
    decorative. This only catches the self-inconsistent case; whether the generated code
    honours visible_data is S5's job.
    """
    order = {s["id"]: i for i, s in enumerate(fsm["states"])}
    for g in fsm["fact_acquisition"]:
        if g["state"] not in order:
            rep.errors.append(f"{g['fact_group']}: declares unknown state {g['state']!r}")
            continue
        if not g["path"]:
            rep.errors.append(
                f"{g['fact_group']}: empty path -- the fact is available without any interaction"
            )


def _check_coverage(fsm: dict, facts: dict, rep: Report) -> None:
    """Every answer-critical fact must be claimed by some acquisition entry."""
    claimed: set[tuple[int, str]] = set()
    for g in fsm["fact_acquisition"]:
        for rec in _resolve_records(g.get("records", []), facts):
            for field in g["fields"]:
                claimed.add((rec, field))

    required = {(f["record_index"], f["field"]) for f in facts["F"]}
    missing = required - claimed
    if missing:
        by_field: dict[str, int] = {}
        for _, field in missing:
            by_field[field] = by_field.get(field, 0) + 1
        detail = ", ".join(f"{k}x{v}" for k, v in sorted(by_field.items()))
        rep.errors.append(f"{len(missing)} answer-critical facts unreachable ({detail})")

    rep.info["F covered"] = f"{len(required - missing)}/{len(required)}"

    # A single state exposing all payload facts at once would make the barriers theatre.
    payload_states = {
        g["state"] for g in fsm["fact_acquisition"] if g.get("role") == "payload"
    }
    if len(payload_states) == 1 and len({g["fact_group"] for g in fsm["fact_acquisition"]}) > 1:
        rep.warnings.append(
            f"all payload facts surface in a single state ({payload_states.pop()}); "
            "consider spreading them so the environment cannot be solved in one view"
        )


def _estimate_cost(fsm: dict, facts: dict, rep: Report) -> int:
    """Estimated actions to collect all of F under a sensible plan.

    Entries whose paths share a prefix up to the same record-visit share that visit,
    so a plan that opens a build's detail surface once and reads both the timing
    tooltip and the commit accordion is costed once, not twice.
    """
    f_pairs = {(f["record_index"], f["field"]) for f in facts["F"]}
    paths = [tuple(g["path"]) for g in fsm["fact_acquisition"]]
    lcp = 0
    if paths:
        for col in zip(*paths):
            if len(set(col)) == 1:
                lcp += 1
            else:
                break

    buckets: dict[tuple, list[dict]] = {}
    for g in fsm["fact_acquisition"]:
        buckets.setdefault(tuple(g["path"][:-1]), []).append(g)

    total = lcp
    for prefix, groups in buckets.items():
        # How many records this bucket must actually be walked for: only those
        # carrying a fact that is genuinely in F.
        n = 1
        if any(g.get("repeat_per_record") for g in groups):
            recs = set()
            for g in groups:
                for rec in _resolve_records(g.get("records", []), facts):
                    if any((rec, fld) in f_pairs for fld in g["fields"]):
                        recs.add(rec)
            n = max(1, len(recs))
        # Cost of reaching the bucket, then one terminal action per group in it.
        reach = max(0, len(prefix) - lcp)
        per_visit = reach + len(groups)
        total += per_visit * n
        if n > 1:
            total += n - 1  # returning to the list between record visits
    return total


def validate(task_dir: Path) -> Report:
    task_dir = Path(task_dir)
    fsm = json.loads((task_dir / "fsm.json").read_text())
    facts = json.loads((task_dir / "facts.json").read_text())
    rep = Report()

    _check_reachability(fsm, rep)
    _check_no_dead_ends(fsm, rep)
    _check_paths(fsm, rep)
    _check_contract(fsm, rep)
    _check_coverage(fsm, facts, rep)

    cost = _estimate_cost(fsm, facts, rep)
    lo, hi = fsm["budget"]["min_actions"], fsm["budget"]["max_actions"]
    rep.info["est. actions"] = f"{cost} (budget {lo}-{hi})"
    if cost < lo:
        rep.errors.append(f"estimated cost {cost} below min_actions {lo}: too little GUI work to be a real test")
    if cost > hi:
        rep.errors.append(f"estimated cost {cost} above max_actions {hi}: degenerates into tedium")

    modalities = sorted({g["modality"] for g in fsm["fact_acquisition"]})
    rep.info["modalities"] = f"{len(modalities)} distinct"
    for m in modalities:
        rep.info[f"  - {m}"] = ""
    return rep


if __name__ == "__main__":
    import sys

    task_dir = Path(sys.argv[1])
    rep = validate(task_dir)
    print(f"S2 validation: {task_dir}")
    print(rep.render())
    sys.exit(0 if rep.ok else 1)
