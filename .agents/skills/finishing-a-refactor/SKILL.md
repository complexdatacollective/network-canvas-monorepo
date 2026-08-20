---
name: finishing-a-refactor
description: 'Use when introducing or changing a shared seam in the network-canvas monorepo — a new helper, hook, option, prop, default, constant, or validation rule that replaces an existing pattern — and before opening any PR that adds one. Enumerate every call site of the old pattern and convert or justify each. Keywords: extracted a helper, new shared utility, added an option, added a prop, changed a default, deduplicate, DRY, refactor, call sites, single source of truth, this should live in one place, cannot drift, adopt everywhere, replace the old pattern.'
---

# Finishing a refactor

A half-finished refactor is worse than no refactor. It leaves **two ways to do
one thing**, and the codebase now contains a helper whose docstring promises a
guarantee it does not deliver. Every future reader has to work out which path is
current, and every future bug fix lands in one path and not the other.

This is the single most common defect class in this repo. In one 869-file branch
review, **63 of 103 findings** were either incomplete adoption of a new
abstraction or duplication that a seam already existed to prevent.

## The rule

> When you introduce a seam, you own every call site of the pattern it replaces —
> in the same change.

Not "later", not "as we touch them". The migration is part of the refactor, and a
PR that adds the seam without finishing the migration is incomplete work.

## Before you open the PR

Run this loop for **every** new or changed shared symbol, option, prop, or default.

### 1. Name the old pattern precisely

Write down the literal thing the seam replaces. It is usually one of:

| Seam you added     | Old pattern to hunt                       |
| ------------------ | ----------------------------------------- |
| A helper function  | The inline expression it wraps            |
| A new option/prop  | The call sites that now need to pass it   |
| A changed default  | The call sites relying on the old default |
| A shared constant  | The literal value, hardcoded              |
| A shared component | The hand-rolled markup it replaces        |

### 2. Enumerate the call sites — mechanically, not from memory

```bash
# the symbol's own consumers
rg -n --type ts --type tsx 'yourNewHelper' apps packages

# the pattern it replaces — search the SHAPE, not the name
rg -n --type ts --type tsx 'the\.inline\.expression' apps packages

# a hardcoded literal that should now come from the constant
rg -n --fixed-strings 'the-literal-value' apps packages
```

Search **all** of `apps/` and `packages/`, not just the workspace you are in.
Duplication in this repo crosses package boundaries constantly — the same logic
turns up in `architect`, `interviewer`, `interview`, `fresco`, and the two sites.

### 3. Account for every hit

Produce a list. Each entry gets one of exactly two dispositions:

- **Converted** — now uses the seam.
- **Deliberately not converted** — with a written reason at the call site, not
  in your head.

"I did not get to it" is not a disposition. If the list is too long for this
change, the refactor is too big: split it so that each PR fully converts a
subset, and say in the PR body which subsets remain.

### 4. Close the door behind you

Make the next person's mistake impossible, or at least loud:

- **Prefer a type.** If the seam can be enforced by a type, the compiler does
  the work. Typing a config object against a shared `type` turns a key typo into
  a build error.
- **Prefer the safe default.** If one behaviour is correct almost always, make
  it the default and require an explicit opt-_out_. An opt-_in_ that guards
  accessibility or data safety will be forgotten.
- **Otherwise add a test** that fails when a new call site bypasses the seam.
- **Delete the old path** once nothing uses it, so it cannot be copied.

## Never let a comment stand in for enforcement

This repo has unusually thorough comments, and that is a strength — but a
comment asserting an invariant is not the same as enforcing it. Real examples
from one branch, each sitting on a helper adopted at a fraction of its sites:

- _"so the editor's idea of 'locked' cannot drift from the validator's"_ — the
  editors were never converted.
- _"both call through here so they cannot drift"_ — neither function called the
  other, and the two implementations already differed.
- _"EVERY path that names a target explicitly needs it"_ — adopted at one of
  four paths.
- _"must not drift apart"_ — a third surface was hand-rolled with different
  wording.

A comment may explain **why** a seam exists. It may not assert that the seam is
**universal** — only code can make that true. If you find yourself writing
"so these cannot drift", stop and add the test or the type that makes it so.

Treat an existing long comment that justifies a shortcut ("left as is
deliberately", "matches the old behaviour", "the shared part is only one line")
as a **confession, not a defence**. Evaluate the underlying decision on merit.

## Where shared code belongs

Deciding this badly is why duplication persists — nobody wants to create a
package, so they copy the file.

- **Values and types** — `@codaco/shared-consts`. Constants, keys, shared type
  definitions, small pure helpers over them.
- **Protocol structure and rules** — `@codaco/protocol-validation`. If the
  protocol schema already knows something, derive it there; never hand-copy a
  schema constraint (an array minimum, a stage type, an option set) into a
  consumer.
- **UI** — `@codaco/fresco-ui`. If two apps render the same control, it belongs
  here, not in both.
- **Interview runtime behaviour** — `@codaco/interview`, beside the contract it
  satisfies.

Use `workspace:^` (never `workspace:*`) for the new dependency. Remember the
source-first rules in `CLAUDE.md`: no `~/` aliases inside `packages/*/src`, and
`shared-consts` / `protocol-validation` need explicit `.ts` extensions.

## Two copies is a decision, not an accident

Before you copy a file to a second location, you owe an answer to: _what happens
when someone fixes a bug in one copy?_ In this repo the observed answer has been
"the other four keep the bug" — `ensureError` existed in five copies and the fix
landed in one.

If the copies genuinely must differ, make the difference a **parameter**, not a
fork. A domain list, a display name, and a feature flag are parameters. If the
only difference between two files is a string literal, there is one file.

## Checklist

Before requesting review on any change that adds or alters a shared seam:

- [ ] I named the old pattern and searched all of `apps/` and `packages/` for it
- [ ] Every hit is either converted or has a written reason not to be
- [ ] The old path is deleted, or is unreachable and marked
- [ ] A type, a safe default, or a test prevents the next bypass
- [ ] No comment in my diff asserts an invariant the code does not enforce
- [ ] Shared code landed in the right package with `workspace:^`
- [ ] `pnpm typecheck`, `pnpm knip`, and the affected packages' tests pass

## Related

- `creating-a-changeset` — a seam change in a published package is consumer-visible
- `developing-in-network-canvas` — reuse existing packages before building new
- `adopting-a-test-baseline` — do not let a regenerated snapshot absorb a regression
