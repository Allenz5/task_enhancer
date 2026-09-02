"""Self-test of the runtime pieces against the mini fixture: engine, probe, fill.

Builds a throwaway env from fixtures/mini with a few "task" rows, fills it, starts the
engine, probes it, and checks the things DESIGN.md says the engine must do.
"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / 'load_task'))
import fill      # noqa: E402
import probe     # noqa: E402


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get(url: str):
    url = urllib.parse.quote(url, safe=":/?&=.-_~")   # fixture data is Chinese
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.status, r.read()


def main() -> int:
    env = Path(tempfile.mkdtemp(prefix="envgen-selftest-")) / "env"
    shutil.copytree(HERE / "fixtures" / "mini", env)
    (env / "store").mkdir(exist_ok=True)

    # "task" data: 5 items all in region 北区, 2 owners
    task_items = [
        {"id": f"T{i}", "name": f"任务样本 {i}", "region": "北区", "status": ["open", "closed"][i % 2],
         "amount": 100 + i, "note": f"secret detail {i}", "owner": "O1"} for i in range(1, 6)]
    (env / "store" / "item.json").write_text(json.dumps(task_items, ensure_ascii=False), encoding="utf-8")
    (env / "store" / "owner.json").write_text(json.dumps(
        [{"oid": "O1", "oname": "张", "dept": "QA"}], ensure_ascii=False), encoding="utf-8")

    ok = True
    def check(cond, msg):
        nonlocal ok
        print(("  ok    " if cond else "  FAIL  ") + msg)
        ok = ok and cond

    # --- fill
    m = fill.fill(env, seed=7)
    items = json.loads((env / "store" / "item.json").read_text(encoding="utf-8"))
    r = m["entities"]["item"]
    check(len(items) == 40, f"fill reached target: {len(items)} rows")
    check(r["rejected"] >= 2, f"fill rejected the deliberate collisions: {r['rejected']}")
    check(all(x["region"] != "北区" for x in items if x["id"].startswith("F")),
          "no filler row in the task's partition")
    check(all("tags" in x for x in items if x["id"].startswith("T")),
          f"cosmetic field copied onto task rows: {len(r['cosmetic_filled'])}")
    check(all("note" in x and x["note"].startswith("secret") for x in items if x["id"].startswith("T")),
          "task rows' semantic fields untouched")
    check((env / "store" / "filler.manifest.json").exists(), "manifest written")

    # --- engine
    port = free_port()
    log = open(env / ".server.log", "w")
    proc = subprocess.Popen(["node", str(HERE / "engine" / "server.js")],
                            cwd=env, env={**os.environ, "PORT": str(port), "ENV_ROOT": str(env)},
                            stdout=log, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                get(base + "/api/health"); break
            except Exception:
                time.sleep(0.1)
        else:
            print(open(env / ".server.log").read()); return 1

        s, b = get(base + "/api/v/items")
        d = json.loads(b)
        check(len(d["rows"]) == 10 and d["total"] == 40, f"list paged: {len(d['rows'])} of {d['total']}")
        check(all(set(row) <= {"id", "name", "region", "status", "amount"} for row in d["rows"]),
              "list rows carry only exposed fields + key")
        s, b = get(base + "/api/v/items?size=999")
        check(len(json.loads(b)["rows"]) == 10, "size=999 capped to page_size")
        s, b = get(base + "/api/v/items?f.region=eq:北区")
        check(json.loads(b)["total"] == 5, "filter eq works")
        s, b = get(base + "/api/v/items?sort=-amount")
        rows = json.loads(b)["rows"]
        check(rows[0]["amount"] >= rows[-1]["amount"], "sort desc works")
        s, b = get(base + "/api/v/item/T1")
        det = json.loads(b)
        check(det.get("note", "").startswith("secret") and det.get("owner", {}).get("oname") == "张",
              "detail keyed, full fields, include embedded")
        s, b = get(base + "/api/v/items_export?f.status=eq:open")
        lines = b.decode("utf-8-sig").splitlines()
        check(lines[0].startswith("Name,") and len(lines) >= 2, f"export csv respects filter: {len(lines) - 1} rows")
        try:
            get(base + "/api/v/items?f.note=nonblank"); check(False, "hidden-field filter refused")
        except urllib.error.HTTPError as e:
            check(e.code == 400, f"hidden-field filter refused ({e.code})")

        fails, notes = probe.probe(env, base)
        for n in notes: print(f"  note  {n}")
        for f in fails: print(f"  LEAK  {f}")
        check(not fails, "probe: no leaks")
    finally:
        proc.terminate(); proc.wait(timeout=5); log.close()

    print("\nselftest:", "PASS" if ok else "FAIL", f"({env})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
