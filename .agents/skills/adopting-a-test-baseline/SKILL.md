---
name: adopting-a-test-baseline
description: 'Use when a committed test baseline changed and you are about to accept it — Playwright ARIA snapshots, pixel PNGs, inline/file snapshots, or any generated fixture. Establish WHAT changed and WHY before committing, so a regression cannot be absorbed into the expected state. Keywords: update snapshots, regenerate baseline, snapshot changed, aria snapshot, --update-snapshots, accept baseline, snapshot diff, toMatchAriaSnapshot, visual baseline, obsolete snapshot, test baseline failing.'
---

# Adopting a test baseline

A baseline is an assertion about correct behaviour. Regenerating it without
reading it converts **any** regression it captured into the new expected state,
silently and permanently — and the test then defends the bug.

Two real cases from one branch:

- A 1280×20190 print baseline was committed with the commit message recording
  that the author _"could not locate the changed row"_. Whatever changed shipped
  unreviewed.
- Regenerated WebKit ARIA baselines absorbed 18 buttons with no accessible name.
  (They turned out to be a dependency's focus guards — but nothing in the
  process would have distinguished that from a real accessibility regression.)

## The rule

> Never commit a regenerated baseline you have not diffed and explained.

If you cannot say **what** changed and **why it is correct**, you are not ready
to commit it. "The test passes now" is not an explanation — you made it pass.

## Procedure

### 1. Diff before you accept

Regenerate into the working tree, then read the diff. Do not `git add -A`.

```bash
git diff -- <baseline path>
```

For every hunk, answer: _which change in my diff produced this?_ If a hunk has
no cause you can name in your own change, **stop** — you have found either a
regression or a dependency's behaviour leaking in.

### 2. ARIA snapshots — read them as accessibility assertions

`packages/interview/e2e/aria-snapshots/**` is the accessibility tree in text.
These are OS-independent, so they diff cleanly and there is no excuse for not
reading them.

Grep your diff for the failure signatures before committing:

```bash
# interactive elements that lost their accessible name — a WCAG 4.1.2 failure
git diff -- 'packages/interview/e2e/aria-snapshots/**' | rg '^\+\s*- (button|link|checkbox|textbox|combobox)\s*$'

# roles that disappeared entirely
git diff -- 'packages/interview/e2e/aria-snapshots/**' | rg '^-\s*- (heading|status|alert|navigation)'
```

An added bare `- button` with no name is presumed a regression until you prove
otherwise. Compare engines: if a node appears in `webkit/` but not `chromium/`,
it is usually a browser accessibility-tree difference or a dependency internal,
not your component — confirm by probing the live DOM (below) rather than
guessing.

Baselines must not pin a **dependency's** internals. If they do, filter those
nodes out of capture so the baseline stays a statement about _our_ UI — and so a
genuine unnamed control is still visible against the noise.

### 3. Pixel baselines — locate the change programmatically

A tall print snapshot cannot be eyeballed. Find the changed rows instead of
scrolling. `pngjs` is already in the workspace, so run this from the repo root
(no install needed):

```js
// scratch/rowdiff.mjs — run: node scratch/rowdiff.mjs old.png new.png
// get the committed version first:  git show <ref>:<path> > old.png
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
const A = PNG.sync.read(readFileSync(a));
const B = PNG.sync.read(readFileSync(b));
console.log(`old ${A.width}x${A.height}  new ${B.width}x${B.height}  delta-h ${B.height - A.height}`);

const w = Math.min(A.width, B.width);
const h = Math.min(A.height, B.height);
const rowDiffers = (y) => {
  for (let x = 0; x < w; x++) {
    const i = (y * A.width + x) * 4;
    const j = (y * B.width + x) * 4;
    if (A.data[i] !== B.data[j] || A.data[i + 1] !== B.data[j + 1] || A.data[i + 2] !== B.data[j + 2]) return true;
  }
  return false;
};

const bands = [];
let start = null;
for (let y = 0; y < h; y++) {
  const d = rowDiffers(y);
  if (d && start === null) start = y;
  if (!d && start !== null) { bands.push([start, y - 1]); start = null; }
}
if (start !== null) bands.push([start, h - 1]);
console.log(`${bands.length} changed bands:`);
for (const [s, e] of bands) console.log(`  rows ${s}-${e} (${e - s + 1}px)`);
```

Then crop each band and look at it (`sharp` is also in the workspace). If the
image grew, the added region is at the size delta — crop and inspect that too.

Note that a **row-shift** makes everything below it differ, so a long tail of
bands usually means one insertion near the top, not hundreds of changes. Find
the first band, explain it, and re-diff with the shift accounted for before
concluding the rest are real.

**A baseline nobody can review is itself a defect.** If a snapshot is so large
that locating a change needs a script every time, split it into per-section
baselines as part of accepting the change.

### 4. Probing the live DOM when a diff has no obvious cause

Write a throwaway spec, run it, read it, delete it:

```ts
// e2e/specs/matrix/zz-probe.spec.ts — DELETE after use
const report = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter((el) => !(el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
    .map((el) => el.outerHTML.slice(0, 200)),
);
console.log('PROBE ' + JSON.stringify(report, null, 2));
```

Run against the specific project so it is fast:

```bash
pnpm --filter @codaco/interview exec playwright test \
  --config e2e/playwright.config.ts --project=webkit-matrix zz-probe --reporter=line
```

ARIA snapshots are text and OS-independent, so `test:e2e:native` is fine for
them. Committed **PNG** baselines are the exception — those must come from the
pinned container (see `regenerating-e2e-visual-snapshots`), because the pixel
lane keys on the rendering environment.

### 5. Write down what changed

Put the cause in the commit message or changeset — "toolbar controls are now
grouped, so each group gained a labelled `group` node" — not "update snapshots".
The next person to see this diff in `git log` needs your reasoning, and a commit
message that admits you could not find the change is a signal to stop, not ship.

## Checklist

- [ ] I read every hunk of the baseline diff
- [ ] Every hunk traces to a specific change in my own diff
- [ ] No interactive element lost its accessible name
- [ ] No baseline pins a dependency's internal nodes
- [ ] Pixel changes were located programmatically and inspected, not assumed
- [ ] Any baseline too large to review got split
- [ ] The cause is written in the commit message or changeset
- [ ] Throwaway probe specs are deleted

## Related

- `regenerating-e2e-visual-snapshots` — the workflow for committed PNG baselines
- `preparing-e2e-visual-baselines` — deciding whether a change can alter pixels at all
- `verifying-an-interface-change` — the e2e matrix when an interface changed
- `writing-an-oracle-that-can-fail` — a passing test is not evidence on its own
