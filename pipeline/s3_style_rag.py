"""S3 -- Style retrieval.

There is no screenshot corpus to draw on, so the searcher goes and gets one: it works
out which real products occupy the environment's domain, finds their interfaces on the
open web, screenshots the ones with public demos, and looks at what it captured.

The output is a `style.json` plus the captured images. Both travel to S4, and the
coding agent is told to *look* at the images rather than work from the prose alone --
a rendered interface carries density, rhythm and restraint that a list of tokens does
not.

What gets extracted is structure and visual language: how a dense table breathes, where
navigation sits, how much chrome surrounds the content. Never brand identity. The
environments are fictional products that look professionally built, not clones of real
ones, so names, logos and wordmarks are deliberately left behind.

Results are cached under refs/ by domain, since fetching is the slow part; the genre
seed varies per run so repeated synthesis in one domain does not converge on one look.
"""

from __future__ import annotations

import json
import random
import re
import shutil
from pathlib import Path

import agent

REFS = Path("refs")
SHOTS = REFS / "shots"
STYLES = REFS / "styles"

# Only the axis, not the answer -- which products occupy it is the searcher's to work out.
LOOK_SEEDS = [
    "a dense, information-rich operator console that trusts the user",
    "a calm, spacious product with generous whitespace and few borders",
    "a dark-themed technical tool with monospace accents",
    "an enterprise application with a formal, conservative visual language",
    "a modern SaaS product with soft shadows and rounded surfaces",
    "a utilitarian internal tool that looks built by engineers, not designers",
    "a data-heavy analytics surface where charts dominate the layout",
    "a document-centric interface built around reading long text",
]

PROMPT = """\
Work out what this environment should *look* like, by going and finding real software.

The environment: **{app_concept}**
Its domain: **{domain}**

## 1. Find the real products

Work out which real products occupy this domain — the ones a practitioner would
actually have open. Aim for {n} of them, and prefer the less obvious names over the
market leader; the leader's look is the one everything already imitates.

## 2. Look at their interfaces

Use WebSearch and WebFetch to find their UI: documentation sites, marketing pages,
product tours, review-site screenshot galleries, changelog posts.

Where a product has a **public demo, sandbox, or interactive tour**, capture it:

```bash
npx playwright screenshot --viewport-size=1440,900 --wait-for-timeout=3000 <url> {shots_dir}/<name>.png
```

That also works on any marketing or docs page carrying a large product screenshot.
Capture {n_shots} or so images total, then **open them and look at them** — you are
extracting a visual language, and you cannot do that from a URL.

If a capture fails or a page turns out to be a login wall, move on rather than
retrying; there are always other products.

## 3. Write the style file

Write it to exactly this path, and nowhere else:

**`{style_path}`**

```json
{{
  "layout_dsl": ["Sidebar-Left", "Top-Breadcrumb", "Dense-Table", "Light-Theme"],
  "reference_products": ["what you looked at, and what each contributed"],
  "design_tokens": {{
    "palette": "...", "typography": "...", "density": "...",
    "components": "...", "spacing": "..."
  }},
  "structural_notes": "how the real products organise a screen -- where navigation lives, how a list relates to a detail surface, what the chrome around the content is made of",
  "reference_shots": ["refs/shots/<file>.png", "..."]
}}
```

Be specific enough to build from. "Muted greys" is not a palette; "near-white canvas,
white cards on it, a single blue reserved for links and primary actions, status colour
used only in small chips" is. Say what you actually saw, including the restraint —
where real products *don't* put colour or borders is as informative as where they do.

Lean this run toward **{look}**, unless the domain genuinely resists it.

## Boundaries

Extract structure and visual language. Do not carry over brand identity: no product
names, logos, wordmarks or taglines in `style.json` beyond the `reference_products`
credits, and nothing that would make the built environment read as a real company's
software. The goal is a fictional product that looks professionally designed.
"""


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def retrieve(
    task_dir: Path,
    seed: int | None = None,
    model: str = "opus",
    refresh: bool = False,
    n_products: int = 3,
    n_shots: int = 5,
) -> dict | None:
    task_dir = Path(task_dir)
    fsm = json.loads((task_dir / "fsm.json").read_text())
    domain = fsm["meta"]["domain"]
    app_concept = fsm["meta"]["app_concept"]

    seed = seed if seed is not None else random.randrange(10**6)
    rng = random.Random(seed)
    look = rng.choice(LOOK_SEEDS)

    cache_key = f"{_slug(domain)}--{_slug(look)}"
    cached = STYLES / f"{cache_key}.json"
    if cached.exists() and not refresh:
        print(f"cache hit: {cached}")
        style = json.loads(cached.read_text())
        (task_dir / "style.json").write_text(json.dumps(style, indent=2))
        return style

    SHOTS.mkdir(parents=True, exist_ok=True)
    STYLES.mkdir(parents=True, exist_ok=True)

    style_path = (task_dir / "style.json").resolve()
    prompt = PROMPT.format(
        app_concept=app_concept,
        domain=domain,
        n=n_products,
        n_shots=n_shots,
        shots_dir=SHOTS.resolve(),
        style_path=style_path,
        look=look,
    )
    res = agent.run(prompt, cwd=task_dir, model=model, allowed_dirs=[REFS.resolve()])
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

    style = json.loads(style_path.read_text())
    style["_seed"] = seed
    style["_look"] = look
    style_path.write_text(json.dumps(style, indent=2))
    cached.write_text(json.dumps(style, indent=2))
    return style


if __name__ == "__main__":
    import sys

    task_dir = Path(sys.argv[1])
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else None
    print(f"S3 style retrieval: {task_dir} (seed {seed})")
    style = retrieve(task_dir, seed)
    if not style:
        sys.exit(1)
    print(f"  look       : {style.get('_look')}")
    print(f"  layout DSL : {', '.join(style.get('layout_dsl', []))}")
    print(f"  products   : {len(style.get('reference_products', []))}")
    shots = [s for s in style.get("reference_shots", []) if Path(s).exists()]
    print(f"  shots      : {len(shots)} captured")
    for k, v in style.get("design_tokens", {}).items():
        print(f"    {k:<12} {str(v)[:110]}")
