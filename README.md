# task_enhancer

Turns CLI-solvable benchmark tasks into tasks that also require GUI ability, by moving
each task's input data out of a file and into a purpose-built web application. The
agent can no longer read the data — it has to search, filter, paginate, expand, export
and click its way to it.

**The invariant:** only *how the data is obtained* changes. The success criterion never
does. Each task's original verifier is copied byte for byte, so an enhanced task
inherits its ground truth for free.

## Layers

| Layer | Content | Freedom |
|---|---|---|
| Fact | the task's original input data | none — the AI never generates a data value; values are injected verbatim |
| Logic | the FSM: states, actions, and how each fact is earned | high — freely generated, lightly validated |
| Presentation | layout, styling, components, interactions, chrome | unlimited |

The FSM guides generation and gives validation something to check against. It says
*which fact is contingent on which interaction*, never which DOM structure, selector or
component to use — those are the coding agent's to choose, which is where richness
comes from.

## Pipeline

```
CLI task + input data
 → S0  fact extraction        pipeline/s0_facts.py      C, and the answer-critical subset F
 → S1  FSM synthesis          pipeline/s1_fsm_synth.py  propose → validate → improve
 → S2  FSM validation         pipeline/s2_fsm_validate.py  coverage / paths / reachability / budget
 → S3  style retrieval        pipeline/s3_style_rag.py  real product screenshots → layout DSL
 → S4  code synthesis         pipeline/s4_codegen.py    GUI + ground_truth.spec.ts, one pass
 → S5  verify + repair        pipeline/s5_repair.py     run the spec, feed failures back
 → S6  emit bundle            pipeline/s6_emit.py       rewritten task + untouched verifier
```

### S0 — fact extraction

Ablation, so it works for any task with a reference solution rather than needing
per-task authoring: a field is answer-critical iff perturbing it changes the reference
answer. Candidate perturbations are drawn from the field's *observed value domain*,
which is what catches selection fields — mutating a branch to `release/2.4_X` never
changes the answer, but swapping it to the observed value `main` does.

F is split by role:

