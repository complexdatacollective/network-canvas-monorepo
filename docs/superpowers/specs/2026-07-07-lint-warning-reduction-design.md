# Lint-warning reduction — design

**Date:** 2026-07-07
**Status:** approved-pending-final-review
**Author:** Josh Melville (with Claude)

## Problem

`oxlint` reports **3,442 warnings** across the monorepo (built-tree baseline —
see below). Warnings do not block CI (`oxlint` exits 0 on warnings; the CI job
runs `turbo run //#lint` with no `--max-warnings`), so this is an accumulated
hygiene problem, not a broken build. The volume hides genuine issues (real a11y
gaps, stale-closure effect bugs, unhandled promises) inside a wall of noise, much
of it from rules that were never intentionally enabled.

Goal: **fix genuine issues wherever possible, and make safe, case-by-case rule-config
changes** so that every remaining warning is either being actively worked or
accepted for a documented reason — and every rule that is on is on _intentionally_.

## Baseline accuracy (important)

`oxlint`'s type-aware engine needs workspace **types built** to resolve
cross-package types — CI adds a `^build` dependency to the lint job for exactly
this reason. All counts here are from a **built** tree (`pnpm install && pnpm build`),
which matches CI. Linting an _unbuilt_ tree inflates type-aware rules with false
positives — e.g. `no-redundant-type-constituents` reports **205 unbuilt vs 18 built**
(it mislabels load-bearing cross-package types as "redundant" when it can't resolve
them). Always re-measure against a built tree.

## Guiding principle (agreed)

1. **Keep rules on and fix the code** by default. Do not disable a rule merely to
   reduce the count.
2. **Disable a rule only when it is genuinely inapplicable or a pure false-positive
   for this codebase** — i.e. when there is nothing to "fix" without violating an
   intentional convention or rewriting correct code.
3. **Structural config exceptions, not repeated inline disables.** Where a
   legitimately-unavoidable pattern trips a kept rule (e.g. tests, RTK store
   access), encode the exception once — via a file-glob override or a typed code
   seam — rather than sprinkling `// eslint-disable` lines.
4. **`no-unsafe-type-assertion` is enabled deliberately** (currently it only leaks
   in from the `suspicious` category). We list it explicitly and drive the source
   count down by fixing, with structural exceptions for tests and RTK.
5. **`exhaustive-deps` intentional-omission policy:** in **classic apps**
   (`architect-classic`, `interviewer-classic`), a sanctioned per-line disable
   _with a justification comment_ is allowed. In **packages and modern apps**,
   restructure (stable refs / memoization) so the warning disappears legitimately.
   Genuine stale-closure bugs are fixed everywhere.
6. **Classic apps are treated equally** — their warnings are in scope, not skipped.
7. **Delivery is incremental PRs grouped by rule-family**, safest/highest-impact
   first, each verified by re-running `oxlint` and confirming the count drop.
8. **Escalate on clear.** The moment a rule's in-scope warning count reaches 0,
   flip it from `warn` to `error` in that same PR so it cannot regress. (Disabled
   rules stay off; scoped rules escalate for their non-excepted scope.) A repo-wide
   `--max-warnings 0` lint gate is a later follow-up once the bulk is `error`.

## Per-rule decisions (built-tree counts)

Treatment key: **fix** = change code · **auto-fix** = `oxlint --fix` · **scope** =
file-glob override (usually tests) · **seam** = introduce a typed helper so the
pattern stops tripping the rule · **config** = fix rule/plugin configuration ·
**disable** = rule genuinely inapplicable · **keep** = leave at `warn`, work down ·
**→error** = escalate to `error` once its in-scope count reaches 0.

