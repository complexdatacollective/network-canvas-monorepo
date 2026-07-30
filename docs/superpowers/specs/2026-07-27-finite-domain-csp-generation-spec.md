# Finite-domain constraint solving for synthetic data generation

Date: 2026-07-27
Status: Specification, not yet implemented
Branch: off `claude/synthetic-data-validation-2b18a2` (PR #1108), merged back into it

## Why this exists

PR #1108 made synthetic interview data satisfy the validation rules a researcher configures. It works for the overwhelming majority of protocols, and both bundled protocols pass. But fuzzing 4,000 random three-variable number shapes found that **18 of the 3,140 that pass the feasibility gate (0.6%) throw at draw time instead of generating**.

That single number is two distinct defects.

### Defect A — the generator cannot backtrack, so it fails on satisfiable protocols

Generation walks variables in dependency order and draws each one greedily. It never reconsiders. A protocol with a perfectly good solution can therefore be painted into a corner:

```
A: number [3,4], differentFrom B
B: number [3,4]
D: number [2,4], lessThanOrEqualTo A, greaterThanOrEqualTo B
```

`B=3, A=4, D=3` satisfies every rule. Feasibility correctly accepts it. But `A` and `B` are drawn independently, and unless the draw happens to land `B=3, A=4`, there is no value left for `D`. Generation succeeds on roughly **2.5% of seeds** — a researcher running bulk generate gets almost nothing.

This is the more serious half: the protocol is valid and the tool fails it.

### Defect B — feasibility cannot prove some protocols unsatisfiable

```
a: number [3,4], differentFrom b
b: number [4,5], lessThanOrEqualTo a
```

No assignment satisfies this. But the analysis reasons only about interval bounds, and has no way to represent "b's domain minus whatever value a took", so it accepts. The protocol then throws at draw time.

The throw is correct — the protocol _is_ impossible — but it arrives at the wrong moment, in the wrong form, and **seed-dependently**, which is exactly the property the original design set out to eliminate: _a protocol must either always be refused or never be refused, independent of seed and of which session in a bulk run you are on._

### The insight that unifies them

**A complete search over finite domains solves both.** Exhausting the search space without finding an assignment _is_ a proof of unsatisfiability. Finding one and using it _is_ the backtracking Defect A needs.

The obstacle is that domains are not always small — an unbounded `unique` number ranges over 100,000 values. So the work is not "implement a CSP solver" but "implement a complete solver, and decide rigorously when it is safe to use."

## Scope

**In scope.** Per-entity constraint solving for cross-variable rules — `sameAs`, `differentFrom`, and the four comparators — over variables whose domains are small enough to enumerate. Feasibility's verdict for those same variables. Preserving the existing behaviour everywhere else.

**Out of scope.** `unique` remains a cross-_entity_ concern handled by the existing registry, not modelled as a global constraint (see "How `unique` participates"). Preventing contradictions at authoring time is a separate project. Nothing in `apps/`.

## Design

### Where it lives

A new module under `packages/protocol-utilities/src/generateNetwork/constraints/`, consumed by both `feasibility.ts` and `generateEntityAttributes.ts` — the same shared-implementation discipline the existing `propagateComparatorBounds` follows, and for the same reason: the two must never disagree about what a constraint means.

Do not fork the semantics. `COMPARATOR_DIRECTION` in `types.ts` is already the single source of truth for a comparator's direction and strictness; the solver reads it.

### Domain construction

Each variable's domain is the set of values the generator can actually produce for it — not the set the rules theoretically permit. This distinction has bitten this codebase twice already (see `valueSpaceSize`'s doc comment and `textDrawLength`). Reuse those, do not recompute.

| Type                 | Domain                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `boolean`            | `{true, false}` — 2                                                                             |
| `ordinal`            | the option values                                                                               |
| `categorical`        | option subsets sized within `[minSelected, maxSelected]` — combinatorial, often above threshold |
| `number`             | integers within the propagated bounds                                                           |
| `scalar`             | the 2-decimal grid over `SCALAR_DOMAIN` — 101 values                                            |
| `datetime`           | steps within the `dateWindow` at its resolution                                                 |
| `text`               | effectively unbounded — always above threshold                                                  |
| `layout`, `location` | no cross-variable rules are legal; excluded                                                     |

