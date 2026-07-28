# PR #1108 handover — Codex continuation

Date: 2026-07-28. Written at the end of a long Claude Code session, for Codex to
finish this task in the same worktree
(`.claude/worktrees/interview-interface-e2e-tests-e307d9`, branch
`claude/synthetic-data-validation-2b18a2`).

Read `AGENTS.md` first. Then this document. The reconciliation spec
(`docs/superpowers/specs/2026-07-27-contradiction-analyser-reconciliation.md`)
is your main work item once the state below is settled; it carries an
"Executor's notes" section written for exactly this continuation.

## What this PR is

`generateNetwork` in `@codaco/protocol-utilities` now produces synthetic
interview data satisfying researcher-configured validation rules, refusing
up front (with researcher-facing messages) protocols no seed can satisfy.
Along the way it absorbed PR #1109 (finite-domain solver) and — per the
consolidation plan — PR #1107 (contradiction analyser in protocol-validation,
plus the attribute-writer-exclusivity work merged into it). **This handover
assumes #1107+AWE is merged into this branch.** If the merge has not happened
when you start, stop and confirm with the user before anything else.

Roughly fifteen waves of automated review (Codex bot) have been processed:
~60 findings fixed, ~8 refuted with recorded evidence. The review loop is the
job; expect more waves after every push.

## Immediate state triage (do this first)

1. `git status` — the tree may hold **uncommitted work from four subagent
   tasks that were mid-flight at handover**. Expected file sets:
   - **(a) feasibility/entityCounts wave**: `constraints/feasibility.ts`,
     `constraints/entityCounts.ts`, their tests. Covers four review threads:
     empty-subject form scopes (`PRRT_...UjLZy`), partial equality-group
     writes (`PRRT_...UjLZ1`), roster keys counted once (`PRRT_...Ujybr`),
     pedigree pins unpinned by later writers (`PRRT_...Ujybl`). Plus two
     chores: the `copies` doc in entityCounts (stale since one-key-one-node),
     and a stale comment at `feasibility.test.ts:1603` naming
     `reserveFamilyPedigreeEgoValues` (renamed `...FixedValues`).
   - **(b) buildConstraints wave**: `constraints/buildConstraints.ts`, maybe
     `dateWindow.ts`/`attributes.ts`/`generateNetwork.ts`. Covers two threads:
     truncate finer-than-picker date bounds before calendar validation
     (`PRRT_...UjLZ3`), and NetworkComposer field `component`/`parameters`
     overlays folded into constraint building (`PRRT_...UjLZ7`).
   - **(c) ego baseline artefacts**: ONE ARIA snapshot
     (`packages/interview/e2e/aria-snapshots/chromium/matrix-ego-form-egoform-pre-population-from-ego-attributes-initial.aria.yml`)
     regenerated via the e2e harness, and `packages/interface-images`
     EgoForm WebPs (all-or-nothing generator; non-EgoForm drift must be
     `git restore`d). ARIA files must NEVER be hand-authored.
   - **(d) story-pin fixes**: `Narrative.stories.tsx` (bare strings on a
     categorical — must be arrays), `FamilyPedigree.consanguinity.stories.tsx`
     - `.cousins.stories.tsx` (codebook option lists vs `['biological']`
       pins). Hard rule: if a fix moves the rendered output, leave that story
       unfixed and report — Chromatic baselines are the user's to accept.
2. For each set present: verify it (tests below), commit it as its own
   feature commit, mutation-check anything that looks unproven. For any set
   half-applied or broken: prefer completing it over reverting; the intent
   for each is fully specified in the review threads themselves.
3. `gh api graphql` the PR's review threads. Every unresolved thread gets a
   substantive in-thread reply and GraphQL `resolveReviewThread` after its
   fix lands. Reply style used throughout: confirm/refute with evidence,
   name the commit, state corrections to the reviewer's remedy where made.
4. Full verification (see bar below), push, watch CI + the next review wave.

## The review loop protocol

