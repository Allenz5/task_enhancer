"""describe -- reference/ -> description.md

The one lossy step. Whatever the reference is (screenshots, captured API responses, DOM
notes, video frames), the agent writes down what it can actually see: which pages exist,
what each shows, which interactions exist, what the data looks like, and what the real
product does *not* have. build.py implements this document, and drive.py judges against
it -- so anything missed here is missed for good, and anything invented here gets built.
The prompt therefore asks for observations and marks guesses as guesses.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agent  # noqa: E402

PROMPT = """\
Write **`description.md`** in this directory: the specification a builder will implement
a clone of this product from, and the document a later reviewer will judge that clone
against. Nothing else feeds the builder. Anything you leave out will not be built;
anything you make up will be built.

## Source

Everything is in `reference/`. **Open every file.** Screenshots: look at them. Captured
API responses or field lists: read them fully -- real field names are worth more than
anything you can infer from a picture. Notes: read them. There is no other source.

## What to write

### 1. Pages
For each page or view: what it is for, how you get to it, what it shows, in what layout
(columns / cards / two-pane / form). Name the fields visible on it.

### 2. Interactions
Every way a user changes what they see: search, filter dimensions and their option sets
(copy the options verbatim when the reference shows them), sort, paging (page size, what
the control looks like), opening a record, expanding sections, export (what formats, what
options), anything else. Say what each one reveals that was not visible before.

### 3. Data model
The entities and their fields. For each field: its name (say whether it is the product's
real field name from a captured API, or a name you are choosing), what it shows as on
screen, its type, and which page(s) it appears on. Note which field identifies a record
and which fields look like they partition the data (city, project, folder, date range).

### 4. What the product does NOT have
Things a builder might assume and wrongly add: no export, no login, no bulk view, no
search on some page. This section prevents invention.

### 5. Uncertain
What the reference does not show. Paging behaviour you could not observe, states you did
not see, fields whose meaning is unclear. Put it here rather than guessing in sections
1-3.

## Discipline

- Describe what you observed. Where you infer, say "likely" and put it in section 5 too.
- Say where the real product is *restrained*: no colour, no borders, no chrome. That is as
  important as where it puts them, and it is what clones most often get wrong.
- Do not describe brand identity (logo, wordmark, product name). The clone will be a
  fictional product in the same category.
"""


def describe(skel: Path, model: str = "opus") -> bool:
    if not (skel / "reference").is_dir() or not any((skel / "reference").iterdir()):
        print(f"{skel}/reference/ is empty -- there is nothing to describe")
        return False
    res = agent.run(PROMPT, cwd=skel, model=model)
    if not res.ok:
        print(f"describe failed: {res.text[:600]}")
        return False
    out = skel / "description.md"
    if not out.exists():
        print("agent finished but wrote no description.md")
        return False
    print(f"description.md: {len(out.read_text(encoding='utf-8').splitlines())} lines")
    if res.cost_usd:
        print(f"[{res.turns} turns, ${res.cost_usd:.2f}]")
    return True


if __name__ == "__main__":
    sys.exit(0 if describe(Path(sys.argv[1])) else 1)