Seed domains from the **propagated** bounds, not the declared ones. `propagateComparatorBounds` already narrows them correctly and cheaply; the solver starts from its output. This keeps the solver's work proportional to what propagation could not resolve.

### Tractability threshold — the load-bearing decision

Build the constraint graph over each entity type's variables and take its **connected components**. A component of one variable needs no solving. Solve a component completely when it is tractable; otherwise fall back to today's behaviour for that component alone.

Tractability must be judged on the **product** of the component's domain sizes, not each domain individually — three variables of 500 values each is 125 million, not "small". Cap the product, and additionally cap the component's variable count.

The spec deliberately does not fix the constants. Choose them from measurement (see completeness criterion C6) and document the reasoning where they are defined. State them in the implementation report.

**A component above threshold must behave exactly as it does today** — same draw path, same output for a given seed. This is a hard requirement, not a nicety: it is what makes the change safe to ship. Criterion C5 tests it.

### Search

Standard backtracking with constraint propagation:

1. **Propagate** — enforce arc consistency (AC-3 is sufficient) over the component's constraints, pruning domains. Comparators prune by bound; `differentFrom` prunes only when the opposing domain is a singleton.
2. **Select the next variable** — minimum-remaining-values, breaking ties consistently so the search is deterministic.
3. **Order values randomly, seeded.** This is essential and easy to get wrong: a solver that returns the lexicographically-first solution gives every entity in the network identical values, destroying the variation synthetic data exists to provide. Draw the value ordering from the run's seeded generator so output stays reproducible for a given seed while varying across entities and seeds.
4. **Recurse**, undoing prunes on backtrack.
5. **Bound the work** — cap nodes explored. Hitting the cap means "unknown", not "unsatisfiable", and must fall back rather than refuse. Criterion C4 covers this.

Feasibility asks for existence: does _any_ solution exist. Generation asks for a witness: give me _a_ solution, varied across entities. The same search serves both — feasibility stops at the first solution and discards it.

### How `unique` participates

`unique` spans entities, so it is not a constraint inside the per-entity CSP. It enters as a **unary domain restriction**: when solving entity _n_, values already claimed in the registry for that variable are absent from its domain.

Two consequences the implementation must handle:

- A component containing a `unique` variable must be re-solved per entity, since its domain shrinks as the run proceeds. Do not cache a solution across entities.
- If the restricted domain empties, that is registry exhaustion — the existing `SyntheticDataConstraintError` path, not a solver failure. Keep that distinction in the error.

### Interaction with existing machinery

- `propagateComparatorBounds` stays. It is cheap, it handles the common case, and it seeds the solver's domains.
- The existing greedy draw path stays, for above-threshold components and for variables with no cross-variable rules — which is most variables in most protocols.
- The `sameAs` / non-strict-cycle equality grouping in `dependencyOrder.ts` stays and runs first. The solver operates on groups, not raw variables.
- `SCALAR_DOMAIN`, `textDrawLength`, `TEXT_ALPHABET_SIZE` and `valueSpaceSize` are existing sources of truth about what the generator can reach. Reuse them.

## Completeness criteria

These are acceptance gates. The work is not done until every one passes, with evidence in the implementation report. Where a criterion names a number, that number is a minimum.

### C1 — Feasibility is sound and complete below threshold

Over a corpus of **at least 20,000 randomly generated protocols** whose cross-variable components all fall below the tractability threshold, `analyseFeasibility`'s verdict must match brute-force ground truth **exactly**: zero false positives, zero false negatives.

The corpus must include, in non-trivial proportion: `differentFrom` interacting with tight bounds; chains of 3-5 comparators; mixed strict and non-strict comparators; `sameAs` groups whose members carry different bounds; and all of `number`, `scalar`, `datetime`, `ordinal`, `boolean`.

Ground truth is exhaustive enumeration over the component's domains, computed independently of the solver — a bug shared between the two would otherwise cancel out and pass.

**Report the corpus size, the generator's shape distribution, and the mismatch count (which must be 0).**

### C2 — Accepted protocols always generate

For every protocol in the C1 corpus that feasibility accepts, `generateNetwork` must succeed on **500 consecutive seeds** with **zero draw-time throws**.

