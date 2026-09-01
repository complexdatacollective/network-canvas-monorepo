---
name: writing-an-oracle-that-can-fail
description: 'Use when writing or reviewing a test assertion — especially e2e specs, negative assertions ("nothing happened"), and helpers that read state out of the browser. Prove the test fails when the behaviour it guards breaks. Keywords: write a test, e2e spec, playwright, assertion, oracle, negative assertion, nothing happened, waitForTimeout, sleep in test, flaky test, test passes but, brittle selector, querySelector in test, catch swallows error, vacuous test, test coverage.'
---

# Writing an oracle that can fail

A test that cannot fail is worse than no test: it reports safety that is not
there, and it costs CI time to tell you nothing. The failure is invisible —
green is green — so it has to be designed out, not spotted in review.

Real examples from one branch, all of which passed CI:

- A helper caught every IndexedDB error and returned `-1`. The "library
  untouched" assertion compared `-1` to `-1` and passed **while reading
  nothing**.
- A spec anchored its central assertion to Tailwind utility classes and
  positional DOM indices — it would pass after a genuine layout regression and
  fail after a purely cosmetic class rename.
- Nineteen generated tests iterated a list that could be empty; all nineteen
  passed with zero assertions executed.

## The one question

> If the behaviour I am guarding broke right now, would this test go red?

If you cannot answer yes with evidence, the test is not finished.

## Prove it, don't assume it

Before committing a test, **make it fail on purpose**:

1. Break the production code the test guards (invert a condition, delete the
   fix, return early).
2. Run the test. It must fail, **for the reason you expect** — read the failure
   message, don't just check for red.
3. Restore the code. It must pass.

This is the whole discipline. A test you have never seen fail is a hypothesis.

## The failure modes

### Swallowed errors

Never let a helper that reads state convert an error into a value the assertion
can compare successfully.

```ts
// WRONG — a thrown DB error becomes -1, and -1 === -1 passes
const counts = await page.evaluate(async () => {
  try { return await readCounts(); } catch { return -1; }
});

// RIGHT — the read either produces real data or fails the test
const counts = await page.evaluate(() => readCounts()); // let it throw
expect(counts.protocols).toBe(3);
```

If a read genuinely may be absent, distinguish _absent_ from _failed_: return
`null` for absent and let failures throw.

### Loops that may not run

A generated or data-driven test must assert its own input is non-empty.

```ts
const cases = collectCases();
expect(cases.length).toBeGreaterThan(0);   // the test that guards the tests
for (const c of cases) { /* ... */ }
```

### Assertions on implementation detail

Query by what the user perceives — role, accessible name, label — not by class
names, tag names, or position. Classes belong to the design system and change
for cosmetic reasons; roles and names are the contract.

```ts
// WRONG — passes after a real regression, fails after a rename
expect(container.querySelector('div.flex > button:nth-child(2)')).toBeTruthy();

// RIGHT
await expect(page.getByRole('button', { name: 'Add stage' })).toBeVisible();
```

Asserting on a class is defensible only when the class **is** the behaviour
under test (a visual-state test), and then it should be asserting on _our_
token, never a dependency's internal class.

### Sleeps standing in for oracles

`waitForTimeout` is almost always a race being papered over. Playwright's
web-first assertions retry; use them.

```ts
await expect(dialog).toBeVisible();          // retries — no sleep needed
```

**The one legitimate use** is a negative assertion — proving something did _not_
happen, where no event exists to await. There, a bounded wait is the oracle. It
must be:

- justified in a comment stating which race it covers and why no event-based
  oracle exists,
- **shared**, not copy-pasted. Three specs repeating `waitForTimeout(1000)` with
  the same pasted rationale is a helper waiting to be extracted:

```ts
/** Give an erroneously-accepted write time to reach IndexedDB before asserting it did not. */
export async function expectNoWriteWithin(page: Page, ms = 1_000) { await page.waitForTimeout(ms); }
```

Strengthen a negative assertion by pairing it with a positive one: assert the
refusal was _observed_ (the guard dialog appeared, an error was announced), not
only that the state is unchanged.

### Page objects that duplicate selectors

When the same locator is rebuilt by hand across dozens of call sites, one
markup change breaks them all and the fixture that should own it goes unused.
If a fixture already exposes the accessor, make it public and use it; do not
hand-build `[data-field-name="…"]` in 60 places.

## Reviewing someone else's test

Ask, in order:

1. Has this test ever been seen to fail? Can I break the code and watch it?
2. Does any helper swallow an error into a comparable value?
3. Can any loop or generated case list be empty?
4. Does the assertion name a role and an accessible name, or a class and an index?
5. Is every sleep a negative assertion with a written justification?
6. Does the test assert the _behaviour_, or merely that a snapshot matches?

## Checklist

- [ ] I broke the production code and watched this test fail, for the right reason
- [ ] No helper turns an error into a passing value
- [ ] Generated/looped cases assert their input is non-empty
- [ ] Assertions use roles and accessible names, not classes or positions
- [ ] Every sleep is a negative assertion, justified, and shared not copy-pasted
- [ ] Shared locators come from the fixture, not hand-built at the call site

## Related

- `adopting-a-test-baseline` — a snapshot is an assertion; read it before accepting it
- `running-architect-e2e-tests` — running and extending the Architect suite
- `verifying-an-interface-change` — the interview e2e configuration matrix
