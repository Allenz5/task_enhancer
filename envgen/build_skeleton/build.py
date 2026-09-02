"""build -- description.md -> skeleton.json + app/ + filler.py + store/

The agent implements the description on top of the shared engine. It writes three things:
the contract, the frontend, the data generator. It does not write a server -- the engine
is the server, and it is what enforces the view slicing the design depends on. After the
agent finishes, this script seeds store/, starts the engine, and runs the probe; a
skeleton that cannot be served and probed clean is not done.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENVGEN = HERE.parent
sys.path.insert(0, str(ENVGEN))
sys.path.insert(0, str(HERE))
import agent   # noqa: E402
import probe   # noqa: E402
import seed    # noqa: E402

PROMPT = """\
Build a **skeleton** -- a runnable clone of the product described in `description.md`,
on top of a server that already exists. Read `description.md` first, fully.

A skeleton is not a demo. Later, a task's real data will be loaded into it and an agent
will have to work through its interface to get that data out. So the interface has to be
faithful to the description, and the data has to be reachable only through the views the
description names.

## What already exists (do not write a server)

`{engine}` serves any directory laid out as:

```
skeleton.json    the contract -- you write this
app/             static frontend -- you write this; served at /
filler.py        data generator -- you write this
store/           <entity>.json arrays -- produced by running your filler; never hand-written
```

Its API, which your frontend must use for **all** data:

- `GET /api/views` -- the view shapes (fields with captions, page_size, filterable,
  sortable, key). **Render columns, filter controls and detail blocks from this**, never
  from a hardcoded list; a later step swaps fields by editing skeleton.json only.
- `GET /api/v/<list>?f.<field>=<op>:<value>&sort=[-]field&page=n&size=n` -- ops
  `eq neq contains startswith gt gte lt lte blank nonblank`; `size` cannot exceed page_size
- `GET /api/v/<detail>/<key>`
- `GET /api/v/<export>?f...` -- CSV of the current filter set

Filtering or sorting on a field a view does not expose is refused with 400. There is no
endpoint that returns a whole entity. `store/` is not served. Do not work around any of
this in the frontend: it is the point.

A worked example is at `{fixture}` (a minimal skeleton) and the contract schema at
`{schema}`. Read both.

## 1. `skeleton.json`

Follow the schema. The parts that carry weight:

- `entities.<e>.fields` -- every field the description names. Set `names: "api"` when
  the description says the name came from a captured API, else `"builder"`.
- `entities.<e>.identity` -- which fields make two records the same real thing.
- `entities.<e>.partition` -- the field that separates one user's data from another's
  (city, project, folder). Task data and filler data will be kept apart on it.
- `fields.<f>.fill` -- `cosmetic` only for decoration a task would never grade
  (welfare tags, avatars). Statuses, judgements, measurements stay `never`.
- `views` -- one per page or panel the description names. `exposes` is exactly what that
  surface shows; if the description says a field appears only in the detail, the list
  view does not expose it. `filterable` and `sortable` are exactly the controls the
  description shows, no more. `page_size` is what the real page shows.
- `fill` -- how many rows of each entity the seeded skeleton carries.
- `deliberate_deviations` -- every place you depart from the description, with `what`,
  `real`, `why`. Empty is suspicious.
- `layer2_contract` -- what a later task load may change (replace store/, adjust page
  sizes, add fields to `custom_ok` entities) and may not (new pages, dropping
  `must_keep`).

## 2. `app/`

Plain HTML/CSS/JS, no build step, no frameworks, no data files. Reproduce the layout,
density, spacing and colour the description gives -- including where it says the product
is restrained. Use the domain vocabulary the description uses for labels. Do not use the
real product's name, logo or wordmark; this is a fictional product in the same category.

Every page fetches `/api/views` and renders from it. Lists page with the API's `page`;
filters translate to `f.` params; the detail page fetches by key; export links to the
export view with the current filters. Nothing is fetched that the current view does not
show -- no prefetching the detail to fill a tooltip.

## 3. `filler.py`

Command-line generator:

