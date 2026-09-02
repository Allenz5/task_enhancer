"""Text values for a noise generator, from an LLM, cached so a rerun is identical.

`filler.task.py` computes numbers, dates, ids and foreign keys itself -- those are rules
the planning agent wrote down and a script can execute. Text cannot be executed into
existence: a job description, a company blurb, an incident summary. Those come from here.

The cache is what makes step 2 an execution step rather than a second act of authoring.
A request is keyed by (field, prompt, n); the same script run twice with the same seed
hits the cache and produces byte-identical rows, so when step 3 finds a problem only the
part that actually changed is regenerated.

Used from inside a generator script:

    from textgen import text
    titles = text("jobName", "40 job titles for mid-level backend roles ...", 40)
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "store" / "text_cache.json"
BATCH = 40
MODEL = "sonnet"

INSTRUCTION = """\
Write {n} values for the field `{field}`.

{prompt}

Rules:
- Output a JSON array of exactly {n} strings. No prose, no markdown fence, nothing else.
- English only.
- Every value must be distinct, and distinct from the values already used below.
- These are filler records in a mock application: plausible and mundane, never
  attention-seeking, never referring to a real company, person or product.

Already used, do not repeat or paraphrase:
{used}
"""


def _load() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def _save(cache: dict) -> None:
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")


def _ask(field: str, prompt: str, n: int, used: list[str]) -> list[str]:
    sample = used[-30:]
    body = INSTRUCTION.format(
        n=n, field=field, prompt=prompt,
        used="\n".join(f"- {u}" for u in sample) if sample else "(nothing yet)")
    proc = subprocess.run(
        ["claude", "-p", "--model", MODEL, "--output-format", "json"],
        input=body, capture_output=True, text=True, timeout=900)
    if proc.returncode != 0:
        raise RuntimeError(f"textgen: claude exited {proc.returncode}: "
                           f"{(proc.stderr or proc.stdout)[-1000:]}")
    result = json.loads(proc.stdout).get("result", "")
    start, end = result.find("["), result.rfind("]")
    if start < 0 or end < 0:
        raise RuntimeError(f"textgen: no JSON array in reply for {field}: {result[:500]}")
    values = json.loads(result[start:end + 1])
    if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
        raise RuntimeError(f"textgen: reply for {field} is not an array of strings")
    return values


def text(field: str, prompt: str, n: int) -> list[str]:
    """Return `n` distinct strings for `field`, from cache when it has been asked before."""
    key = hashlib.sha256(f"{field}\0{prompt}\0{n}".encode("utf-8")).hexdigest()[:16]
    cache = _load()
    if key in cache and len(cache[key]) >= n:
        return cache[key][:n]

    out: list[str] = []
    rounds = (n + BATCH - 1) // BATCH + 3   # a round that returns only repeats still ends
    while len(out) < n and rounds > 0:
        rounds -= 1
        for value in _ask(field, prompt, min(BATCH, n - len(out)), out):
            if value not in out:
                out.append(value)
    out = out[:n]
    if len(out) < n:
        raise RuntimeError(f"textgen: only got {len(out)}/{n} distinct values for {field}")

    cache[key] = out
    _save(cache)
    return out
