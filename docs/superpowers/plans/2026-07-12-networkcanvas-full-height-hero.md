# NetworkCanvas.com Full-Height Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the navbar, headline, media and marketing copy, news ticker, and download call to action form one viewport-height tablet/desktop hero while preserving a natural mobile flow.

**Architecture:** Extend the existing `HeroIntro` shell into a responsive flex column and make the existing `Hero` container a tablet/desktop grid with four rows. Reuse the current components and entrance variants; only responsive layout classes and tests change.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, `motion/react`, Vitest, Testing Library.

## Global Constraints

- Keep all existing copy, links, semantic structure, and entrance ordering unchanged.
- Use `min-height: 100svh` from tablet portrait upward; mobile remains content-height.
- Allow unusually short tablet/desktop viewports to grow rather than clip content.
- Preserve the 4:3 hero video and all existing reduced-motion behavior.
- Use existing responsive variants and theme utilities; add no dependencies.

---

### Task 1: Establish the Viewport-Height Shell

**Files:**

- Modify: `apps/networkcanvas.com/components/sections/HeroIntro.tsx`
- Test: `apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx`

**Interfaces:**

- Consumes: existing `Header`, `Hero`, and hero entrance variants.
- Produces: a tablet/desktop `min-h-svh` flex column whose `Hero` child can fill the space below `Header`.

- [ ] **Step 1: Write the failing shell test**

In the existing render test, retain the content assertions and add:

```tsx
const shell = screen.getByText('Header content').parentElement?.parentElement;
const motionRoot = shell?.firstElementChild;

expect(shell).toHaveClass('tablet-portrait:min-h-svh');
expect(motionRoot).toHaveClass(
  'tablet-portrait:flex',
  'tablet-portrait:min-h-svh',
  'tablet-portrait:flex-col',
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter networkcanvas.com exec vitest run components/sections/__tests__/HeroIntro.test.tsx
```

Expected: FAIL because the shell and motion root do not have the viewport-height layout classes.

- [ ] **Step 3: Implement the shell layout**

Update the two wrappers in `HeroIntro`:

```tsx
<div className="tablet-portrait:min-h-svh relative isolate overflow-hidden">
  <motion.div
    className="tablet-portrait:flex tablet-portrait:min-h-svh tablet-portrait:flex-col relative z-10"
```

- [ ] **Step 4: Run the test and verify it passes**

Run the Task 1 test command again. Expected: all `HeroIntro` tests PASS.

### Task 2: Distribute the Hero Content Across the Viewport

**Files:**

- Modify: `apps/networkcanvas.com/components/sections/Hero.tsx`
- Test: `apps/networkcanvas.com/components/sections/__tests__/Hero.test.tsx`

**Interfaces:**

- Consumes: the flexible space provided by `HeroIntro`.
- Produces: a vertically centered headline row, tablet two-column media row, full-width ticker row, and centered CTA row while preserving four separate motion items.

- [ ] **Step 1: Write the failing layout test**

Add a test that renders `Hero`, locates the root, container, media row, news motion wrapper, and CTA motion wrapper, then asserts:

```tsx
expect(root).toHaveClass('tablet-portrait:flex', 'tablet-portrait:flex-1');
expect(heroContainer).toHaveClass(
  'tablet-portrait:grid',
  'tablet-portrait:flex-1',
  'tablet-portrait:grid-cols-1',
  'tablet-portrait:grid-rows-[minmax(auto,20svh)_auto_auto_auto]',
  'tablet-portrait:gap-y-10',
  'tablet-portrait:content-center',
);
expect(heading).toHaveClass(
  'tablet-portrait:row-start-1',
  'tablet-portrait:self-center',
);
expect(mediaRow).toHaveClass(
  'tablet-portrait:row-start-2',
  'tablet-portrait:grid-cols-[1.1fr_0.9fr]',
  'tablet-portrait:mt-0',
);
expect(mediaSizer).toHaveClass(
  'w-full',
  'tablet-portrait:max-w-[min(100%,48svh)]',
  'tablet-portrait:justify-self-center',
);
expect(newsWrapper).toHaveClass(
  'tablet-portrait:col-start-1',
  'tablet-portrait:row-start-3',
  'tablet-portrait:mt-0',
);
expect(ctaWrapper).toHaveClass(
  'tablet-portrait:col-start-1',
  'tablet-portrait:row-start-4',
  'tablet-portrait:mt-0',
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter networkcanvas.com exec vitest run components/sections/__tests__/Hero.test.tsx
```

Expected: FAIL because `Hero` still uses independent vertical margins and the media row changes at tablet landscape.

- [ ] **Step 3: Implement the four-row grid**

Apply these responsive responsibilities:

