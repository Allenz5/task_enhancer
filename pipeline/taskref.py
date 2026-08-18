"""Task loading.

Resolves a task reference against a batch directory and stages the one thing that
counts as input: `input.zip`. `software.zip` is the environment the task runs in and
`reference.zip` is the answer, so neither is read here.

The staged copy is what every later stage looks at. Nothing is summarised, indexed or
reshaped on the way through -- the files land as they are, and whoever needs them opens
them.
"""

from __future__ import annotations

import json
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path

WORK_ROOT = Path("work")


class TaskNotEnhanceable(Exception):
    """The task ships no input data, so there is nothing to move into a GUI."""


def _decode_name(info: zipfile.ZipInfo) -> str:
    """Recover a filename the archive stored in a legacy encoding.

    Without the UTF-8 flag, zipfile decodes names as cp437, which turns Chinese
    filenames into mojibake. Round-tripping through cp437 gets the original bytes back
    so they can be decoded properly -- these archives really do carry names like
    `雨水管线交叉复核基础图.dxf`.
    """
    if info.flag_bits & 0x800:
        return info.filename
    raw = info.filename.encode("cp437", errors="replace")
    for encoding in ("utf-8", "gbk", "big5"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return info.filename


@dataclass
class Task:
    ref: str
    domain: str
    task_id: str
    work_dir: Path
    card: dict

    @property
    def input_dir(self) -> Path:
        return self.work_dir / "input"

    def input_files(self) -> list[str]:
        """Every staged input file, relative to input/. The authoritative list.

        Taken from what the archive actually contained, not from the task card --
        the card's `inputFiles` omits some of what ships, so it is a description
        rather than a manifest.
        """
        return sorted(
            str(p.relative_to(self.input_dir))
            for p in self.input_dir.rglob("*")
            if p.is_file()
        )


def _split_ref(batch_root: Path, ref: str) -> tuple[str, str]:
    if "/" in ref:
        domain, task_id = ref.split("/", 1)
        return domain, task_id
    matches = [p.parent.name for p in (batch_root / "tasks").glob(f"*/{ref}")]
    if not matches:
        raise FileNotFoundError(f"no task {ref!r} under {batch_root / 'tasks'}")
    if len(matches) > 1:
        raise ValueError(f"{ref!r} is ambiguous across domains: {', '.join(matches)}")
    return matches[0], ref


def load(batch_root: str | Path, ref: str, work_root: Path = WORK_ROOT,
         refresh: bool = False) -> Task:
    batch_root = Path(batch_root)
    domain, task_id = _split_ref(batch_root, ref)

    card_path = batch_root / "tasks" / domain / task_id / "task_card.json"
    if not card_path.exists():
        raise FileNotFoundError(f"no task card at {card_path}")

    zip_path = batch_root / "data" / domain / task_id / "base" / "input.zip"
    if not zip_path.exists():
        raise TaskNotEnhanceable(
            f"{domain}/{task_id} ships no input.zip -- there is no input data to move "
            "into an interface"
        )

    work_dir = Path(work_root) / f"{domain}__{task_id}"
    input_dir = work_dir / "input"
    if refresh and work_dir.exists():
        shutil.rmtree(work_dir)
    input_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = _decode_name(info)
            # Nested archives stay packed. Whether a bundled source tree is worth
            # unpacking is a design judgement, not something to force here.
            target = input_dir / name
            if not target.resolve().is_relative_to(input_dir.resolve()):
                continue  # path traversal in the archive
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))

    card = json.loads(card_path.read_text(encoding="utf-8"))
    shutil.copy(card_path, work_dir / "task_card.json")

    return Task(ref=f"{domain}/{task_id}", domain=domain, task_id=task_id,
                work_dir=work_dir, card=card)


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    try:
        task = load(batch_root, ref, refresh=True)
    except TaskNotEnhanceable as e:
        print(f"not enhanceable: {e}")
        sys.exit(2)

    print(f"{task.ref}")
    print(f"  title    : {task.card.get('title', '')}")
    print(f"  work dir : {task.work_dir}")
    print(f"  staged   : {len(task.input_files())} files")
    for name in task.input_files():
        size = (task.input_dir / name).stat().st_size
        print(f"    {name}  ({size:,} bytes)")