- **payload** — the value is consumed by the answer (a qualifying build's duration)
- **selection** — the value decides whether a record is in the answer set at all
  (every build's branch and status). A filter control can satisfy these without
  exposing rows one by one.

### S1 — FSM synthesis

`propose → validate → improve` until the validator accepts. The FSM is where richness
comes from, so the proposer is deliberately under-constrained: acquisition modalities
are offered as inspiration and it is pushed to invent past them. What it may not do is
be incoherent, which is what validation is for.

Open-ended generation drifts into mode collapse on its own, so two forces push back: a
per-run seed that picks an unfamiliar product genre, and the pool of FSMs already
synthesised (`refs/fsm_pool.jsonl`), handed to the proposer as shapes to avoid.

Validation is two-sided — S2 for structure, and a critic agent for what structure cannot
express: whether the barriers are real or decorative, whether the interactions fall
where the task's own work falls, and whether one mechanism is doing all the work.

Since the FSM travels onward to the coding agent, a programmatic leak check rejects any
FSM that names a concrete data value or the answer.

### S2 — validation

The cheap gate, before any coding-agent tokens are spent:

- **coverage** — every fact in F is claimed by some acquisition entry
- **paths** — every acquisition path actually chains on the action graph and lands in
  the state the fact is declared to surface in. A synthesised FSM will happily list a
  plausible-looking sequence that does not chain; caught here it costs nothing, caught
  in S5 it costs a coding-agent run.
- **reachability** — no orphaned states, no dangling edges
- **no dead ends** — from every reachable state, every acquisition state must remain
  reachable. Forward reachability from `s0` is not enough: a synthesised FSM readily
  produces one-way doors, where committing to a scope or drilling into a segment has no
  edge back. Everything still looks reachable from the start, but an agent that explores
  before it commits can strand itself. The result is an environment solvable only by an
  agent that *never* explores — which penalises exactly the behaviour a benchmark should
  reward. (This check found three such errors in the hand-written FSM: `s_exported`,
  `s_detail_timing` and `s_detail_commit` were all modelled as terminal states, though
  in a real app neither downloading nor hovering takes you anywhere.)
- **budget** — the estimated cost of collecting F sits inside `[min, max]`. The lower
  bound is what makes the environment worth testing; the upper bound is what stops it
  degenerating into paging through twenty-five screens, a test of patience rather than
  capability.

### S3 — style retrieval

There is no screenshot corpus to draw on, so the searcher goes and gets one: it works
out which real products occupy the domain, finds their interfaces on the open web,
screenshots the public demos with `npx playwright screenshot`, and looks at what it
captured. It is told to prefer the less obvious names over the market leader, whose look
is the one everything already imitates.

Both the extracted `style.json` and the captured images travel to S4, and the coding
agent is told to look at the images before writing any CSS. Prose cannot carry how tight
the rows actually are or how little colour real software uses — and what gets recorded
includes the *restraint*: "no vertical rules and no zebra striping", "a sidebar that is
just a flat list of link text with no icons". That absence is exactly what generated UI
gets wrong, since an unconstrained model piles on borders, fills and icons.

Only structure and visual language are taken, never brand identity — the environments
are fictional products that look professionally built, not clones.

Eight look-seeds (dense operator console, restrained whitespace, dark technical tool,
conservative enterprise, and so on) vary the visual direction per run, and the cache key
includes the look, so repeated synthesis in one domain does not converge.

Measured effect: without S3 the coding agent settles on the same generic admin look
every time — dark sidebar, card-wrapped table, blue link-coloured ids, full-width top
bar. With retrieved references it produced a two-tier icon-rail navigation, a bare dense
table at 20 rows per viewport instead of 12, monospace metadata and no global top bar.
The value is less "prettier" than "off the default attractor", which is the whole point.

### S4 — code synthesis

The coding agent produces the app **and** the ground-truth Playwright spec in one pass.
It has to be the same agent: acquisition modalities are free-form, and "expand a tab,
export, parse the CSV" or "collect thirty datapoints scattered across as many detail
pages" cannot be mechanically expanded from an FSM template. Only the author of those
interactions knows how to walk them.

What keeps the spec honest is a separation rather than a restriction: it may encode
*how to reach* a value but never the value itself. Expectations are read from
`server/data.json` at runtime, so there is nowhere to hardcode an answer.

### S5 — verification

A green spec establishes data fidelity, reachability of every answer-critical fact, and
solvability all at once — the spec is a constructive proof that a working trajectory
exists. The answer it reconstructs is then checked by the task's *original* verifier.
Five repair rounds, then discard and resample rather than nurse.

### S6 — bundle

The bundle is split by audience, because the one thing that would undo the entire
enhancement is handing the agent the original input:

- `agent/` — the rewritten task statement. All the agent under test may see.
- `grading/` — verifier, reference solution, original input. Harness-side only.

## Usage

```bash
python3 pipeline/s0_facts.py        tasks/<task> input/<data>.json
python3 pipeline/s2_fsm_validate.py tasks/<task>
python3 pipeline/s4_codegen.py      tasks/<task> envs/<task> 5173
python3 pipeline/s5_repair.py       tasks/<task> envs/<task> 5173
python3 pipeline/s6_emit.py         tasks/<task> envs/<task> 5173
```

Adding a task needs `task.md`, `input/`, `reference_solution.py` exposing `solve()`,
and `verifier.py`. S0 derives the rest.

## Worked example: `tasks/ci-build-audit`

48 CI build records; the answer needs the total duration of failed `main` builds and
the longest one's commit sha. S0 finds 39 answer-critical facts (13 payload, 26
selection) and correctly excludes the 18 records more than one field-flip from the
answer set, plus the three non-longest shas.

The FSM mixes three acquisition modalities so the environment cannot be beaten one way:

- **branch/status** — never rendered as list columns; earned by opening an Actions tab
  and exporting a CSV. The export deliberately omits duration and sha.
- **duration** — no surface lists durations together; each one is a hover tooltip on
  its own build's detail page, so the sum is assembled one datapoint at a time.
- **commit sha** — full value only inside a collapsed section, and which build to read
  it from is unknowable until the durations are in.

## Deferred

- **Leak prevention.** An agent that can read the DOM or run JS may be able to take the
  data in one shot and bypass the interactions entirely. The direction is a backend
  that only serves per-state slices mirroring the FSM.
- **Distractor safety.** No fabricated records are injected — only genuine non-critical
  corpus rows are used as noise — so the original answer is structurally safe without
  an audit. Injecting synthetic data would require re-running the reference solution to
  prove the answer is unchanged.
- **CLI-baseline audit, novelty rejection sampling, diversity metrics.** Once a batch
  of environments exists.