```tsx
<motion.div
  variants={containerVariants}
  className="tablet-portrait:flex tablet-portrait:flex-1"
>
  <Container className="tablet-portrait:grid tablet-portrait:flex-1 tablet-portrait:grid-cols-1 tablet-portrait:grid-rows-[minmax(auto,20svh)_auto_auto_auto] tablet-portrait:items-center tablet-portrait:content-center tablet-portrait:gap-y-10 tablet-portrait:pt-4 tablet-portrait:pb-6 pt-6 pb-20">
```

Vertically center the headline in grid row 1 and place the media row in row 2.
Move the media breakpoint classes from `tablet-landscape` to
`tablet-portrait`, retaining the larger landscape gap. Wrap `HeroVideo` in a
full-width sizer capped at `min(100%,48svh)` and center it in its grid column.
Place the news wrapper in row 3 and the CTA wrapper in row 4. Keep their existing
mobile `mt-12` and cancel it with `tablet-portrait:mt-0`.

- [ ] **Step 4: Run the test and verify it passes**

Run the Task 2 test command again. Expected: all `Hero` tests PASS.

### Task 3: Use the Compact News Ticker on Tablets

**Files:**

- Modify: `apps/networkcanvas.com/components/sections/NewsTicker.tsx`
- Create: `apps/networkcanvas.com/components/sections/__tests__/NewsTicker.test.tsx`

**Interfaces:**

- Produces: single-line marquee from tablet portrait upward and stacked card on mobile.

- [ ] **Step 1: Write the failing responsive test**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NewsTicker } from '../NewsTicker';

describe('NewsTicker', () => {
  it('switches to the compact marquee at tablet portrait width', () => {
    const { container } = render(<NewsTicker />);
    const ticker = container.firstElementChild;
    const desktopTicker = ticker?.children[0];
    const mobileTicker = ticker?.children[1];

    expect(desktopTicker).toHaveClass('tablet-portrait:flex', 'hidden');
    expect(mobileTicker).toHaveClass('tablet-portrait:hidden', 'flex');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm --filter networkcanvas.com exec vitest run components/sections/__tests__/NewsTicker.test.tsx
```

Expected: FAIL because the ticker still changes presentation at tablet landscape.

- [ ] **Step 3: Implement the breakpoint change**

Replace the three `tablet-landscape` variants in `NewsTicker` with
`tablet-portrait`: the outer radius, desktop marquee visibility, and mobile card
visibility.

- [ ] **Step 4: Run the test and verify it passes**

Run the Task 3 test command again. Expected: the new test PASS.

### Task 4: Verify and Ship

**Files:**

- Modify: `docs/superpowers/plans/2026-07-12-networkcanvas-full-height-hero.md`

- [ ] **Step 1: Format and automatically fix lint findings**

```bash
pnpm exec oxlint --fix apps/networkcanvas.com/components/sections/HeroIntro.tsx apps/networkcanvas.com/components/sections/Hero.tsx apps/networkcanvas.com/components/sections/NewsTicker.tsx apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx apps/networkcanvas.com/components/sections/__tests__/Hero.test.tsx apps/networkcanvas.com/components/sections/__tests__/NewsTicker.test.tsx
pnpm exec oxfmt apps/networkcanvas.com/components/sections/HeroIntro.tsx apps/networkcanvas.com/components/sections/Hero.tsx apps/networkcanvas.com/components/sections/NewsTicker.tsx apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx apps/networkcanvas.com/components/sections/__tests__/Hero.test.tsx apps/networkcanvas.com/components/sections/__tests__/NewsTicker.test.tsx docs/superpowers/plans/2026-07-12-networkcanvas-full-height-hero.md
```

Expected: both commands exit 0.

- [ ] **Step 2: Run repository quality gates**

```bash
pnpm --filter networkcanvas.com test
pnpm --filter networkcanvas.com typecheck
pnpm knip
pnpm --filter networkcanvas.com build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify responsive browser geometry**

At 390px width, confirm the hero remains naturally stacked and no content clips.
At the 958×1148 review viewport, confirm the hero bottom is at or above 1148px,
the headline is vertically centered in its flexible row, the media row is
two-column, and the ticker and CTA occupy separate lines. At 1440×900, confirm
the height-capped 4:3 media allows the hero to fill the viewport with all content
visible. Restore the user's preview to its original viewport and scroll position.

- [ ] **Step 4: Commit and push**

```bash
git add apps/networkcanvas.com/components/sections/HeroIntro.tsx apps/networkcanvas.com/components/sections/Hero.tsx apps/networkcanvas.com/components/sections/NewsTicker.tsx apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx apps/networkcanvas.com/components/sections/__tests__/Hero.test.tsx apps/networkcanvas.com/components/sections/__tests__/NewsTicker.test.tsx docs/superpowers/plans/2026-07-12-networkcanvas-full-height-hero.md
git commit -m "refactor(website): balance full-height hero"
git push origin codex/networkcanvas-homepage-media
```
