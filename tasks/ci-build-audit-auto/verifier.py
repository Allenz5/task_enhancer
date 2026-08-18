"""Original CLI verifier. NEVER modified by the GUI-enhance pipeline."""
import json, sys
from pathlib import Path
from reference_solution import solve

def verify(answer_path, input_path="input/builds.json"):
    expected = solve(json.loads(Path(input_path).read_text()))
    actual = json.loads(Path(answer_path).read_text())
    errors = []
    for k, v in expected.items():
        if actual.get(k) != v:
            errors.append(f"{k}: expected {v!r}, got {actual.get(k)!r}")
    return (not errors), errors

if __name__ == "__main__":
    ok, errs = verify(sys.argv[1])
    print("PASS" if ok else "FAIL:\n  " + "\n  ".join(errs))
    sys.exit(0 if ok else 1)
