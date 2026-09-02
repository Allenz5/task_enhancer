"""Thin headless driver for the coding agent.

Shells out to `claude -p` so it uses the locally authenticated subscription rather
than an API key, mirroring the pattern already used in workspace/workflows/.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class AgentResult:
    ok: bool
    text: str
    cost_usd: float | None
    turns: int | None
    raw: dict | None


def run(
    prompt: str,
    cwd: Path,
    model: str = "opus",
    timeout: float = 3600.0,
    allowed_dirs: list[Path] | None = None,
    resume: str | None = None,
) -> AgentResult:
    cwd = Path(cwd)
    cwd.mkdir(parents=True, exist_ok=True)

    cmd = [
        "claude",
        "-p",
        "--permission-mode", "bypassPermissions",
        "--model", model,
        "--output-format", "json",
    ]
    for d in allowed_dirs or []:
        cmd += ["--add-dir", str(d)]
    if resume:
        cmd += ["--resume", resume]   # pick a session back up with its context intact

    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            cwd=str(cwd),
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return AgentResult(False, f"coding agent timed out after {timeout:.0f}s", None, None, None)

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout).strip()
        # Keep the tail: on an API error the useful line is the last one, not the first.
        return AgentResult(False, f"claude exited {proc.returncode}: {detail[-1500:]}", None, None, None)

    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return AgentResult(True, proc.stdout, None, None, None)

    return AgentResult(
        ok=not payload.get("is_error", False),
        text=payload.get("result", ""),
        cost_usd=payload.get("total_cost_usd"),
        turns=payload.get("num_turns"),
        raw=payload,
    )