```
python3 filler.py --entity <e> --n <count> --spec <entity json> --exemplars <json array>
                  --avoid <json array> --exclude-partition <json array> --seed <int>
```

prints a JSON array of `n` records. Records must be **in the domain** of the description
-- real-looking values in the right ranges and vocabulary, not lorem. When `--exemplars`
is non-empty, generate records that look like them; never reuse an exemplar's identity
fields. Never emit a partition value listed in `--exclude-partition`. Keys must be unique
and, if the description's product uses opaque ids, opaque. Deterministic from `--seed`.
Related entities must link (a foreign key must point at a record that exists).

## Done

After you write these, run `python3 {seed_py} .` to produce store/, then start the engine
(`ENV_ROOT=. PORT=<free port> node {engine}`) and open every page in a browser or with
Playwright and confirm each renders with data and every interaction the description names
works. Fix what does not. Then stop; a separate step will drive the site harder.
"""


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve(skel: Path, port: int) -> subprocess.Popen:
    skel = skel.resolve()          # ENV_ROOT must be absolute: the engine runs with cwd=skel
    log = open(skel / ".server.log", "w")
    proc = subprocess.Popen(["node", str(ENVGEN / "engine" / "server.js")], cwd=skel,
                            env={**os.environ, "PORT": str(port), "ENV_ROOT": str(skel)},
                            stdout=log, stderr=subprocess.STDOUT)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2)
            return proc
        except Exception:
            if proc.poll() is not None:
                break
            time.sleep(0.2)
    proc.terminate()
    raise RuntimeError((skel / ".server.log").read_text(encoding="utf-8")[-3000:])


def check(skel: Path) -> bool:
    """What must hold before the skeleton is handed to drive.py."""
    ok = True
    for f in ("skeleton.json", "filler.py", "app/index.html"):
        if not (skel / f).exists():
            print(f"  missing {f}"); ok = False
    if not ok:
        return False
    try:
        counts = seed.seed(skel)
        print("  seeded: " + ", ".join(f"{e}={n}" for e, n in counts.items()))
    except SystemExit as e:
        print(f"  seed failed: {e}"); return False

    port = free_port()
    try:
        proc = serve(skel, port)
    except RuntimeError as e:
        print(f"  engine refused to start:\n{e}"); return False
    try:
        fails, notes = probe.probe(skel, f"http://127.0.0.1:{port}")
        for n in notes: print(f"  note  {n}")
        for f in fails: print(f"  LEAK  {f}")
        return not fails
    finally:
        proc.terminate(); proc.wait(timeout=5)


RESUME_PROMPT = """\
The previous session was cut off by a network error. Continue exactly where you left off:
whatever of skeleton.json / app/ / filler.py is not yet written, write it; then do the
"Done" section -- seed store/, start the engine, open every page, fix what fails, stop.
"""


def build(skel: Path, model: str = "opus", resume: str | None = None) -> bool:
    if not (skel / "description.md").exists():
        print("no description.md -- run describe.py first"); return False
    prompt = RESUME_PROMPT if resume else PROMPT.format(
        engine=ENVGEN / "engine" / "server.js",
        fixture=ENVGEN / "fixtures" / "mini",
        schema=ENVGEN / "contracts" / "skeleton.schema.json",
        seed_py=HERE / "seed.py",
    )
    res = agent.run(prompt, cwd=skel, model=model, allowed_dirs=[ENVGEN], resume=resume)
    if not res.ok:
        print(f"build agent failed: {res.text[-1200:]}"); return False
    print(res.text[-1500:])
    if res.cost_usd:
        print(f"[{res.turns} turns, ${res.cost_usd:.2f}]")
    print("post-build check:")
    return check(skel)


if __name__ == "__main__":
    skel = Path(sys.argv[1])
    if len(sys.argv) > 2 and sys.argv[2] == "--check":
        sys.exit(0 if check(skel) else 1)
    resume = sys.argv[3] if len(sys.argv) > 3 and sys.argv[2] == "--resume" else None
    sys.exit(0 if build(skel, resume=resume) else 1)
