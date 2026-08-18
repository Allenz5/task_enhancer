"""Reference solution. Also used by S0 to trace which facts the answer depends on."""
import json, sys
from pathlib import Path

def solve(builds):
    target = [b for b in builds if b["branch"] == "main" and b["status"] == "failed"]
    longest = max(target, key=lambda b: b["duration_sec"])
    return {
        "total_failed_duration_sec": sum(b["duration_sec"] for b in target),
        "longest_failure_commit_sha": longest["commit_sha"],
    }

if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "input/builds.json")
    print(json.dumps(solve(json.loads(src.read_text())), indent=2))