| Rule                                                                                                                                                                                                                                      | Count (src / test)            | Treatment                          | Rationale                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `typescript/no-unsafe-type-assertion`                                                                                                                                                                                                     | 1609 (997 / 612)              | enable + seam + scope + fix →error | List at `warn` (make intentional). Scope off in `*.test`/`*.stories`/`__tests__`/`e2e` (−612). Kill the ~48 `getState() as RootState` casts with a typed `createAppAsyncThunk` seam. Fix DOM casts (`e.target`→`e.currentTarget`, narrow guards) and boundary types. Escalate to `error` once src hits 0.                                                                           |
| `tailwindcss/no-unknown-classes`                                                                                                                                                                                                          | 420 (410 / 10)                | config + fix                       | `architect` and `documentation` ship their _own_ Tailwind themes but all four `.oxlintrc` configs point the plugin at the shared **Fresco** entrypoint. Fix per-app `entryPoint` (~360 resolve). Fix ~12 genuine class typos (`font-mono`→`font-monospace`, `preserve-3d`→`transform-3d`, `backface-visibility-hidden`→`backface-hidden`). Allowlist ~44 legacy global/BEM classes. |
| `eslint/no-underscore-dangle`                                                                                                                                                                                                             | 254 (162 / 92)                | disable                            | Fights NC's documented `_uid`/`_id`/`_internalId`/`_enc`/`_draft` data-model convention plus unavoidable third-party (`_zod`, `_tag`) and Node (`__dirname`) globals. 0 genuine issues; the only "fix" is renaming the data model, which is forbidden.                                                                                                                              |
| `typescript/no-floating-promises`                                                                                                                                                                                                         | 169 (63 / 106)                | scope + fix →error                 | Real bug-risk rule. Keep in src, fix the 63 (`await`/`void`/`.catch`). Scope off in `*.stories`/`e2e`/scripts (−106).                                                                                                                                                                                                                                                               |
| `unicorn/consistent-function-scoping`                                                                                                                                                                                                     | 140 (39 / 101)                | scope + fix →error                 | Test fixtures legitimately define local factories → scope off in tests (−101). Hoist the 39 src helpers.                                                                                                                                                                                                                                                                            |
| `react/exhaustive-deps`                                                                                                                                                                                                                   | 118 (102 classic / 16 modern) | keep + fix (split policy)          | The recurring interviewer freeze/OOM class. Fix genuine bugs everywhere. Intentional: classic → sanctioned per-line disable w/ justification; modern/packages → restructure. Verify against the _running_ app.                                                                                                                                                                      |
| `jsx-a11y/no-autofocus`                                                                                                                                                                                                                   | 48 (37 active)                | scope (disable rule)               | Autofocus is an intentional NC participant focus-management pattern. Keep all usages; set `jsx-a11y/no-autofocus: off` in `tooling/oxlint/react.json`.                                                                                                                                                                                                                              |
| `typescript/consistent-return`                                                                                                                                                                                                            | 73 (71 / 2)                   | keep + fix →error                  | Make functions consistently return a value on all paths.                                                                                                                                                                                                                                                                                                                            |
| `jsx-a11y` interaction/label cluster                                                                                                                                                                                                      | 149 total                     | fix (split by app) →error          | `click-events-have-key-events` (50, 49 classic) + `no-static-element-interactions` (48, 46 classic): `div`/`span`→`<button>` + keyboard handlers, mostly classic. `prefer-tag-over-role` (37, 31 active): `role="button"`→`<button>`. Plus `media-has-caption`, `label-has-associated-control`, `anchor-is-valid`.                                                                  |
| `eslint/no-unassigned-import`                                                                                                                                                                                                             | 42                            | disable                            | Side-effect CSS/polyfill imports are correct; oxlint 1.67 has no allowlist option, nothing to fix.                                                                                                                                                                                                                                                                                  |
| `typescript/no-unnecessary-type-conversion`                                                                                                                                                                                               | 41 (38 / 3)                   | auto-fix →error                    | Safe `oxlint --fix`.                                                                                                                                                                                                                                                                                                                                                                |
| `promise/always-return` (+ `no-multiple-resolved` 4)                                                                                                                                                                                      | 36 (+4)                       | fix + keep                         | Fix the 2 genuine `no-multiple-resolved`; review `always-return` case-by-case.                                                                                                                                                                                                                                                                                                      |
| `import/no-named-as-default`                                                                                                                                                                                                              | 34                            | keep + fix →error                  | Rename the shadowing default imports to non-clashing names; escalate to `error` once 0.                                                                                                                                                                                                                                                                                             |
| `import/no-named-as-default-member`                                                                                                                                                                                                       | 33 (2 / 31)                   | scope + fix →error                 | Almost entirely the `import SuperJSON` idiom in stories → scope off in `*.stories`/`.storybook`; fix the 2 src.                                                                                                                                                                                                                                                                     |
| `eslint/no-console`                                                                                                                                                                                                                       | 28 (21 / 7)                   | scope                              | Src console calls are intentional failure-surface logging. Scope off in tests (−7); leave src. Never `--fix` (deletes statements).                                                                                                                                                                                                                                                  |
| `typescript/consistent-type-imports`                                                                                                                                                                                                      | 23 (5 / 18)                   | auto-fix →error                    | Safe `oxlint --fix` (inline type imports).                                                                                                                                                                                                                                                                                                                                          |
| `unicorn/require-post-message-target-origin`                                                                                                                                                                                              | 21                            | disable                            | 100% false-positive — all sites are Worker/`self`/BroadcastChannel, which have no `targetOrigin`.                                                                                                                                                                                                                                                                                   |
| `react/no-unstable-nested-components`                                                                                                                                                                                                     | 19                            | fix →error                         | Real perf/identity rule — hoist components defined inside render.                                                                                                                                                                                                                                                                                                                   |
| `typescript/switch-exhaustiveness-check`                                                                                                                                                                                                  | 18                            | fix →error                         | Add missing cases or a `default`.                                                                                                                                                                                                                                                                                                                                                   |
| `typescript/no-redundant-type-constituents`                                                                                                                                                                                               | 18 (7 / 11)                   | keep + fix →error                  | Tractable on a built tree. Fix genuine `                                                                                                                                                                                                                                                                                                                                            | unknown` redundancies. |
| `typescript/unbound-method`                                                                                                                                                                                                               | 17                            | fix + keep                         | Often real `this`-binding hazards.                                                                                                                                                                                                                                                                                                                                                  |
| `typescript/no-useless-default-assignment`                                                                                                                                                                                                | 15                            | auto-fix →error                    | Safe `oxlint --fix`.                                                                                                                                                                                                                                                                                                                                                                |
| `typescript/no-misused-spread`                                                                                                                                                                                                            | 13                            | fix →error                         | Can hide real bugs.                                                                                                                                                                                                                                                                                                                                                                 |
| `import/no-cycle`                                                                                                                                                                                                                         | 13                            | keep + optional refactor           | Genuine circular deps. Keep at `warn`; optionally break the protocol-validation cycle by moving shared symbols up.                                                                                                                                                                                                                                                                  |
| `typescript` type-aware tail: `await-thenable` (12), `no-base-to-string` (9), `no-unnecessary-type-parameters` (9), `no-explicit-any` (6), `restrict-template-expressions` (5), `no-implied-eval` (3), `no-unmodified-loop-condition` (3) | ~47                           | fix + keep                         | Mostly genuine (await-thenable, no-implied-eval especially).                                                                                                                                                                                                                                                                                                                        |
| `unicorn/prefer-add-event-listener` (11), `typescript/no-extraneous-class` (2), `import/default` (5), misc tail                                                                                                                           | ~20                           | mixed                              | `import/default` disable (Vite `?worker` false-positive). Fix ternary/iframe-sandbox cases.                                                                                                                                                                                                                                                                                         |

