"""S3 -- Style retrieval, by provenance.

The question this stage answers is not "what should the environment look like" but
"where would this data actually live". Configuration records with a precedence order
come out of a config management system; trip records and zone lookups come out of a
fleet or dispatch platform; build reports come out of CI. Find the software that would
really hold this data, look at it, and build in its image.

That is what makes the environment convincing, and it is more honest than picking an
aesthetic: an interface that looks like the system the data came from is one an agent
might genuinely encounter, and its conventions are the ones a practitioner would expect.
Market leaders are fair game -- if the data would live in the best-known product of its
category, that product is exactly the right reference.

Diversity takes care of itself. Different tasks carry data from different systems, so
the references differ without anyone having to force it.

Both the extracted style and the captured screenshots travel to S4, and the coding agent
is told to look at the images: a rendered interface carries density, rhythm and restraint
that a list of tokens cannot.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import agent
import taskref

REFS = Path("refs")
SHOTS = REFS / "shots"
STYLES = REFS / "styles"

PROMPT = """\
Work out what this environment should look like, by finding the software this data would
really come from.

## 1. Trace the provenance

Read `task_card.json` and **open the files in `input/`** — the real ones, not the names.
Then answer: in the real world, what system produces or manages data like this? What
would an operator have had open when this data was created?

Look at what the data actually is. Field names, identifiers, units, the vocabulary of
the domain, the shape of the records, what a row represents. A layered configuration
with a precedence order belongs to a config or feature-flag platform. Trip records with
zone lookups belong to a dispatch or fleet system. Work items with states belong to an
issue tracker. Let the content tell you.

Name **{n} real products** that would plausibly hold it. Prefer the ones a practitioner
in that field would actually use — including the market leader, if that is where this
data would live. The best-known product of a category is often exactly the right
reference, because its conventions are the ones the domain has settled on.

## 2. Look at their interfaces

Use WebSearch and WebFetch to find their UI: documentation, product tours, marketing
pages, review-site galleries, changelog posts. Where a product has a public demo,
sandbox or interactive tour, capture it:

```bash
npx playwright screenshot --viewport-size=1440,900 --wait-for-timeout=3000 <url> {shots_dir}/<name>.png
```

That also works on any page carrying a large product screenshot. Capture around
{n_shots} images, then **open them and look**. You are extracting a visual language, and
you cannot do that from a URL. If a capture fails or hits a login wall, move on.

## 3. Write the style file

Write it to exactly this path, and nowhere else:

**`{style_path}`**

```json
{{
  "provenance": "what system this data would really come from, and why you concluded that",
  "layout_dsl": ["Sidebar-Left", "Top-Breadcrumb", "Dense-Table", "Light-Theme"],
  "reference_products": ["what you looked at, and what each contributed"],
  "design_tokens": {{
    "palette": "...", "typography": "...", "density": "...",
    "components": "...", "spacing": "..."
  }},
  "structural_notes": "how these products organise a screen -- where navigation lives, how a list relates to a detail surface, what the chrome around the content is made of, what vocabulary and units appear in the UI",
  "reference_shots": ["refs/shots/<file>.png", "..."]
}}
```

Be specific enough to build from. "Muted greys" is not a palette; "near-white canvas,
white cards on it, a single blue reserved for links and primary actions, status colour
only in small chips" is. Say what you actually saw — including the restraint. Where real
products *don't* put colour or borders is as informative as where they do, and it is
what generated interfaces most often get wrong.

## Boundaries

Take the structure, the visual language and the domain vocabulary. Do not take brand
identity: no product names, logos, wordmarks or taglines in the built environment. The
result is a fictional product that looks like it belongs in that category — not a clone
of any one of them.
"""


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80]


def retrieve(
    task: taskref.Task,
    model: str = "opus",
    refresh: bool = False,
    n_products: int = 3,
    n_shots: int = 5,
) -> dict | None:
    style_path = (task.work_dir / "style.json").resolve()

    # Keyed per task: provenance follows the data, so two tasks in one domain can come
    # from quite different systems and should not share a look.
    cached = STYLES / f"{_slug(task.ref)}.json"
    if cached.exists() and not refresh:
        print(f"cache hit: {cached}")
        style = json.loads(cached.read_text(encoding="utf-8"))
        style_path.write_text(json.dumps(style, indent=2, ensure_ascii=False))
        return style

    SHOTS.mkdir(parents=True, exist_ok=True)
    STYLES.mkdir(parents=True, exist_ok=True)

    prompt = PROMPT.format(
        n=n_products,
        n_shots=n_shots,
        shots_dir=SHOTS.resolve(),
        style_path=style_path,
    )
    res = agent.run(prompt, cwd=task.work_dir, model=model, allowed_dirs=[REFS.resolve()])
    if not res.ok:
        print(f"searcher failed: {res.text[:400]}")
        return None

    if not style_path.exists():
        # The shots live under refs/, so a stray write lands there rather than nowhere.
        stray = next((p for p in REFS.rglob("style.json")), None)
        if stray is None:
            print("searcher produced no style.json")
            return None
        print(f"style.json landed in {stray}; moving into place")
        shutil.move(str(stray), style_path)

    style = json.loads(style_path.read_text(encoding="utf-8"))
    cached.write_text(json.dumps(style, indent=2, ensure_ascii=False))
    return style


if __name__ == "__main__":
    import sys

    batch_root, ref = sys.argv[1], sys.argv[2]
    task = taskref.load(batch_root, ref)

    print(f"S3 style retrieval: {task.ref}")
    style = retrieve(task)
    if not style:
        sys.exit(1)

    print(f"  provenance : {str(style.get('provenance', ''))[:200]}")
    print(f"  layout DSL : {', '.join(style.get('layout_dsl', []))}")
    print(f"  products   : {len(style.get('reference_products', []))}")
    shots = [s for s in style.get("reference_shots", []) if Path(s).exists()]
    print(f"  shots      : {len(shots)} captured")
    for k, v in style.get("design_tokens", {}).items():
        print(f"    {k:<12} {str(v)[:110]}")