- The Codex reviewer posts finding batches minutes-to-hours after each push.
  Its emoji on the PR OP is the gate: 👀 = still evaluating (do not merge),
  👍 = settled, none = unresolved feedback exists. Only 👍 means done.
- **Verify every finding before implementing.** Track record here: most are
  real, but reviewer _remedies_ are frequently wrong even when findings are
  right (a proposed dedup converted an up-front refusal into a mid-draw
  failure; a proposed narrowing was proven unsound by a measured
  counter-example with a guard test that goes red under it; cited repro seeds
  didn't reproduce while the mechanism was real). Refuting with evidence and
  a recorded comment at the line is a valid resolution.
- Every fix ships with regression tests **proven red** by reverting the fix
  and restoring it. Both directions where a refusal is involved (the
  newly-accepted case AND a still-refuses guard).
- Merging is the user's decision, never yours. Sequencing: reconciliation
  work completes on this branch → review settles (👍) → user merges #1108.

## Verification bar (all must pass before any push)

```bash
# from each package dir (pnpm --filter test -- <files> does NOT filter):
cd packages/protocol-utilities && pnpm exec vitest run          # ~939+
cd packages/interview && pnpm exec vitest run --project units   # ~1283+ (storybook project is CI-only)
cd packages/fresco-ui && pnpm exec vitest run --project unit    # ~935+
cd apps/interviewer && pnpm exec vitest run --project=unit      # ~471+
# from repo root:
pnpm typecheck && pnpm lint && pnpm knip && pnpm check:changesets
```

Seeded sweeps are the evidence style for generation behaviour (100–500 seeds;
the package vitest config carries a 60s testTimeout — do not add per-file
overrides). The corpus oracle (`generateNetwork.corpus.test.ts`) now covers
edges; treat any oracle disagreement as a real bug to report, never something
to paper over in its checker.

## Decisions that are settled — do not relitigate

**Machinery invariants**

- _Count and draw read one descriptor._ `valueSpaceSize`, the draw, comparator
  propagation, and solver domains must agree about what a variable can hold.
  Any fix touching one reader moves all of them together.
- _Only a proven `unsat` refuses (solver-side)._ Unenumerable domains,
  oversized components, exhausted budgets ACCEPT at the solver layer; the
  post-solver comparator-fold test (`crossed` / `comparatorFoldEmptied`,
  exported from `generateEntityAttributes.ts`) is an exact statement about
  what the draw can produce, provably unable to contradict a `sat` proof, and
  is the ONE shared fold both generation and feasibility call.
- _Refusal-side error direction is asymmetric._ Worst-case counts are safety
  bounds: an over-count falsely refuses (loud), an under-count admits a
  protocol that fails mid-draw or silently emits duplicate `unique` values
  (the worse failure). Narrowings require a soundness argument that the new
  count still dominates every actual run; declined narrowings have guard
  tests that go red under the declined remedy — leave those standing.
- _Static vs dynamic is the narrowing line._ A roster row dead against its
  own merged values on every seed may be excluded from counts; a row passed
  over dynamically (claimed uniques, order effects) must stay counted.
- _Skip vs refuse._ A roster row is one candidate among many → skip.
  A value stated by the protocol (prompt `additionalAttributes`, pedigree
  writes) → refuse up front; no seed rescues it.
- _Merge order per stage kind_ (`allowFabrication`): panels spread prompt
  values over row values (prompt wins); roster interfaces the reverse. One
  merged assignment feeds every per-row judgement.
- _One roster key admits one node per run_ (the session reducer
  invariant-throws on duplicates).
- _Writers vs readers._ A filter/display reference is not a write. Content
  stages (`Information`, `Anonymisation`, `Narrative`, `NarrativePedigree`)
  are listed in `contentStages.ts`, load-bearing against the dispatch (a
  listed type gaining a handler stops compiling).
- _Pedigree edges_: the generator writes `relationshipType: ['biological']`
  and `isActive: true` deterministically (runtime-faithful literals), leaves
  the gamete pair unwritten, counts the writes as pedigree-fixed carriers.
  FamilyPedigree legitimately holds several edges of one type per pair
  (distinguished by relationshipType) — never apply a `{from,to,type}`
  uniqueness rule to it. All other edge creators reuse a pair's edge.
- _SyntheticInterview (the builder)_: caller pins are kept verbatim even when
  out-of-range (stories pin deliberately); only cross-value contradictions
  between two caller-written values refuse. Manual entities: verbatim, no
  solving. Ego draws last; `unique` on ego refuses (runtime invariant-throws).

**Date system**

- Floors/ceilings are per-resolution: full = native input, years 0001–9999;
  month/year = unpadded `<select>`, floor year 1000. Declared bounds are
  REFUSED out of range; derived bounds are CLAMPED — except a strict
  comparator stepping off the calendar, which is EMPTY (clamping would
  readmit the excluded endpoint). All overflow detection happens in step
  space (an overflowed date string sorts below the ceiling it passed).
- Coarse declared bounds (`min: "2020"` on a full picker) are COMPLETED to
  the picker's resolution (the runtime's `compareDateStrings` truncates
  deliberately); month ceilings complete to January (ymdPattern defaults
  missing parts to 1), not December. A bound at the picker's own resolution
  is kept verbatim (`transnational-networks` ships one).