## Structural exception mechanisms

- **Test/story/e2e scope override** (root `.oxlintrc.json` `overrides`): a single
  entry on `["**/*.test.*", "**/*.stories.*", "**/__tests__/**", "**/e2e/**"]`
  turning off the rules that are pure noise in test code
  (`no-unsafe-type-assertion`, `consistent-function-scoping`, `no-console`,
  `consistent-type-imports`, `no-named-as-default-member`) and the fire-and-forget
  ones (`no-floating-promises` for stories/e2e/scripts).
- **Typed RTK seam:** add `createAppAsyncThunk = createAsyncThunk.withTypes<{ state: RootState; dispatch: AppDispatch }>()` next to the existing `useAppDispatch`/`useAppSelector` in each app's `ducks/hooks.ts`, and migrate thunks — removing every `getState() as RootState` cast.
- **Per-app Tailwind `entryPoint`:** point `architect` and `documentation`
  `.oxlintrc.json` at their own theme CSS instead of the shared Fresco entry; add a
  legacy-class allowlist for genuine global/BEM classes.

## PR sequence (incremental, by rule-family)

1. **PR1 — config correction (structural, no src behaviour change).** Explicitly
   list `no-unsafe-type-assertion: warn` + the test/story/e2e scope override;
   disable the genuinely-inapplicable rules (`no-underscore-dangle`,
   `require-post-message-target-origin`, `no-unassigned-import`, `import/default`);
   set `no-autofocus: off`; scope `no-named-as-default-member`, `no-console`,
   `consistent-function-scoping`, `no-floating-promises` appropriately. Verify count
   drop (~1,240). Changeset only if a published package's lint surface changes.
