"""S5 -- Runtime verification and self-repair.

Running `ground_truth.spec.ts` green establishes three things at once:

  data fidelity   every acquired value matches server/data.json byte for byte
  reachability    every answer-critical fact really is obtainable through its modality
  solvability     a working trajectory exists, and the spec is its constructive proof

The reconstructed answer is then checked against the task's original, untouched CLI
verifier. That is the guarantee that the enhancement changed only how the data is
obtained and not what counts as a correct answer.

On failure the diagnostics go back to the coding agent. After MAX_ROUNDS the
environment is discarded rather than nursed -- resampling is cheaper than rescuing.
"""

from __future__ import annotations

import json
import socket
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path

import agent

MAX_ROUNDS = 5
SERVER_BOOT_TIMEOUT = 60.0

REPAIR_PROMPT = """\
The environment you built in this directory does not pass its own ground-truth spec.

## What failed

```
{diagnostics}
```

## Fix it

Work out the real cause and repair it. Both the app and `ground_truth.spec.ts` are
yours to change — the spec may be wrong about how to reach a value, or the app may be
failing to expose it through the modality `fsm.json` promises.

Two things stay fixed while you do:

- Every value still comes from `server/data.json` at runtime. Never type a data value
  into any file, and never relax an assertion to make it pass. If a value is genuinely
  unreachable, fix the app so the interaction yields it — do not lower the bar.
- The `states[].visible_data` contract in `fsm.json` still holds. Do not fix a
  retrieval failure by rendering the value somewhere earlier and easier; that would
  dismantle the barrier the environment exists to create.

When done, confirm the whole flow yourself: start the server, run the spec, and check
`ground_truth_answer.json`.
"""


def _port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex((host, port)) == 0


@contextmanager
def serve(env_dir: Path, port: int):
    """Bring up the environment's server, tear it down afterwards."""
    log = (env_dir / ".server.log").open("w")
    proc = subprocess.Popen(
        ["npm", "start"],
        cwd=str(env_dir),
        stdout=log,
        stderr=subprocess.STDOUT,
        env={**__import__("os").environ, "PORT": str(port)},
    )
    try:
        deadline = time.time() + SERVER_BOOT_TIMEOUT
        while time.time() < deadline:
            if _port_open(port):
                break
            if proc.poll() is not None:
                raise RuntimeError(
                    f"server exited early ({proc.returncode}):\n"
                    + (env_dir / ".server.log").read_text()[-3000:]
                )
            time.sleep(0.4)
        else:
            raise RuntimeError(f"server never listened on :{port} within {SERVER_BOOT_TIMEOUT:.0f}s")
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()


def run_spec(env_dir: Path, timeout: float = 600.0) -> tuple[bool, str]:
    proc = subprocess.run(
        ["npx", "playwright", "test", "--reporter=list"],
        cwd=str(env_dir),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return proc.returncode == 0, (proc.stdout + "\n" + proc.stderr).strip()


def check_answer(task_dir: Path, env_dir: Path) -> tuple[bool, str]:
    """Run the task's ORIGINAL verifier against the answer the spec reconstructed."""
    answer = env_dir / "ground_truth_answer.json"
    if not answer.exists():
        return False, "ground_truth_answer.json was never produced"
    proc = subprocess.run(
        ["python3", "verifier.py", str(answer.resolve())],
        cwd=str(task_dir),
        capture_output=True,
        text=True,
    )
    return proc.returncode == 0, (proc.stdout + proc.stderr).strip()


def verify_once(task_dir: Path, env_dir: Path, port: int) -> tuple[bool, str]:
    try:
        with serve(env_dir, port):
            spec_ok, spec_out = run_spec(env_dir)
    except RuntimeError as e:
        return False, f"[server]\n{e}"

    if not spec_ok:
        return False, f"[playwright]\n{spec_out[-6000:]}"

    ans_ok, ans_out = check_answer(task_dir, env_dir)
    if not ans_ok:
        return False, (
            "[original CLI verifier]\n"
            "The spec passed its own assertions but the reconstructed answer is wrong, "
            "so the collection logic is acquiring the wrong set of facts.\n" + ans_out
        )
    return True, spec_out[-2000:]


def repair_loop(task_dir: Path, env_dir: Path, port: int = 5173, model: str = "opus") -> bool:
    task_dir, env_dir = Path(task_dir), Path(env_dir)

    # env_dir must be a single environment, not the directory that holds them. Pointing
    # at envs/ instead of envs/<task> makes `npm start` fail with a bare ENOENT, which
    # reads to the repair agent as an app defect and burns every round chasing one.
    missing = [f for f in ("package.json", "server/data.json") if not (env_dir / f).exists()]
    if missing:
        print(f"not an environment directory: {env_dir} (missing {', '.join(missing)})")
        print(f"  expected usage: s5_repair.py {task_dir} envs/<task> {port}")
        return False

    for round_no in range(1, MAX_ROUNDS + 1):
        ok, diagnostics = verify_once(task_dir, env_dir, port)
        if ok:
            print(f"round {round_no}: PASS")
            print(f"  answer: {json.loads((env_dir / 'ground_truth_answer.json').read_text())}")
            return True

        print(f"round {round_no}: FAIL")
        print("  " + diagnostics.replace("\n", "\n  ")[:1500])

        if round_no == MAX_ROUNDS:
            print(f"\nexhausted {MAX_ROUNDS} repair rounds -- discard and resample")
            return False

        print(f"  -> handing diagnostics back to the coding agent")
        res = agent.run(REPAIR_PROMPT.format(diagnostics=diagnostics), cwd=env_dir, model=model)
        if not res.ok:
            print(f"  repair agent failed: {res.text[:500]}")
            return False

    return False


if __name__ == "__main__":
    import sys

    task_dir = Path(sys.argv[1])
    env_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("envs") / task_dir.name
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 5173

    print(f"S5 verify+repair: {env_dir} (port {port})")
    sys.exit(0 if repair_loop(task_dir, env_dir, port) else 1)