- The relative-date window clamp lives in `@codaco/shared-consts`
  (`dateWithinPickerRange`), read by fresco-ui, interview, and
  protocol-utilities, held together by
  `packages/interview/src/forms/__tests__/relativeDateWindowParity.test.tsx`
  (expected bounds written literally — keep it that way).
- One resolution reader in `dateWindow.ts`: `boundResolution`
  (year-validating, for declared bounds) and `dateValueResolution`
  (year-free, safe only because the floors exclude year 0000 — the doc
  comment carries the argument).

**Numbers/text**

- Scalar grid: 2 decimal places (`SCALAR_DECIMAL_PLACES`), deliberately
  coarser than the control's 0.001 — a recorded user decision; moving it
  means moving all readers together.
- Fractional ranges: grid points plus clamped endpoints; strict comparator
  gaps read the variable's own drawable grid, never a blanket whole unit.
- Text cap: 32,767 chars (`MAX_TEXT_DRAW_LENGTH`, spreadsheet-cell/CSV
  delivery limit). Floor above cap refuses; ceiling above cap clamps the draw
  inside `textDrawLength` (the single count+draw reader).

**Messages**: name variables by NAME, never codebook keys (UUIDs in
Architect protocols); `ConstraintConflict.entityTypeName` exists for this.
Pedigree-origin conflicts label `egoVariable` on node scope, `edgeConfig` on
edge scope. Rules lists follow the established `[rule, 'additionalAttributes']`
shapes; roster rows are data and name no schema rule.

**Releases**: fresco-ui carries an APPROVED major (4.1.2 → 5.0.0, the
`addDays` removal). Changesets: strict lane separation (never a library and a
gated product in one file). All current changesets are correct; verify
`pnpm check:changesets` after adding any.

## The reconciliation task (main remaining work)

Blocked-on-merge until #1107+AWE landed here; with that assumed, execute
`docs/superpowers/specs/2026-07-27-contradiction-analyser-reconciliation.md`
in full. Non-negotiables from its revision + executor's notes:

- #1107's own spec (`2026-07-27-protocol-validation-contradictions-design.md`)
  is the authoritative catalogue; re-derive the delegation list from it at
  merge time. AWE's rules ride inside it — read them fresh, especially
  anything near quickAdd/bin-only scoping.
- Delegation adapter: their `findValidationContradictions(variables, options)`
  returns `{class, message, variableIds, strips}`. The
  `stageEffectiveComponents: true` decision depends on our descriptors
  actually carrying resolved renderings — the composer-overlay review finding
  (in-flight set (b) above) settles whether that premise holds; resolve the
  two as ONE design.
