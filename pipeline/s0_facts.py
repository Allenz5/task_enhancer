"""S0 -- Input inventory.

Takes whatever a task hands over as input -- a zip, a directory, a single file -- and
describes what is in it, so the later stages have something to design against.

This stage makes no judgements. It does not rank inputs by importance, and it does not
decide what belongs in the GUI: some inputs read naturally as an interface, while a
schema contract or a provenance manifest is more honestly left as a file. Which is
which is S1's call, made with the task in view. Here the job is only to answer what is
present, how it is shaped, and what the discrete pieces are.

The output is deliberately structural. It records shapes, key sets, cardinalities and a
few examples -- never the full contents, since the data itself travels separately and
verbatim. Formats it does not recognise are still inventoried by size and kind rather
than skipped, because an unrecognised file is still a file the agent must be able to get
at.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any

MAX_EXAMPLES = 4
MAX_DISTINCT_LISTED = 12
MAX_DEPTH = 8
TEXT_SUFFIXES = {".txt", ".md", ".log", ".csv", ".tsv", ".yaml", ".yml", ".ini",
                 ".cfg", ".toml", ".py", ".js", ".ts", ".java", ".go", ".rs",
                 ".sql", ".sh", ".html", ".xml", ".env", ".properties", ".diff", ".patch"}


# ---------------------------------------------------------------- JSON shapes

def _scalar_kind(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "int"
    if isinstance(v, float):
        return "float"
    return "string"


def _shape(node: Any, depth: int = 0) -> dict:
    """Structural digest of a JSON value. Records form, not content."""
    if depth >= MAX_DEPTH:
        return {"type": "…", "note": "depth limit"}

    if isinstance(node, dict):
        return {
            "type": "object",
            "keys": {k: _shape(v, depth + 1) for k, v in node.items()},
        }

    if isinstance(node, list):
        merged = None
        for item in node:
            merged = _merge(merged, _shape(item, depth + 1))
        return {"type": "array", "length": len(node), "element": merged or {"type": "empty"}}

    return {"type": _scalar_kind(node), "examples": [node]}


def _merge(a: dict | None, b: dict) -> dict:
    """Union two shapes so an array of dissimilar records keeps every key it ever has."""
    if a is None:
        return b
    if a.get("type") != b.get("type"):
        kinds = sorted({a.get("type", "?"), b.get("type", "?")})
        return {"type": "|".join(kinds), "variants": kinds}

    kind = a["type"]
    if kind == "object":
        keys: dict[str, dict] = {}
        for k in {*a.get("keys", {}), *b.get("keys", {})}:
            in_a, in_b = a.get("keys", {}).get(k), b.get("keys", {}).get(k)
            if in_a is None or in_b is None:
                shape = dict(in_a or in_b)
                shape["optional"] = True
                keys[k] = shape
            else:
                keys[k] = _merge(in_a, in_b)
        return {"type": "object", "keys": keys}

    if kind == "array":
        return {
            "type": "array",
            "length": a.get("length", 0) + b.get("length", 0),
            "element": _merge(a.get("element"), b["element"]) if b.get("element") else a.get("element"),
        }

    examples = list(dict.fromkeys([*a.get("examples", []), *b.get("examples", [])]))
    return {"type": kind, "examples": examples[:MAX_EXAMPLES]}


def _annotate_domains(node: Any, shape: dict, depth: int = 0) -> None:
    """Attach distinct-value counts to scalar leaves under an array of records.

    Downstream this is what distinguishes a field worth turning into a facet from one
    that is unique per record -- a judgement S1 makes, not this stage.
    """
    if depth >= MAX_DEPTH or not isinstance(shape, dict):
        return

    if shape.get("type") == "array" and isinstance(node, list) and node:
        element = shape.get("element") or {}
        if element.get("type") == "object":
            for key, sub in element.get("keys", {}).items():
                values = [item.get(key) for item in node
                          if isinstance(item, dict) and key in item]
                _summarise_values(values, sub)
                nested = [v for v in values if isinstance(v, (dict, list))]
                if nested:
                    _annotate_domains(nested[0], sub, depth + 1)
        return

    if shape.get("type") == "object" and isinstance(node, dict):
        for key, sub in shape.get("keys", {}).items():
            if key in node:
                _annotate_domains(node[key], sub, depth + 1)


def _summarise_values(values: list, shape: dict) -> None:
    if not isinstance(shape, dict) or shape.get("type") in {"object", "array"}:
        return
    hashable = [v for v in values if not isinstance(v, (dict, list))]
    if not hashable:
        return
    counts = Counter(hashable)
    shape["present_in"] = len(hashable)
    shape["distinct"] = len(counts)
    if len(counts) <= MAX_DISTINCT_LISTED:
        shape["values"] = [v for v, _ in counts.most_common()]
    else:
        shape["examples"] = [v for v, _ in counts.most_common(MAX_EXAMPLES)]


def _units(data: Any) -> tuple[str, int, str]:
    """The discrete pieces this file divides into, if it divides at all.

    An object wrapping a single array is the common shape -- {"records": [...]} -- and
    its elements are the pieces. Anything else counts as one indivisible document.
    Whether those pieces are worth scattering across an interface is not decided here.
    """
    if isinstance(data, list):
        return "$", len(data), "record"
    if isinstance(data, dict):
        arrays = [(k, v) for k, v in data.items() if isinstance(v, list)]
        if len(arrays) == 1 and arrays[0][1]:
            return f"$.{arrays[0][0]}", len(arrays[0][1]), "record"
        if arrays:
            total = sum(len(v) for _, v in arrays)
            return "$.*[]", total, "record"
    return "$", 1, "document"


# ---------------------------------------------------------------- per file

def _inspect_json(raw: bytes) -> dict:
    data = json.loads(raw.decode("utf-8-sig"))
    shape = _shape(data)
    _annotate_domains(data, shape)
    unit_path, unit_count, unit_kind = _units(data)
    return {
        "format": "json",
        "structure": shape,
        "unit_path": unit_path,
        "units": unit_count,
        "unit_kind": unit_kind,
    }


def _inspect_delimited(raw: bytes, delimiter: str) -> dict:
    text = raw.decode("utf-8-sig", errors="replace")
    rows = list(csv.DictReader(io.StringIO(text), delimiter=delimiter))
    columns: dict[str, dict] = {}
    for name in (rows[0].keys() if rows else []):
        shape: dict = {"type": "string"}
        _summarise_values([r.get(name) for r in rows], shape)
        columns[name] = shape
    return {
        "format": "csv" if delimiter == "," else "tsv",
        "structure": {"type": "table", "columns": columns},
        "unit_path": "$row",
        "units": len(rows),
        "unit_kind": "row",
    }


def _inspect_text(raw: bytes) -> dict:
    text = raw.decode("utf-8", errors="replace")
    lines = text.splitlines()
    return {
        "format": "text",
        "structure": {
            "type": "text",
            "lines": len(lines),
            "chars": len(text),
            "head": lines[:MAX_EXAMPLES],
        },
        "unit_path": "$",
        "units": 1,
        "unit_kind": "document",
    }


def _inspect(name: str, raw: bytes) -> dict:
    suffix = Path(name).suffix.lower()
    try:
        if suffix == ".json":
            return _inspect_json(raw)
        if suffix in {".jsonl", ".ndjson"}:
            items = [json.loads(l) for l in raw.decode("utf-8-sig").splitlines() if l.strip()]
            shape = _shape(items)
            _annotate_domains(items, shape)
            return {"format": "jsonl", "structure": shape,
                    "unit_path": "$", "units": len(items), "unit_kind": "record"}
        if suffix == ".csv":
            return _inspect_delimited(raw, ",")
        if suffix == ".tsv":
            return _inspect_delimited(raw, "\t")
        if suffix in TEXT_SUFFIXES:
            return _inspect_text(raw)
    except Exception as e:
        # An unparseable file is still a file the agent has to reach, so it stays in
        # the inventory with the reason recorded rather than being dropped.
        return {"format": suffix.lstrip(".") or "unknown",
                "structure": {"type": "unparsed", "reason": f"{type(e).__name__}: {e}"},
                "unit_path": "$", "units": 1, "unit_kind": "document"}

    return {"format": suffix.lstrip(".") or "binary",
            "structure": {"type": "opaque"},
            "unit_path": "$", "units": 1, "unit_kind": "blob"}


# ---------------------------------------------------------------- collection

def _walk(source: Path) -> list[tuple[str, bytes]]:
    """Every file in the input, whether it arrives as a zip, a directory or one file."""
    if source.is_file() and source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as z:
            return [(i.filename, z.read(i))
                    for i in z.infolist() if not i.is_dir()]
    if source.is_dir():
        out = []
        for path in sorted(source.rglob("*")):
            if path.is_file() and not path.name.startswith("."):
                out.append((str(path.relative_to(source)), path.read_bytes()))
        return out
    return [(source.name, source.read_bytes())]


def inventory(source: Path) -> dict:
    source = Path(source)
    files = []
    for name, raw in _walk(source):
        entry = {"path": name, "bytes": len(raw)}
        entry.update(_inspect(name, raw))
        files.append(entry)

    files.sort(key=lambda f: f["path"])
    return {
        "source": str(source),
        "file_count": len(files),
        "total_bytes": sum(f["bytes"] for f in files),
        "total_units": sum(f["units"] for f in files),
        "files": files,
    }


if __name__ == "__main__":
    import sys

    source = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else source.parent / "data_inventory.json"

    inv = inventory(source)
    out.write_text(json.dumps(inv, indent=2, ensure_ascii=False))

    print(f"{inv['file_count']} files, {inv['total_bytes']:,} bytes, {inv['total_units']} units")
    for f in inv["files"]:
        s = f["structure"]
        detail = ""
        if s.get("type") == "array":
            detail = f"array[{s.get('length')}]"
        elif s.get("type") == "object":
            detail = f"object({len(s.get('keys', {}))} keys)"
        elif s.get("type") == "table":
            detail = f"table({len(s.get('columns', {}))} cols)"
        elif s.get("type") == "text":
            detail = f"text({s.get('lines')} lines)"
        else:
            detail = s.get("type", "")
        print(f"  {f['path']:<38} {f['format']:<6} {detail:<22} {f['units']:>4} {f['unit_kind']}")
    print(f"-> {out}")