2. **PR2 — Tailwind lint config.** Per-app `entryPoint` fix + legacy-class allowlist
   (~360 resolve) + the ~12 genuine class-typo fixes (real rendering bugs).
3. **PR3 — mechanical auto-fixes.** `oxlint --fix` scoped to
   `no-unnecessary-type-conversion`, `no-useless-default-assignment`,
   `consistent-type-imports`, `no-unneeded-ternary`; escalate each to `error` if it
   reaches 0.
4. **PR4 — RTK typed-thunk seam.** `createAppAsyncThunk` per app; migrate thunks;
   removes the ~48 `getState()` casts.
5. **PR5 — small type-aware / promise / import real fixes.**
   `no-redundant-type-constituents` (18), `consistent-return` (71),
   `no-floating-promises` src (63), `always-return`/`no-multiple-resolved`,
   `switch-exhaustiveness-check`, `await-thenable`, `no-implied-eval`,
   `import/no-named-as-default` (34), misc tail; escalate cleared rules to `error`.
6. **PR6 — react-misc.** `no-unstable-nested-components`, `no-find-dom-node`,
   `no-unsafe`, `prefer-add-event-listener`, iframe-sandbox.
7. **PR7…N — a11y.** Split: (a) classic-app `div`/`span`→`button` conversions
   (~95), (b) active-app `prefer-tag-over-role` + labels + captions.
8. **PR…N — exhaustive-deps.** Split by package/app under the classic-vs-modern
   policy; each verified against the running app.
9. **PR…N — no-unsafe-type-assertion src reduction.** Iterative, by area (DOM casts,
   boundary types, guards). Escalate the rule to `error` when src reaches 0.

Large workstreams (a11y, exhaustive-deps, no-unsafe-type-assertion src) get their
own focused plan when reached, rather than being over-planned now.

## Verification

- After every PR: `pnpm build && npx oxlint 2>/dev/null | grep -c ': warning '` and
  confirm the delta matches expectation; `pnpm typecheck`; targeted tests for any
  touched src.
- a11y and `exhaustive-deps` fixes are verified against the **running** app
  (Playwright/preview), not just unit tests — jsdom hides these classes of bug.
- Config-only PRs: confirm no _new_ rule now fires elsewhere and that no genuine
  warning is silenced beyond the intended scope.

## Out of scope / follow-ups

- Adding `--max-warnings 0` to the lint gate — after the bulk of rules are `error`.
- Breaking the `protocol-validation` import cycle (code refactor, tracked
  separately).
- Any renaming of NC data-model keys (explicitly forbidden).

## Resolved decisions

- **`import/no-named-as-default` (34):** keep + fix (rename shadowing imports) +
  escalate to `error`.
- **`no-autofocus` (48):** keep all autofocus usages; scope the rule off (intentional
  NC pattern).
- **Escalation:** flip each rule `warn`→`error` in the PR that clears its in-scope
  count to 0.
