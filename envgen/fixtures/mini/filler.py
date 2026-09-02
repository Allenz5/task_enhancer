"""Fixture filler. Generates items and owners in the shape of the exemplars it is shown.

Kept deliberately dumb: the point of the fixture is to exercise fill.py's checks, so this
filler *tries* to collide -- it reuses an exemplar's name in one record and an excluded
partition in another -- and fill.py must reject those.
"""
import argparse
import json
import random

ap = argparse.ArgumentParser()
ap.add_argument("--entity"); ap.add_argument("--n", type=int)
ap.add_argument("--spec"); ap.add_argument("--exemplars"); ap.add_argument("--avoid")
ap.add_argument("--exclude-partition"); ap.add_argument("--seed", type=int, default=0)
a = ap.parse_args()

rng = random.Random(a.seed)
ex = json.loads(a.exemplars or "[]")
excl = set(json.loads(a.exclude_partition or "[]"))
REGIONS = [r for r in ["north", "south", "east", "west", "central"] if r not in excl] or ["elsewhere"]
out = []

if a.entity == "item":
    statuses = ["open", "closed", "pending"]
    for i in range(a.n):
        out.append({
            "id": f"F{a.seed:02d}{i:04d}x",
            "name": f"Item {rng.randint(1000, 9999)}",
            "region": rng.choice(REGIONS),
            "status": rng.choice(statuses),
            "amount": round(rng.uniform(10, 500), 2),
            "note": "filler note",
            "tags": rng.sample(["a", "b", "c", "d"], 2),
            "owner": f"O{rng.randint(1, 6)}",
        })
    # deliberate collisions, to be rejected by fill.py
    if ex:
        bad = dict(out[0]); bad["id"] = "F-collide-1"; bad["name"] = ex[0]["name"]; bad["region"] = ex[0]["region"]
        out.append(bad)
    if excl:
        bad = dict(out[1]); bad["id"] = "F-collide-2"; bad["region"] = sorted(excl)[0]
        out.append(bad)
elif a.entity == "owner":
    for i in range(a.n):
        out.append({"oid": f"O{i + 1}", "oname": f"Owner {i + 1}", "dept": rng.choice(["QA", "Ops", "Lab"])})

print(json.dumps(out, ensure_ascii=False))
