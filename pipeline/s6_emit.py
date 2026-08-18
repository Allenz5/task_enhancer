"""S6 -- Emit the enhanced task bundle.

Rewrites the task statement so the input data is reached through the application
instead of read off disk, and records what the environment demands of an agent.

The original verifier is copied byte for byte. The whole value of this pipeline rests
on the success criterion being untouched: the enhanced task inherits the original
task's ground truth for free, and a GUI-capable agent's answer is graded by exactly the
same code that graded the CLI answer.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

TASK_TEMPLATE = """\
# {title}

The data for this task is not available as a file. It lives in **{app_concept}**,
running at **http://localhost:{port}**. Work through the interface to obtain it.

{original_requirements}
"""


def _rewrite_task(task_md: str, fsm: dict, port: int, input_file: str) -> str:
    lines = task_md.strip().splitlines()
    title = lines[0].lstrip("# ").strip() if lines else "Task"
    body = "\n".join(lines[1:]).strip()

    # Drop only the clause that points at the input file. The requirements that follow
    # it -- and the answer format -- survive verbatim, since the success criterion is
    # not ours to touch.
    basename = re.escape(Path(input_file).name)
    body = re.sub(
        rf"(?is)\b(?:using|given|from|based on)\b[^\n]*?`[^`]*{basename}`\s*,?\s*",
        "",
        body,
    ).lstrip()
    if body and body[0].islower():
        body = body[0].upper() + body[1:]

    return TASK_TEMPLATE.format(
        title=title,
        app_concept=fsm["meta"]["app_concept"].split("--")[0].strip(),
        port=port,
        original_requirements=body,
    )


def emit(task_dir: Path, env_dir: Path, port: int = 5173) -> Path:
    task_dir, env_dir = Path(task_dir), Path(env_dir)
    fsm = json.loads((task_dir / "fsm.json").read_text())
    facts = json.loads((task_dir / "facts.json").read_text())

    out = env_dir / "bundle"
    # Split by audience. Everything the agent under test may see goes in agent/;
    # everything that would give the answer away goes in grading/. Handing the agent
    # the original input would undo the entire enhancement, so the two never mix.
    agent_dir, grading_dir = out / "agent", out / "grading"
    agent_dir.mkdir(parents=True, exist_ok=True)
    grading_dir.mkdir(parents=True, exist_ok=True)

    (agent_dir / "task.md").write_text(
        _rewrite_task((task_dir / "task.md").read_text(), fsm, port, facts["input_file"])
    )

    # Untouched, byte for byte.
    for f in ("verifier.py", "reference_solution.py"):
        shutil.copy(task_dir / f, grading_dir / f)
    shutil.copytree(task_dir / "input", grading_dir / "input", dirs_exist_ok=True)

    manifest = {
        "task_id": fsm["meta"]["task_id"],
        "domain": fsm["meta"]["domain"],
        "app_concept": fsm["meta"]["app_concept"],
        "port": port,
        "facts": {
            "corpus_size": facts["corpus_size"],
            "answer_critical": len(facts["F"]),
            "payload": facts["summary"]["payload_facts"],
            "selection": facts["summary"]["selection_facts"],
            "critical_fields": facts["summary"]["critical_fields"],
        },
        "acquisition": [
            {
                "fact_group": g["fact_group"],
                "fields": g["fields"],
                "modality": g["modality"],
                "path_length": len(g["path"]),
                "repeat_per_record": g.get("repeat_per_record", False),
            }
            for g in fsm["fact_acquisition"]
        ],
        "budget": fsm["budget"],
        "layout": {
            "agent/": "given to the agent under test -- the rewritten task statement only",
            "grading/": "harness-side only -- verifier, reference solution and the "
                        "original input. Never expose this to the agent.",
        },
        "verifier": "grading/verifier.py (byte-identical to the original CLI task's)",
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return out


if __name__ == "__main__":
    import sys

    task_dir = Path(sys.argv[1])
    env_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("envs") / task_dir.name
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 5173
    out = emit(task_dir, env_dir, port)
    print(f"bundle -> {out}")
    for f in sorted(out.rglob("*")):
        if f.is_file():
            print(f"  {f.relative_to(out)}")
