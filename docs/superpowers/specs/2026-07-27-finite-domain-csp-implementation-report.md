# Finite-domain constraint solving — implementation report

Date: 2026-07-27
Spec: `2026-07-27-finite-domain-csp-generation-spec.md`
Base: `87c8de12c` (head of `claude/synthetic-data-validation-2b18a2`, PR #1108)

This report records the evidence for the spec's eight completeness criteria.
Every number below was produced by a run in this branch's history; the
commands are reproducible from the committed corpus harness
(`packages/protocol-utilities/src/__tests__/generateNetwork.corpus.test.ts`),
which scales through `CORPUS_SHAPES` / `CORPUS_SEEDS` / `CORPUS_SHARD`
environment variables.

## What was built

- `constraints/solver.ts` — domain enumeration over generator-reachable
  values, constraint-graph connected components over groups, tractability
  gating, and complete backtracking search (AC-3 preprocessing, MRV
  selection, forward checking, seeded value ordering, node budget).
- `constraints/solverLimits.ts` — the three tractability constants, with the
  measurement-based reasoning in place.
- `analyseFeasibility` runs the search on every tractable component no other
  check has already refused; exhausting a component's space is reported as a
  new conflict ("no combination of values these rules allow can satisfy all
  of them at once").
- `generateEntityAttributes` settles each tractable component per entity at
  its first drawn group: unique-registry values are excluded from the free
  groups' domains (own previous values released first), kept values enter as
  pins, and domains are searched in a seeded shuffle. Anything short of a
  solution — oversized, unknown, unsatisfiable — falls back to the untouched
  greedy path.
- A pre-existing soundness bug in `comparatorSpan` was fixed en route: a
  strict comparison between a scalar and a number stepped bounds by the
  _coarser_ end's unit, so `m[0,0] < s < n[1,1]` (satisfiable by
  `s = 0.5`) was refused. The gap is now the finer granularity, with
  per-end grid rounding; regression tests pin both directions.

## C1 — Feasibility is sound and complete below threshold

**20,000 randomly generated below-threshold protocols**, verdict compared
against a test-local brute-force oracle (own PRNG, own date arithmetic, own
domain construction, full-cartesian enumeration): **0 mismatches**.

Corpus distribution (family: total / accepted):

- chain (comparator chains of 3–5 edges, mixed strictness): 4,997 / 1,487
- pinned (tight bounds + differentFrom + comparators): 3,957 / 1,951
- sameAs (groups with differing member bounds, plus a rule): 3,047 / 2,290
- scalarPair (scalar-vs-scalar comparators): 1,954 / 1,954
- mixed (random soup over all five types): 6,045 / 5,443
- variable types across all shapes: number 32,248, datetime 17,084,
  scalar 6,443, boolean 5,278, ordinal 5,159
- overall: 13,125 accepted (65.6%), 6,875 refused (34.4%)

The first full-scale run caught one oracle blind spot rather than a solver
defect: a number ordered against a scalar can be left a fractional propagated
range (e.g. `[0.01, 0.99]`), where the generator's draw falls back to
two-decimal floats an integer-domain oracle cannot model. The solver already
declines those components (not crisply enumerable), so feasibility accepts
and greedy generation succeeds — verified and pinned as a dedicated
regression test over 500 seeds
(`generateNetwork.constraints.test.ts`, "generates a chain that forces a
number into a fractional range"). The corpus generator now keeps comparators
within one type, where reachability is exact; this residual cross-type family
is the documented boundary of the solver's claim.

## C2 — Accepted protocols always generate

Every accepted shape ran through `generateNetwork` (a two-node
name-generator protocol) on **500 consecutive seeds**, and every generated
node was checked against every rule of its shape: **6,562,500 runs
(13,125 × 500), 0 throws, 0 rule violations**.

The two named regressions:

- `A[3,4] differentFrom B; B[3,4]; D[2,4] <=A >=B` — pinned per-entity over
  500 seeds with full rule- and bound-checking: **500/500** (previously ~50%
  per entity, compounding to ~2.5% per multi-entity network).
- `a[3,4] differentFrom b; b[4,5] <= a` — now **refused** by
  `analyseFeasibility` with rules `differentFrom, lessThanOrEqualToVariable,
minValue, maxValue` (previously accepted, then threw seed-dependently).

## C3 — Generated data stays varied

200 entities per shape, one seeded run (gates: distinct ≥ min(S, 20), modal
≤ 40%):

| Shape                            | S   | Distinct | Modal |
| -------------------------------- | --- | -------- | ----- |
| `a < b` over `[0,9]`             | 45  | 41       | 11.0% |
| date chain `w < x < y` in 5 days | 10  | 10       | 31.5% |
| ring of 4 numbers over `[0,3]`   | 84  | 78       | 3.0%  |

The committed guard ("varies the assignment a solved component takes across
entities") enforces the S=45 case in CI.

## C4 — The node cap degrades safely

`solverCap.test.ts` mocks the limits module down to a 3-node budget — which
any five-variable component provably exceeds — and drives the real public
entry points: a five-boolean odd differentFrom ring (unsatisfiable, and
refused under the full budget by the normal suite) is **not refused**, and a
six-variable satisfiable ring **generates through the greedy path**. The
solver-level "unknown" verdict is unit-tested separately.

## C5 — Above-threshold behaviour is byte-identical

12 protocols whose constrained components all exceed the limits (unbounded
numbers, text, 12-option categorical, unbounded datetimes, thousand-wide
ranges, a nine-variable ring past the variable cap, unique-text and
unique-number interplay) × 50 seeds each, serialised in full (network,
stage metadata, step state) with entity uuids normalised to encounter-order
tokens (they are minted outside the seeded stream): **600 runs, byte-compared
with `cmp` between base `87c8de12c` and this branch: 0 mismatches.** A
same-commit double-run first established the capture itself is
deterministic.

## C6 — Performance is bounded and measured

- Development protocol, 100 sessions, same machine, warmed: base
  **9.48 ms/session**, branch **9.72 ms/session** (+2.5%; budget 20%).
- Adversarial per-entity micro-benchmark (2,000 entities per shape): worst
  shape mean **0.064 ms** (a 101×101-value scalar pair), worst single call
  **0.5 ms**. Across the 6.56M-run corpus the slowest single
  `generateNetwork` call was 92.8 ms (one outlier in an 820k-call process;
  process-wide mean ≈0.27 ms per two-node network).
- The limits (`MAX_COMPONENT_VARIABLES = 8`, `MAX_DOMAIN_PRODUCT = 200_000`,
  `MAX_SEARCH_NODES = 50_000`) are justified against these numbers where
  they are defined; the deepest search observed below the caps was a few
  hundred nodes.

## C7 — Nothing already working regresses

- `pnpm typecheck` 15/15, `pnpm test` all workspaces, `pnpm knip` clean.
- `packages/interview/src/forms/__tests__/syntheticDataConformance.test.ts`
  passes **unchanged** (no edits to the file).
- Both bundled protocols still pass the feasibility gate and generate.
- Every pre-existing behavioural pin in the constraints suites — headroom
  reservation, unique claim/release, pinned regeneration, distribution
  assertions — passes without modification; the only test-file changes are
  additions.

## C8 — Guards verified red by mutation

| Criterion | Mutation                                          | Failing guard and message                                                                                                                                                                                                    |
| --------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1        | feasibility's solver-unsat report short-circuited | corpus parity: `expected [ { index: 24, … } ] to deeply equal []` (`feasible: true, satisfiable: false`); plus "reports a differentFrom its comparator pins…", "reports an odd ring…", "reports two single-option ordinals…" |
| C2        | generation's component solve never consulted      | corner-shape 500-seed test and corpus generation: `threw: Synthetic data cannot be generated: this protocol declares validation rules that cannot all be satisfied together`                                                 |
| C3        | seeded shuffle replaced with identity ordering    | variation guard: `expected 1 to be greater than or equal to 20`                                                                                                                                                              |
| C5        | domain-product cap ignored                        | solver intractability guard: `expected { groups: [ 'b', 'a' ], … } to be undefined`; byteparity harness diverged from base                                                                                                   |

All mutations were reverted; the full suite (330 tests in
protocol-utilities) is green at the final commit.

## Explicitly out of scope, confirmed unchanged

Components above threshold fall back (C5 proves byte-identity). `unique`
remains a registry concern — inside a solve it is only a unary domain
restriction, re-solved per entity, and registry exhaustion still surfaces
through the existing `SyntheticDataConstraintError` draw path. Categorical
subset explosions fall back as expected.

## Addendum — reconciliation with the sixteen post-fork commits on #1108

The parent branch gained sixteen commits (twelve review fixes) after this
branch forked; `origin/claude/synthetic-data-validation-2b18a2` was merged
back in and every claim below was re-verified at the merged head. Where the
merge or the review changed a behaviour, the corpus evidence and benchmarks
in this addendum supersede the sections above.

### Consistency with the review fixes, item by item

- **Finite counts for open-sided spaces** (`3d21a2738`, `00424bbe9`): the
  solver does not consult `valueSpaceSize` for tractability; it enumerates
  from propagated **declared** bounds and deliberately declines open-sided
  numbers and half-open date windows, leaving their fallback windows to the
  greedy draw. Where the solver does engage, its domain size now equals
  `valueSpaceSize` exactly — asserted by a committed battery test across all
  six solvable types ("agrees with valueSpaceSize about the size of every
  enumerated domain").
- **Categorical unranking + `selectionSizeRange`** (`3d21a2738`): the solver
  now derives its subset sizes from `selectionSizeRange` — non-unique
  defaults cap at two selections, `unique` reaches every size, and a
  `minSelected` above the default cap becomes the single drawn size, exactly
  the draw's own count clamp. This also resolved a Codex review finding
  (P2): before, a `differentFrom` rule silently widened a variable's
  selections beyond anything the plain draw produces.
- **`numberDrawBounds`** (`3d21a2738`): not re-derived. The solver only
  engages when both propagated bounds exist, where `numberDrawBounds`
  returns the declared pair; open sides fall back to the greedy draw, which
  owns the slide-down and unique-headroom behaviour.
- **Date window shape changes** (`00424bbe9`): `resolveDateWindow` now fills
  an absent `max`, so more datetime components arrive fully bounded and
  solvable; a missing `min` still declines. `valueSpaceSize` purity is
  untouched by the solver (no wall-clock reads anywhere in it).
- **Bin-only variables** (`d40e479fe`): rules are stripped where the
  descriptors are built, and both feasibility and generation build through
  the same call, so a bin-only variable simply never forms a component.
- **Fixed attributes as inputs** (`0e401ebea`): roster rows and prompt
  `additionalAttributes` arrive as `existing` with `only` narrowing the
  draw, which the solve classifies as **pins** — pre-assigned variables the
  rest of the component is solved around. Covered end-to-end by a new
  `generateNetwork`-level test fixing a boolean by `additionalAttributes`
  inside a `differentFrom` pair ("solves the rest of a component around a
  prompt-fixed attribute").
- **Option-domain intersection for equality groups** (`d31b010bb`): the
  solver enumerates from the intersected group entry, so a narrowed option
  list narrows the domain automatically (pinned by "narrows a held-equal
  group domain to the options every member offers"); an empty intersection
  is refused by the group check before the solver ever runs.
- **Resolution-mismatched date comparators** (`b9b43a917`): `comparatorSpan`
  is undefined for them, so the component is declined and the greedy fold —
  which now skips the edge — keeps its behaviour (pinned by "declines a
  comparator between dates at different resolutions").
- **Reserved roster values** (`c6bb79ac7`, `8d849c4c0`): the solve now
  mirrors the draw's two-tier preference — a first pass excludes values the
  registry reserved for undrawn roster rows, and only if no solution exists
  without them does a second pass allow them (pinned by "prefers unreserved
  values in a solved component, taking reserved ones only at need").

### The count/reach relationship, per type

Where the solver engages, reach equals count exactly: number = integers in
the propagated declared bounds; scalar = the 0.01 grid between propagated
bounds; datetime = window steps at the shared resolution; ordinal = the
intersected option list; boolean = 2; categorical = all subsets of the
`selectionSizeRange` sizes, which is what both `valueSpaceSize` and the
unranked unique draw cover. The one deliberate divergence: a non-unique
`minSelected` above the default cap, where `valueSpaceSize` sums an empty
size range (0) while the draw and the solver emit size-`minSelected`
selections — mirroring the count there would have refused satisfiable
protocols, and the count is not consumed for non-unique variables. Where
the solver declines (open-sided numbers and dates, text, oversized
categoricals), the count may exceed what the solver would enumerate, and
the greedy draw — whose reach the parent branch aligned the count to — is
the path that runs.

### The headline, re-measured at the merged head

Measured with the corpus harness (4,000 shapes × 100 seeds) on the parent
head **without** the solver: **62 of 2,728 accepted shapes (2.3%) are
unsatisfiable yet accepted**, and **91 (3.3%) fail at draw time** — 8,558
throwing runs out of 264,242 (3.2%), all throws, zero silent violations
(the parent's fixes eliminated the silent-violation class; the
seed-dependent throw class remains). With the solver, both counts are zero
across the full 20,000-shape × 500-seed evidence run. The spec's original
"0.6% of accepted" figure came from the earlier review fuzzer and is
superseded by these corpus-measured rates.

### Codex review findings (PR #1109)

- **P1, categorical materialisation**: tractability is now judged by a
  closed-form `domainSize` pass before anything is materialised; an
  oversized component costs a binomial sum per entity instead of up to
  200,000 discarded subset arrays. Guarded by "declines a categorical whose
  combination space overflows the budget".
- **P2, categorical default cap**: adopted via `selectionSizeRange`, above.
- **P2, solver shuffling on the shared stream**: the solve now draws **one**
  value from the run's stream to seed a local PRNG and shuffles with that,
  so the stream advances by exactly one step per solved component whatever
  the search outcome — a capped or unsatisfiable solve cannot shift
  subsequent draws, and domain sizes never show through as extra
  consumption. Guarded by "consumes exactly one seeded draw for a solved
  component" and the cap-file's exact-count assertion.
- **P1 (second round), unique allocation capacity**: shuffling a `unique`
  group's domain let one entity take an allocation that stranded the next —
  `u` over `[0,1]`, `v` over `[1,2]`, `v > u` admits `(0,1)` then `(1,2)`,
  but a shuffled `(0,2)` first left the second entity nothing, a
  seed-dependent throw the old distinct-sequence ladder never produced.
  Unique groups now keep their ascending enumeration order — the same
  bottom-up consumption discipline as the sequence draw, and lexicographic
  search still backtracks within the entity — while groups without a
  registry slot keep the shuffle (their choices cost nothing across
  entities, and unique values already vary across entities through the
  ladder itself). This restores allocation parity with the pre-solver path;
  a global cross-entity unique constraint stays out of scope per the spec.
  Guarded by "allocates overlapping unique ranges so later entities keep a
  value" (100 seeds × 2 entities), mutation-verified red by re-shuffling
  unique domains.
- **P1 (third round), interacting unique slots**: with **two** unique groups
  in one component — `a` and `b` unique over `[0,2]`, `a differentFrom b`,
  three entities — no per-entity ordering is capacity-safe: bottom-up
  pairing allocates `(1,0)` then `(0,1)` and strands the third entity, while
  the greedy draw's per-slot **monotonic** sequences stay offset and reach
  `(1,0), (2,1), (0,2)`. Since cross-entity allocation is deliberately out
  of scope, a component with more than one free unique slot now **declines**
  and takes the greedy path untouched (zero stream footprint), preserving
  the sequence draw's proven allocation exactly. Single-unique components
  keep the bottom-up solve. Guarded by "leaves interacting unique groups to
  the sequence ladder" (60 seeds × 3 entities), mutation-verified red by
  re-allowing multi-unique solves.
- **P2 (third round), duplicate option values**: an imported protocol may
  list one categorical value under two labels; position-based enumeration
  fabricated multiset selections (`['x','x']`) the deduplicating draw can
  never produce. Domains now enumerate over distinct option values
  (first occurrence kept), with `domainSize` counting the same set. Guarded
  by "drops duplicate option values before enumerating selections",
  mutation-verified red by restoring the raw list.
- **P2 (third round), unknown must not unlock reserved values**: the second
  reserved-allowing pass now runs only on a **proven** `unsat`, never on
  `unknown` — an exhausted budget means unreserved assignments may remain
  unexplored, and is handled like any other exhausted budget (fallback). The
  distinction is not black-box observable at the real node budget (reserved
  values only widen the second search, so a pass-1 unknown implies a pass-2
  unknown in every constructible case); the change aligns the code with the
  documented "unknown reads as oversized" contract.

### The number-domain decision

The solver's number domain is **integers**, deliberately: it matches the
draw (which walks integers whenever the range holds one), keeps
`comparatorGap`'s whole-unit semantics, and keeps synthetic ages whole. The
consequence is accepted knowingly — `a < b < c` over `[0, 1]` stays
refused, matching the review decision that declined that claim — and the
propagated ranges that hold no integer (reachable only through
scalar-to-number chains) stay on the greedy path, which draws the
two-decimal fallback; that family is pinned by "generates a chain that
forces a number into a fractional range".

### Guards re-verified red at the merged head

All six mechanism mutations were re-run after the merge and the review
fixes:

| Mechanism disabled                | Failing guard and message                                              |
| --------------------------------- | ---------------------------------------------------------------------- |
| feasibility's solver-unsat report | corpus parity `feasible: true, satisfiable: false` (+3 targeted tests) |
| generation's component solve      | corner shape: `Synthetic data cannot be generated…`                    |
| seeded value ordering             | `expected 1 to be greater than or equal to 20`                         |
| domain-size/product gate          | `expected { groups: [ 'b', 'a' ], … } to be undefined`                 |
| `selectionSizeRange` mirroring    | `expected […] to have a length of 10 but got 15`                       |
| reserved-value preference         | `expected +0 to be 2`                                                  |

### Verification at the merged head

protocol-utilities 419 tests, interview 1,228, interviewer `src/lib/synthetic`
14 (the 200-row roster path), root `pnpm typecheck` 15/15 and `pnpm knip`
clean; the full 20,000-shape × 500-seed corpus evidence re-run green after
every change above (6,562,500 generation runs, zero mismatches, zero
failures). Development-protocol wall-clock, re-measured contention-free at
the merged head: parent without the solver **14.80 ms/session**, this branch
**15.30 ms/session** (+3.4%; budget 20%).
