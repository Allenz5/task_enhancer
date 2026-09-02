"""Pre-publication check on a skeleton's placeholder data.

Two things go wrong at publication time, and only one of them is obvious.

The obvious one: a data value carrying a real identity. The job-search skeleton shipped
company names lifted straight from the reference site, with legal representatives and
registered capital I had invented attached to them. Locally that is nothing; published,
it is a fabricated business record about a real company.

The subtle one is what makes it findable: those values are *in the capture notes*,
because that is where they came from. So this cross-checks every value in `data/*.json`
against `reference/capture.md`. A value that appears in both was almost certainly copied
off the real product rather than made up.

It reports; it does not decide. A category word ("游戏", "20-99人") legitimately appears in
both and is fine. A company name with a legal representative next to it is not. Telling
those apart is a judgement, so the tool's job is to put the candidates in front of someone.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Fields whose values read as an official record. Invented values here are the ones that
# do real damage, so they are called out whether or not they match the capture notes.
RISKY_FIELD = re.compile(
    r"法定代表人|统一社会信用代码|注册资[本金]|营业执照|成立日期|成立时间|登记机关|"
    r"legal.?represent|registration.?(no|number)|tax.?id|license.?(no|number)",
    re.I)

SKIP_VALUE = re.compile(r"^[\d\s.,:%/+-]*$")   # pure numbers, dates, empty


def _values(node, field: str | None = None):
    """Every leaf value in a JSON tree, with the field name it sat under."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _values(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from _values(v, field)
    elif isinstance(node, str):
        yield field, node


def _allowed(spec: dict) -> set[str]:
    """Vocabulary the skeleton legitimately copies from the real product.

    Filter option lists, status enumerations and menu labels are *supposed* to match the
    reference verbatim -- that is the fidelity the whole exercise is for. Flagging them
    would bury the one finding that matters.
    """
    ok: set[str] = set()

    def walk(n):
        if isinstance(n, dict):
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)
        elif isinstance(n, str):
            ok.add(n)

    for key in ("filters", "grid_interactions", "export_points", "interactions"):
        walk(spec.get(key))
    for e in (spec.get("entities") or {}).values():
        for f, meta in (e.get("fields") or {}).items():
            ok.add(f)
            ok.add(meta.get("caption", ""))
    return {v for v in ok if v}


def _identity_fields(spec: dict) -> set[str]:
    """Fields whose values name a real-world person or organisation.

    Declared by the skeleton because only its author knows which they are. Without this
    the cross-check drowns in legitimate shared vocabulary -- district names, welfare
    lists, status enumerations -- and the one finding that matters gets buried.
    """
    return set(spec.get("identity_fields") or [])


def check(bucket: str) -> int:
    path = ROOT / bucket
    spec = json.loads((path / "skeleton.json").read_text(encoding="utf-8"))
    capture_path = path / "reference" / "capture.md"
    capture = capture_path.read_text(encoding="utf-8") if capture_path.exists() else ""
    if not capture:
        print(f"  WARN  no reference/capture.md -- cannot cross-check for lifted values")

    allowed = _allowed(spec)
    identity = _identity_fields(spec)
    if not identity:
        print("  WARN  skeleton.json declares no identity_fields -- the lifted-name check "
              "cannot run; add the fields that name a person or an organisation")
    lifted: dict[str, set[str]] = {}
    risky: dict[str, set[str]] = {}
    other = 0

    for data_file in sorted((path / "data").glob("*.json")):
        blob = json.loads(data_file.read_text(encoding="utf-8"))
        for field, value in _values(blob):
            v = value.strip()
            if len(v) < 2 or SKIP_VALUE.match(v) or v in allowed:
                continue
            if field and RISKY_FIELD.search(field):
                risky.setdefault(f"{data_file.name}:{field}", set()).add(v)
            if capture and v in capture:
                if field in identity:
                    lifted.setdefault(f"{data_file.name}:{field}", set()).add(v)
                else:
                    other += 1

    print(f"preflight: skeletons/{bucket}")
    problems = 0

    if lifted:
        problems += 1
        print("\n  指认主体的字段里，值同时出现在 data/ 和 reference/capture.md")
        print("  —— 这些名字很可能是从真站抄来的真实公司/人名：")
        for f, vs in sorted(lifted.items()):
            for v in sorted(vs):
                print(f"    {f:<28} {v}")
        print("    → 换成虚构名再发布")
    else:
        print("  指认主体的字段里没有从 capture.md 抄来的名字")
    if other:
        print(f"  （另有 {other} 处非主体字段的值与 capture.md 重合 —— "
              f"品类词/状态枚举/福利词一类，正常）")

    if risky:
        problems += 1
        print("\n  高风险字段（值一旦是编的，又挂在真实主体上，就是伪造记录）：")
        for f, vs in sorted(risky.items()):
            print(f"    {f}")
            for v in sorted(vs)[:6]:
                print(f"      {v}")
        print("    → 确认这些主体本身是虚构的")
    else:
        print("  没有高风险字段")

    print(f"\n  {'需要人工确认' if problems else '通过'}")
    return problems


if __name__ == "__main__":
    if len(sys.argv) < 2:
        buckets = sorted(p.name for p in ROOT.iterdir()
                         if p.is_dir() and (p / "skeleton.json").exists())
    else:
        buckets = sys.argv[1:]
    rc = 0
    for b in buckets:
        rc += check(b)
        print()
    sys.exit(1 if rc else 0)
