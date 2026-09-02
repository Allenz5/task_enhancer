"""Step 3 -- the agent reads the filled store and looks for what the checks cannot see.

The mechanical checks in `checks.py` are about shape: disjoint partitions, unshared
identities, parity of populated columns. They can prove noise is *separable* and that it
does not overwrite anything. They cannot read the data.

What is left is judgement, and it runs in both directions. Noise that is obviously
fabricated -- wrong register, wrong magnitude, eight rows off one template -- costs the
retrieving agent nothing. Noise that contradicts a task record, or that happens to leave
some field correlating perfectly with task-versus-noise, costs it the task.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import agent                                  # noqa: E402  envgen/agent.py

PROMPT = """\
Review the fabricated records that were just added to this environment.

`store/.task/<entity>.json` holds the task's own records, untouched. `store/noise/` holds
what was fabricated. `store/<entity>.json` is the two together -- what the application
serves. `noise_plan.json` says what the noise was meant to be, and
`store/noise.manifest.json` says what it turned out to be.

The shape has already been verified mechanically: partitions are disjoint, no identity is
shared, no foreign key is borrowed, populated columns are at parity, keys are unique. Do
not re-check any of that. Read the data instead.

## What to look for

**1. Can the task's records still be selected?** State a criterion an agent could apply
through this interface -- a filter, a value in an exposed column -- that returns exactly
the task's rows and none of the noise. Check it against `skeleton.json`'s `views`: the
fields it relies on must actually be exposed and `filterable` in a list view. If no such
criterion exists, the noise has made the task unsolvable. This is the most serious thing
you can find.

**2. Does anything contradict?** A noise row that disagrees with a task row about the
same real-world thing -- the same company at a different size, the same instrument with a
different calibration date, a total that no longer adds up. Assembled text that contradicts
its own row's structured fields counts here too.

**3. Does the noise give itself away?** Read twenty noise rows and twenty task rows as if
you were the retrieving agent. Is there a tell that separates them without understanding
the task -- a register the task rows never use, values an order of magnitude off, dates
clustered in a way the task's are not, the same sentence skeleton row after row?

**4. Does anything leak the boundary?** A field that happens to correlate perfectly with
task-versus-noise, so filtering on it hands over the answer set without any judgement.
Status columns and date ranges are the usual culprits.

**5. Is the judgement worth making?** Would the retrieving agent actually have to filter,
compare or read to select the right records, rather than taking everything on the first
page?

## Write `noise_review.json`

```json
{
  "ok": true,
  "selection_criterion": "how the task's records can be selected through the interface",
  "findings": [
    {
      "severity": "blocking | cosmetic",
      "entity": "<entity>",
      "field": "<field, or null>",
      "what": "what is wrong, with the rows that show it",
      "fix": "what the generator should do instead"
    }
  ]
}
```

`blocking` means the noise damaged the task or is trivially separable from it -- findings
1, 2 and 4, and the worst of 3. `cosmetic` means it is imperfect but the environment
works. Set `"ok": false` if there is any blocking finding.

Do not edit any data yourself. Do not try to solve the benchmark task. Report.
"""


def review(env: Path, model: str = "opus") -> tuple[bool, dict, agent.AgentResult]:
    env = Path(env)
    result = agent.run(PROMPT, cwd=env, model=model)
    path = env / "noise_review.json"
    if not path.exists():
        return False, {"ok": False, "findings": [
            {"severity": "blocking", "what": "review agent wrote no noise_review.json"}]}, result
    report = json.loads(path.read_text(encoding="utf-8"))
    blocking = [f for f in report.get("findings", []) if f.get("severity") == "blocking"]
    return report.get("ok", False) and not blocking, report, result


def blocking_lines(report: dict) -> list[str]:
    return [f"{f.get('entity') or '-'}.{f.get('field') or '-'}: {f.get('what')} "
            f"-> {f.get('fix')}"
            for f in report.get("findings", []) if f.get("severity") == "blocking"]


if __name__ == "__main__":
    env = Path(sys.argv[1])
    ok, report, result = review(env)
    print(f"selection: {report.get('selection_criterion')}")
    for f in report.get("findings", []):
        print(f"  [{f.get('severity')}] {f.get('entity')}.{f.get('field')}: {f.get('what')}")
    if result.cost_usd:
        print(f"\n[{result.turns} turns, ${result.cost_usd:.2f}]")
    sys.exit(0 if ok else 1)
