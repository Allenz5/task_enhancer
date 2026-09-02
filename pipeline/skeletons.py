"""Skeleton loading -- the first layer's product, and the second layer's contract.

A skeleton is a running application cloned from a real reference product, built once per
bucket. It ships a `skeleton.json` that says which entities it holds, which fields are
structural (and may not be removed), where the data files live, and what a per-task
adaptation is and is not allowed to change.

Nothing here builds a skeleton. Building one requires judgements a script cannot make --
which reference product, what belongs in the interface at all, what is a deliberate
deviation from the real thing -- and those are written down in `skeletons/HOWTO.md`
instead of pretended away in code.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

SKELETON_ROOT = Path("skeletons")


class SkeletonError(Exception):
    pass


@dataclass
class Entity:
    name: str
    key: str | None
    data_file: str
    data_path: str | None
    fields: dict[str, dict]
    must_keep: list[str]
    custom_ok: bool

    def caption(self, field: str) -> str:
        return (self.fields.get(field) or {}).get("caption", field)


@dataclass
class Skeleton:
    bucket: str
    path: Path
    spec: dict

    @property
    def name(self) -> str:
        return self.spec.get("name", self.bucket)

    @property
    def reference(self) -> dict:
        return self.spec.get("reference", {})

    @property
    def serves_slugs(self) -> list[str]:
        """The classification slugs this skeleton was built for.

        Ties the choice of skeleton back to the bucket work in `cluster/` instead of
        having S1 re-guess a category the corpus was already labelled with.
        """
        return list(self.spec.get("serves_slugs") or [])

    @property
    def entities(self) -> dict[str, Entity]:
        out = {}
        for name, e in (self.spec.get("entities") or {}).items():
            out[name] = Entity(
                name=name,
                key=e.get("key"),
                data_file=e.get("data_file", ""),
                data_path=e.get("data_path"),
                fields={k: v for k, v in (e.get("fields") or {}).items()},
                must_keep=list(e.get("must_keep") or []),
                custom_ok=bool(e.get("custom_ok", False)),
            )
        return out

    @property
    def pages(self) -> list[dict]:
        return self.spec.get("pages") or []

    @property
    def contract(self) -> dict:
        return self.spec.get("layer2_contract") or {}

    def slot_index(self) -> dict[str, str]:
        """`entity.field` -> caption, for every declared slot. The map S1 fills in."""
        return {f"{ent}.{f}": e.caption(f) for ent, e in self.entities.items() for f in e.fields}

    def fork(self, dest: Path) -> Path:
        """Copy the runnable skeleton to `dest`, minus what is not part of an environment."""
        dest = Path(dest)
        dest.mkdir(parents=True, exist_ok=True)
        skip = {"node_modules", "test-results", "artifact", "reference", "verify", ".gitignore"}
        for item in sorted(self.path.iterdir()):
            if item.name in skip or item.name in {"SPEC.md", "README.md"}:
                continue
            target = dest / item.name
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True,
                                ignore=shutil.ignore_patterns("_gen_placeholder.py"))
            else:
                shutil.copy(item, target)
        return dest


def _require(spec: dict, path: Path) -> None:
    for key in ("bucket", "name", "entities", "pages", "layer2_contract"):
        if key not in spec:
            raise SkeletonError(f"{path}: skeleton.json is missing {key!r}")
    for name, e in spec["entities"].items():
        if not e.get("data_file"):
            raise SkeletonError(f"{path}: entity {name!r} declares no data_file")
        if not e.get("fields"):
            raise SkeletonError(f"{path}: entity {name!r} declares no fields")
        unknown = set(e.get("must_keep") or []) - set(e["fields"])
        if unknown:
            raise SkeletonError(
                f"{path}: entity {name!r} must_keep names fields it does not declare: "
                f"{', '.join(sorted(unknown))}")


def load(bucket: str, root: Path = SKELETON_ROOT) -> Skeleton:
    path = Path(root) / bucket
    spec_path = path / "skeleton.json"
    if not spec_path.exists():
        raise SkeletonError(f"no skeleton at {path} (expected {spec_path})")
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    _require(spec, path)
    for e in spec["entities"].values():
        if not (path / e["data_file"]).exists():
            raise SkeletonError(f"{path}: data_file {e['data_file']!r} does not exist")
    return Skeleton(bucket=spec["bucket"], path=path, spec=spec)


def available(root: Path = SKELETON_ROOT) -> list[str]:
    root = Path(root)
    if not root.exists():
        return []
    return sorted(p.name for p in root.iterdir()
                  if p.is_dir() and (p / "skeleton.json").exists())


def for_slug(slug: str, root: Path = SKELETON_ROOT) -> Skeleton | None:
    """The skeleton that serves a classification slug, if one has been built."""
    for bucket in available(root):
        sk = load(bucket, root=root)
        if slug in sk.serves_slugs:
            return sk
    return None


def describe(sk: Skeleton) -> str:
    """The block S1 is shown: what this skeleton can hold, in slot terms."""
    lines = [f"# skeleton `{sk.bucket}` -- {sk.name}",
             f"cloned from: {sk.reference.get('product', '?')} "
             f"({sk.reference.get('url', '')}, captured {sk.reference.get('captured', '?')})",
             ""]
    lines.append("## entities and their slots")
    for name, e in sk.entities.items():
        keep = f"  [structural, cannot be dropped: {', '.join(e.must_keep)}]" if e.must_keep else ""
        custom = "  [accepts task-specific extra fields]" if e.custom_ok else "  [fixed field set]"
        lines.append(f"\n### {name}  -> {e.data_file}{custom}")
        if e.key:
            lines.append(f"key: {e.key}")
        for f, meta in e.fields.items():
            desc = meta.get("desc", "")
            lines.append(f"  {f:<24} {meta.get('caption', f):<28} {desc}")
        if keep:
            lines.append(keep.strip())
    lines.append("\n## pages")
    for p in sk.pages:
        params = f"  ?{'&'.join(p['url_params'])}" if p.get("url_params") else ""
        lines.append(f"  {p['id']:<16} {p['file']:<18} {p.get('title','')}{params}")
    if sk.spec.get("export_points"):
        lines.append("\n## export points")
        for x in sk.spec["export_points"]:
            lines.append(f"  {x if isinstance(x, str) else x.get('where', '')}")
    lines.append("\n## what a per-task adaptation may and may not do")
    c = sk.contract
    for k in ("allowed", "forbidden"):
        for item in c.get(k) or []:
            lines.append(f"  {k.upper():<10} {item}")
    if c.get("unmappable"):
        lines.append(f"  UNMAPPABLE {c['unmappable']}")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("skeletons:")
        for b in available():
            sk = load(b)
            print(f"  {b:<14} {sk.name}  <- {sk.reference.get('product', '?')}")
            print(f"  {'':<14} serves slugs: {', '.join(sk.serves_slugs) or '(none declared)'}")
        sys.exit(0)

    print(describe(load(sys.argv[1])))
