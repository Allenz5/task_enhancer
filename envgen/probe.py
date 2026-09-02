"""Leak probe -- the P3 counterpart of ground_truth.spec.ts.

ground_truth proves the data *can* be reached through the interface. This tries the cheap
ways of reaching it *without* the interface, and reports what worked. It is mechanical and
adversarial on purpose: a design that only checks the happy path has no idea what it left
open.

  store       store/, data/, skeleton.json, mapping.json, input/ must not be addressable
  page cap    a list view returns at most page_size rows, whatever `size` asks for
  no bulk     /api/<entity> and friends do not exist
  oracle      filtering or sorting on a field the view does not expose is refused
  keys        sequential integer keys are reported (guessable), not failed
  export      unfiltered export size is reported, not failed -- it is a declared action

Run against a live server:  probe.py <env_dir> <base_url>
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def get(url: str) -> tuple[int, bytes]:
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:  # connection refused etc.
        return -1, str(e).encode()


def probe(env_dir: Path, base: str) -> tuple[list[str], list[str]]:
    spec = json.loads((env_dir / "skeleton.json").read_text(encoding="utf-8"))
    fails: list[str] = []
    notes: list[str] = []
    base = base.rstrip("/")

    # --- store must not be addressable
    paths = ["/store/", "/data/", "/skeleton.json", "/mapping.json", "/input/", "/task_card.json",
             "/app/../store/", "/api/store", "/api/data", "/api/all", "/api/dump", "/api/export"]
    for ent in spec["entities"]:
        paths += [f"/store/{ent}.json", f"/data/{ent}.json", f"/api/{ent}", f"/api/{ent}s",
                  f"/api/v/{ent}", f"/{ent}.json"]
    for p in paths:
        status, body = get(base + p)
        if status == 200:
            fails.append(f"{p} answered 200 ({len(body)} bytes) -- data addressable without the interface")

    # --- page cap and oracle checks per list view
    for vname, v in spec["views"].items():
        ent = spec["entities"][v["entity"]]
        if v["kind"] == "list":
            cap = v["page_size"]
            for size in (10 ** 6, cap * 10, 0, -1):
                status, body = get(f"{base}/api/v/{vname}?size={size}")
                if status != 200:
                    fails.append(f"{vname}?size={size} -> {status}")
                    continue
                n = len(json.loads(body).get("rows", []))
                if n > cap:
                    fails.append(f"{vname}?size={size} returned {n} rows, page_size is {cap}")
            status, body = get(f"{base}/api/v/{vname}")
            if status == 200:
                n = len(json.loads(body).get("rows", []))
                if n > cap:
                    fails.append(f"{vname} (no size) returned {n} rows, page_size is {cap}")

            exposed = set(ent["fields"]) if "*" in v["exposes"] else set(v["exposes"]) | {ent["key"]}
            hidden = [f for f in ent["fields"] if f not in exposed]
            for f in hidden[:5]:
                status, _ = get(f"{base}/api/v/{vname}?f.{urllib.parse.quote(f)}=nonblank")
                if status == 200:
                    fails.append(f"{vname} accepted a filter on hidden field {f} -- it is an oracle")
                status, _ = get(f"{base}/api/v/{vname}?sort={urllib.parse.quote(f)}")
                if status == 200:
                    fails.append(f"{vname} accepted a sort on hidden field {f} -- it is an oracle")
            not_filterable = [f for f in exposed if f not in set(v.get("filterable", []))]
            for f in not_filterable[:3]:
                status, _ = get(f"{base}/api/v/{vname}?f.{urllib.parse.quote(f)}=nonblank")
                if status == 200:
                    fails.append(f"{vname} accepted a filter on {f}, which it does not declare filterable")

            # payload must not carry hidden fields
            status, body = get(f"{base}/api/v/{vname}")
            if status == 200:
                for row in json.loads(body).get("rows", []):
                    leaked = [k for k in row if k not in exposed and k not in (v.get("include") or {})]
                    if leaked:
                        fails.append(f"{vname} rows carry undeclared fields: {', '.join(sorted(leaked))}")
                        break

        if v["kind"] == "detail":
            status, _ = get(f"{base}/api/v/{vname}")
            if status == 200:
                fails.append(f"{vname} answers without a key -- detail must be keyed")

        if v["kind"] == "export":
            status, body = get(f"{base}/api/v/{vname}")
            if status == 200:
                n = max(0, body.count(b"\n"))
                notes.append(f"export {vname}: unfiltered export yields ~{n} rows (declared action; reported, not failed)")

    # --- key guessability
    for ename, ent in spec["entities"].items():
        rows = json.loads((env_dir / "store" / f"{ename}.json").read_text(encoding="utf-8"))
        keys = [r.get(ent["key"]) for r in rows]
        ints = [k for k in keys if isinstance(k, int) or (isinstance(k, str) and k.isdigit())]
        if keys and len(ints) == len(keys):
            s = sorted(int(k) for k in ints)
            if s and s[-1] - s[0] + 1 <= len(s) * 2:
                notes.append(f"{ename}: keys are near-sequential integers ({s[0]}..{s[-1]}) -- "
                             f"detail rows are guessable without the list; opaque keys are better")
    return fails, notes


if __name__ == "__main__":
    env_dir = Path(sys.argv[1])
    base = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:5173"
    fails, notes = probe(env_dir, base)
    print(f"probe: {env_dir} @ {base}")
    for n in notes:
        print(f"  note  {n}")
    for f in fails:
        print(f"  LEAK  {f}")
    print(f"  {'no leaks' if not fails else f'{len(fails)} leak(s)'}")
    sys.exit(1 if fails else 0)
