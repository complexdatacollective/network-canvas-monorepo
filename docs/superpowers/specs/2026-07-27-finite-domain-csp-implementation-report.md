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