- Invariant A (drift guard): anything they reject, we refuse — one direction
  only. Invariant B (witness search): #1109's solver, read-only, hunts
  satisfying assignments for every record they reject; a witness is a
  release-blocking false positive on THEIR side (their rejections drive
  destructive v7→v8 migration strips). Record "solver declined" as a coverage
  gap, never as confirmation — our solver still declines cross-resolution
  date components (their discrete instant-tracking is the better answer;
  adopt theirs where possible).
- Fixed-seed outputs must be byte-identical across the delegation: capture
  fresh goldens from the merged HEAD immediately before work item 1.
- Message regressions are the likeliest silent harm — assert message text.
- Merge conflicts expected in fresco-ui `DatePicker.*`, interview date tests,
  `useProtocolForm.tsx` (three-way-touched surfaces). Resolve by keeping both
  sides' suites, as was done for `RelativeDatePicker.test.tsx`.

## Loose ends ledger (beyond the in-flight sets)

- **User-side actions, not yours**: Chromatic accepts (EgoForm stories after
  the ego change; the new Toast LongDescription story); the merge itself.
- The solver's `enumerateDomain` fractional-number decline was REMOVED
  (admitted via the shared grid). Its cross-resolution DATE decline remains,
  deliberately (see reconciliation note above).
- `feasibility.test.ts` "REPRO"/scratch blocks and stray `zz*` files: agents
  were repeatedly told scratch lives in `/tmp`; sweep any strays before
  staging (`find packages -name "zz*" -not -path "*/node_modules/*"`).
- `bfac86ae5` has a misattributed commit boundary (early index race);
  deliberately not repaired — do not rewrite pushed history.
- Duplicate-uid roster rows: one-key-one-node is enforced; the counts side
  ("count each key once", thread `PRRT_...Ujybr`) is in-flight set (a).

## Practical traps (each cost real time; all are in memory/AGENTS but repeated here)

- Pin every operation to THIS worktree's absolute path; verify
  `git branch --show-current` before committing. Never `git stash`,
  `git checkout --`, `git clean`, or `git reset` (untracked files exist; one
  agent violated this and got lucky).
- `eval "$(fnm env)"` before `git commit` in fresh shells, or the husky hook
  silently misses pnpm. The lint-staged hook formats staged files on commit —
  never run root `pnpm lint:fix` (it rewrites the whole repo).
- Re-fetch and compare the remote head before every push (parallel sessions
  have raced this branch before).
- IDE/LSP diagnostics lag badly and lie (stale-module errors on files vitest
  resolves fine; fresco-ui test files are excluded from the default
  tsconfig). Trust `tsc --build` and the runners.
- Stale `*.tsbuildinfo` replays diagnostics from OLD configs — the signature
  is `--showConfig` showing a lib present while tsc denies it; delete them.
  Stale pnpm state: `rm node_modules/.pnpm-workspace-state-v1.json &&
pnpm install --force`.
- After lockfile-changing merges, reinstall before diagnosing anything.
- Multi-line `perl` mutation dances on files where the pattern appears twice
  restore into the WRONG site — use unique anchors, and re-run tsc after
  every restore (this bit us once, 40 test failures).
- Interview e2e: call its `run.sh` directly for `-g` filters; ARIA snapshots
  only from the harness; PNG baselines only via the gated
  "Regenerate E2E Visual Snapshots" workflow (this Mac cannot emulate the
  amd64 architect baselines); `interface-images` regeneration is manual and
  all-or-nothing.
- One committer per worktree. If you parallelise with sub-agents, give them
  disjoint file sets, state the concurrent set in every brief, have them
  leave work uncommitted for a single committer, and expect their transient
  failures to be each other's half-applied edits — re-run before diagnosing.

## Records

- `.superpowers/sdd/pr-review-queue.md` (gitignored, in this worktree): the
  full batch-by-batch review ledger — verdicts, refutations, corrections.
- The reconciliation spec's "Executor's notes": premise checks, date
  reconciliation specifics, Invariant B mechanics, merge practicalities.
- Commit messages on this branch are the decision log; `git log --oneline
origin/main..HEAD` and read any message before touching its subject.
