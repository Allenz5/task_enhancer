"""seed -- store/ from filler.py, for a skeleton with no task in it.

The skeleton's own filler generates every entity to the count skeleton.json declares in
`fill`. No exemplars, no avoid set: there is no task yet. This is the same generator the
task layer later runs *around* a task's data, so a skeleton whose filler cannot seed
itself cannot be filled either -- this is the first place that shows.

Runs deterministically from a seed so the skeleton's own walk spec is stable.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def seed(skel: Path, base_seed: int = 0) -> dict[str, int]:
    spec = json.loads((skel / "skeleton.json").read_text(encoding="utf-8"))
    targets = spec.get("fill") or {}
    (skel / "store").mkdir(exist_ok=True)
    counts = {}
    for i, (ename, ent) in enumerate(spec["entities"].items()):
        n = targets.get(ename)
        if n is None:
            raise SystemExit(f"skeleton.json fill has no target for entity {ename!r}")
        cmd = [sys.executable, str(skel / "filler.py"), "--entity", ename, "--n", str(n),
               "--spec", json.dumps(ent, ensure_ascii=False), "--exemplars", "[]",
               "--avoid", "[]", "--exclude-partition", "[]", "--seed", str(base_seed + i)]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if out.returncode != 0:
            raise SystemExit(f"filler.py failed for {ename}:\n{out.stderr[-2000:]}")
        rows = json.loads(out.stdout)
        if not isinstance(rows, list):
            raise SystemExit(f"filler.py for {ename} did not return a JSON array")
        key = ent["key"]
        missing = [r for r in rows if r.get(key) in (None, "")]
        if missing:
            raise SystemExit(f"filler.py for {ename}: {len(missing)} rows lack key {key}")
        keys = [str(r[key]) for r in rows]
        if len(set(keys)) != len(keys):
            raise SystemExit(f"filler.py for {ename}: duplicate keys")
        (skel / "store" / f"{ename}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        counts[ename] = len(rows)
    return counts


if __name__ == "__main__":
    c = seed(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 0)
    for e, n in c.items():
        print(f"  store/{e}.json  {n} rows")