The two named regressions must be explicitly among the cases and reach zero:

- `A: number [3,4] differentFrom B`, `B: number [3,4]`, `D: number [2,4] lessThanOrEqualTo A greaterThanOrEqualTo B` — currently succeeds on ~2.5% of seeds, must reach 100%.
- `a: number [3,4] differentFrom b`, `b: number [4,5] lessThanOrEqualTo a` — currently accepted then throws, must be **refused** by feasibility.

**Report per-shape seed counts.**

### C3 — Generated data stays varied

A solver that returns the same solution every time satisfies C1 and C2 while making synthetic data useless. Guard it explicitly:

For a component with a solution space of size _S_ ≥ 10, generating 200 entities must yield **at least `min(S, 20)` distinct assignments**, and no single assignment may account for more than **40%** of entities.

**Report the distinct-assignment counts and the modal frequency for at least three component shapes.**

### C4 — The node cap degrades safely

When the search cap is hit, the result is "unknown". Feasibility must **not** refuse on unknown, and generation must fall back to the existing draw path. Construct a component that provably exceeds the cap and assert both. A protocol must never be refused because the solver ran out of budget.

### C5 — Above-threshold behaviour is byte-identical

For at least **10 protocols** whose components exceed the threshold, generated output must be **byte-identical** to the output of the commit this branch starts from, for at least 50 seeds each.

This is the safety property that makes the change shippable. Diff the serialised networks; do not eyeball them.

**Report the comparison method and the mismatch count (which must be 0).**

### C6 — Performance is bounded and measured

Report generation wall-clock for a realistic protocol (use the bundled development protocol) before and after, at 100 sessions. A regression beyond **20%** on that protocol requires either justification or a lower threshold.

Separately, report the worst-case single-entity solve time observed across the C1 corpus. The threshold constants must be justified by these numbers, not chosen arbitrarily.

### C7 — Nothing already working regresses

- `pnpm typecheck`, `pnpm test`, `pnpm knip` all pass from the repo root.
- The conformance seam test (`packages/interview/src/forms/__tests__/syntheticDataConformance.test.ts`) passes **unchanged** — if it needs modifying to accommodate the solver, that is a signal something is wrong; stop and explain.
- The bundled development and sample protocols still pass the feasibility gate.
- Every existing regression shape in `.superpowers/sdd/progress.md` stays at zero violations. The ledger lists them.

### C8 — Guards are verified red by mutation

For each of C1, C2, C3 and C5, disable the mechanism it protects, confirm the corresponding test fails, and restore it. **Report which test failed for each, with its message.** A guard that cannot fail proves nothing — this branch has already caught one mandated test that was a complete no-op.

## Explicitly not required

- Solving components above threshold. Falling back is correct.
- Modelling `unique` as a global constraint.
- Optimising the solution found. Any satisfying assignment is acceptable, subject to C3's variation requirement.
- Closing the `categorical` subset explosion. Categorical components will usually exceed threshold; that is expected.

## Branch and merge strategy

Branch from the head of `claude/synthetic-data-validation-2b18a2` (PR #1108). Open a PR **targeting that branch**, not `main`, so it merges back into #1108 before #1108 merges.

If #1108 has already merged to `main` by the time this is ready, rebase onto `main` and target `main` instead — the work is self-contained either way.

No changeset is needed if this merges into #1108 before it ships, since #1108's changeset already describes the behaviour. If it lands separately after #1108, it needs its own **patch** changeset for `@codaco/protocol-utilities` on the library lane — invoke the `creating-a-changeset` skill.

## Repo conventions

Read `CLAUDE.md` at the repo root. The ones most likely to bite: no `any`, no `as` type assertions to silence type errors (`as const` is fine), no barrel files, only export what another module imports, comment only unusual or complex code, no `~/` path aliases inside package source. The husky pre-commit hook formats staged files — do not run the root `pnpm lint:fix`.

Context worth reading first: `docs/superpowers/specs/2026-07-27-synthetic-data-validation-conformance-design.md` for the original design, and `.superpowers/sdd/progress.md` for the ledger of what was tried, what broke, and the regression shapes that must stay green. That ledger records four fix rounds on `generateEntityAttributes` alone, two of which introduced regressions while fixing others — the regression set exists because of them.
