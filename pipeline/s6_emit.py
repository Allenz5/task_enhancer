"""S6 -- Emit the enhanced task.

Rewrites the task statement so the inputs that moved into the interface are reached
there instead of read off disk, and leaves everything else exactly as it was.

The grading machinery is never copied, edited or even opened -- it stays in the original
task directory. That is the whole point: the enhancement changes only how the input is
obtained, so an enhanced task is graded by precisely the code that graded the original,
and inherits its ground truth for free.

The rewrite is a path substitution, not a rewrite of prose. The statement names its
inputs by absolute path, so each path that moved into the interface is swapped for the
application's address and every other word is left untouched. Editing sentences would
risk altering the requirements, which are not ours to touch -- and these statements come
in several languages, which no regex over prose survives.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import taskref

NOTE_ZH = """\
> **本任务的部分输入已不在文件系统中。**
> 下列输入现在只存在于运行于 {url} 的应用里，需要通过界面操作获取：
{moved}
>
> 其余输入仍在原路径上，可直接读取。任务要求、交付物与验收标准均未改变。
"""

NOTE_EN = """\
> **Some of this task's input is no longer on the filesystem.**
> The following inputs now exist only inside the application running at {url}, and must
> be obtained by working through its interface:
{moved}
>
> Every other input remains at its original path. The requirements, deliverables and
> acceptance criteria are unchanged.
"""


def _has_cjk(text: str) -> bool:
    return any("一" <= ch <= "鿿" for ch in text)


def _rewrite_prompt(prompt: str, moved: list[str], port: int) -> tuple[str, list[str]]:
    """Swap each moved input's path for the app address; touch nothing else.

    Returns the rewritten prompt and the paths that were actually found, so a file the
    statement never mentioned does not silently look like it was handled.
    """
    url = f"http://localhost:{port}"
    found = []
    out = prompt

    for name in moved:
        # Only a real path is swapped -- one with a directory prefix. A bare filename in
        # prose is naming *which data* to process, not where to read it from, and
        # replacing that with a URL turns a readable sentence into noise.
        pattern = re.compile(r"/[^\s`'\"]+/" + re.escape(name))
        if pattern.search(out):
            found.append(name)
            out = pattern.sub(f"{url}  ({name}，改为在应用中获取)"
                              if _has_cjk(prompt) else
                              f"{url}  ({name}, obtained through the application)", out)

    listing = "\n".join(f"> - `{n}`" for n in (found or moved))
    note = (NOTE_ZH if _has_cjk(prompt) else NOTE_EN).format(url=url, moved=listing)
    return note + "\n" + out, found


def emit(task: taskref.Task, env_dir: Path, port: int = 5173) -> Path:
    env_dir = Path(env_dir)
    fsm = json.loads((task.work_dir / "fsm.json").read_text(encoding="utf-8"))

    if fsm.get("candidate") is False:
        raise ValueError(f"{task.ref} was judged not a candidate: {fsm.get('reason')}")

    placements = fsm.get("data_placement", [])
    moved = [p["source"].split("#", 1)[0] for p in placements if p.get("disposition") == "gui"]
    kept = [p["source"].split("#", 1)[0] for p in placements if p.get("disposition") == "file"]

    out = env_dir / "bundle"
    agent_input = out / "agent_input"
    agent_input.mkdir(parents=True, exist_ok=True)

    # Only what stayed on disk is handed over. Shipping a file that moved into the
    # interface would hand back the very thing the environment exists to withhold.
    for name in sorted(set(kept)):
        src = task.input_dir / name
        if src.exists():
            dst = agent_input / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)

    card = dict(task.card)
    rewritten, found = _rewrite_prompt(card.get("taskPrompt", ""), sorted(set(moved)), port)
    card["taskPrompt"] = rewritten
    (out / "task_card.enhanced.json").write_text(
        json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8")

    unreferenced = sorted(set(moved) - set(found))
    manifest = {
        "task_ref": task.ref,
        "app_concept": fsm["meta"]["app_concept"],
        "domain": fsm["meta"]["domain"],
        "url": f"http://localhost:{port}",
        "environment": str(env_dir),
        "input": {
            "moved_into_gui": sorted(set(moved)),
            "left_on_disk": sorted(set(kept)),
            "not_named_in_task_prompt": unreferenced,
        },
        "placement": [
            {
                "source": p["source"],
                "disposition": p["disposition"],
                "modality": p.get("modality"),
                "split": p.get("split"),
                "reason": p.get("reason"),
                "path_length": len(p.get("path") or []),
            }
            for p in placements
        ],
        "budget": fsm.get("budget"),
        "grading": (
            "unchanged and not copied -- the original task's own evaluator grades this, "
            "exactly as it graded the un-enhanced task"
        ),
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    return out


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 5173

    task = taskref.load(batch_root, ref)
    env_dir = Path("envs") / task.work_dir.name
    out = emit(task, env_dir, port)

    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    print(f"bundle -> {out}")
    print(f"  moved into GUI : {', '.join(manifest['input']['moved_into_gui'])}")
    print(f"  left on disk   : {', '.join(manifest['input']['left_on_disk'])}")
    if manifest["input"]["not_named_in_task_prompt"]:
        print(f"  WARN not named in taskPrompt: "
              f"{', '.join(manifest['input']['not_named_in_task_prompt'])}")
