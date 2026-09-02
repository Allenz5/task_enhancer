"""Drive the three steps, feeding failures back into the one step that can fix them.

    plan -> generate -> review
             ^            |
             +-- failures -+

Both the mechanical checks and the review agent report against the same target: the
generator script. So a failure from either side goes back to step 1, which rewrites
`filler.task.py`, and the loop runs again. K=3, because a generator that is still wrong
on the third pass is wrong about the task, not about a detail.
"""

from __future__ import annotations

import sys
from pathlib import Path

import generate
import plan as planner
import review as reviewer

K = 3


def run(env: Path, seed: int = 0, model: str = "opus") -> bool:
    env = Path(env)
    failures: list[str] | None = None
    cost = 0.0

    for attempt in range(1, K + 1):
        fresh = not ((env / "noise_plan.json").exists() and (env / "filler.task.py").exists())
        if failures or fresh:
            print(f"\n[{attempt}/{K}] plan" + (" (rewriting)" if failures else ""))
            result = planner.plan(env, model=model, failures=failures)
            cost += result.cost_usd or 0.0
            missing = [f for f in ("noise_plan.json", "filler.task.py") if not (env / f).exists()]
            if not result.ok or missing:
                print(result.text[-2000:])
                if missing:
                    print(f"plan wrote no {', '.join(missing)}")
                return False

        print(f"[{attempt}/{K}] generate")
        manifest = generate.generate(env, seed)
        for ename, r in manifest["entities"].items():
            print(f"    {ename:<14} task {r['task_rows']:>4}  noise {r['noise_rows']:>4}")
        if manifest["failures"]:
            for f in manifest["failures"]:
                print(f"    - {f}")
            failures = manifest["failures"]
            continue

        print(f"[{attempt}/{K}] review")
        ok, report, result = reviewer.review(env, model=model)
        cost += result.cost_usd or 0.0
        for f in report.get("findings", []):
            print(f"    [{f.get('severity')}] {f.get('entity')}.{f.get('field')}: {f.get('what')}")
        if ok:
            print(f"\nnoise accepted after {attempt} attempt(s), ${cost:.2f}")
            print(f"selection: {report.get('selection_criterion')}")
            return True
        failures = reviewer.finding_lines(report)

    print(f"\ngiving up after {K} attempts, ${cost:.2f}")
    return False


if __name__ == "__main__":
    env = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    sys.exit(0 if run(env, seed) else 1)
