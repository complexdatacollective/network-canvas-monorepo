# NetworkCanvas.com Page-Wide Background Blobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero-scoped lights with a subtle fixed background that fades in animated `BackgroundBlobs` for normal motion without flashing a different fallback treatment.

**Architecture:** A new client `PageBackground` component owns the hydration-safe motion branch and fixed decorative layer. `HomePage` composes it once behind one foreground wrapper, while `HeroIntro` retains only entrance sequencing.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, `motion/react`, `@codaco/art`, Vitest, Testing Library.

## Global Constraints

- Keep all existing homepage copy and section order unchanged.
- Use a fixed viewport layer behind the entire page at 10% opacity.
- Use existing theme colors only.
- The background must be pointer-inert and hidden from assistive technology.
- Reduced-motion and initial hydration must render a transparent decorative layer and no animated blob canvas.
- Do not modify `@codaco/art` or add a library changeset.

---

### Task 1: Compose the Page-Wide Background

**Files:**

- Create: `apps/networkcanvas.com/components/ui/PageBackground.tsx`
- Create: `apps/networkcanvas.com/components/ui/__tests__/PageBackground.test.tsx`
- Create: `apps/networkcanvas.com/components/ui/__tests__/PageBackgroundPlacement.test.tsx`
- Modify: `apps/networkcanvas.com/components/sections/HeroIntro.tsx`
- Modify: `apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx`
- Modify: `apps/networkcanvas.com/app/page.tsx`
- Delete: `apps/networkcanvas.com/components/ui/Blob.tsx`
- Delete: `apps/networkcanvas.com/public/images/blobs/multi-2.svg`

**Interfaces:**

- Produces: `PageBackground()` with no props.
- Consumes: `BackgroundBlobs` from `@codaco/art` and `useReducedMotion()` from `motion/react`.

- [ ] **Step 1: Write the failing page-background tests**

Add tests that mock `BackgroundBlobs` and `useReducedMotion` and assert:

```tsx
expect(backgroundLayer).toHaveClass(
  'pointer-events-none',
  'fixed',
  'inset-0',
  'z-0',
  'opacity-10',
);
expect(backgroundLayer).toHaveAttribute('aria-hidden', 'true');
expect(backgroundBlobsProps).toHaveBeenCalledWith(
  expect.objectContaining({
    large: 2,
    medium: 3,
    small: 1,
    speedFactor: 0.35,
  }),
);
```

The reduced-motion test must assert that neither a fallback nor the mocked
`BackgroundBlobs` is rendered.

- [ ] **Step 2: Verify the new test fails**

Run:

```bash
pnpm --filter networkcanvas.com exec vitest run components/ui/__tests__/PageBackground.test.tsx
```

Expected: FAIL because `PageBackground.tsx` does not exist.

- [ ] **Step 3: Implement `PageBackground`**

Create a client component that:

- uses `useReducedMotion()` and a mount flag;
- renders a fixed `aria-hidden` wrapper with `opacity-10`;
- renders `BackgroundBlobs` only when mounted and normal motion is explicit;
- resolves `--neon-coral`, `--mustard`, `--sea-green`, and `--cerulean-blue`
  into concrete colors before passing them to the canvas-based component;
- fades the blob canvas in once the palette is ready and otherwise leaves the
  layer transparent.

- [ ] **Step 4: Remove the hero-scoped background**

Delete the `BackgroundLights` import, palette, mount flag, background markup,
and now-unused `useEffect`/`useState` imports from `HeroIntro`. Keep the entrance
controls and hydration behavior unchanged. Update its test to stop mocking or
asserting `@codaco/art`; retain all entrance and hydration assertions.

- [ ] **Step 5: Compose the page-wide layer**

In `app/page.tsx`, render:

```tsx
<main className="relative isolate">
  <PageBackground />
  <div className="relative z-10">{/* existing sections unchanged */}</div>
</main>
```

Render `DesignPrinciples` directly and delete the mistaken legacy
`multi-2.svg` decoration, its now-unused wrapper component, and the asset.

- [ ] **Step 6: Verify tests and quality gates**

Run:

```bash
pnpm --filter networkcanvas.com test
pnpm --filter networkcanvas.com typecheck
pnpm exec oxlint --fix apps/networkcanvas.com/components/ui/PageBackground.tsx apps/networkcanvas.com/components/ui/__tests__/PageBackground.test.tsx apps/networkcanvas.com/components/ui/__tests__/PageBackgroundPlacement.test.tsx apps/networkcanvas.com/components/sections/HeroIntro.tsx apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx apps/networkcanvas.com/app/page.tsx
pnpm exec oxfmt apps/networkcanvas.com/components/ui/PageBackground.tsx apps/networkcanvas.com/components/ui/__tests__/PageBackground.test.tsx apps/networkcanvas.com/components/ui/__tests__/PageBackgroundPlacement.test.tsx apps/networkcanvas.com/components/sections/HeroIntro.tsx apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx apps/networkcanvas.com/app/page.tsx docs/superpowers/specs/2026-07-12-networkcanvas-pagewide-background-blobs-design.md docs/superpowers/plans/2026-07-12-networkcanvas-pagewide-background-blobs.md
pnpm knip
pnpm --filter networkcanvas.com build
```

Expected: all commands exit 0.

- [ ] **Step 7: Browser verification**

Verify desktop, mobile, and reduced motion. Confirm the background remains
visible while scrolling, content contrast stays clear, pointer interaction is
unaffected, reduced motion renders no blob canvas, and the console has no app
errors or hydration warnings.

- [ ] **Step 8: Commit**

```bash
git add apps/networkcanvas.com/components/ui/Blob.tsx apps/networkcanvas.com/components/ui/PageBackground.tsx apps/networkcanvas.com/components/ui/__tests__/PageBackground.test.tsx apps/networkcanvas.com/components/ui/__tests__/PageBackgroundPlacement.test.tsx apps/networkcanvas.com/components/sections/HeroIntro.tsx apps/networkcanvas.com/components/sections/__tests__/HeroIntro.test.tsx apps/networkcanvas.com/app/page.tsx apps/networkcanvas.com/public/images/blobs/multi-2.svg docs/superpowers/specs/2026-07-12-networkcanvas-pagewide-background-blobs-design.md docs/superpowers/plans/2026-07-12-networkcanvas-pagewide-background-blobs.md
git commit -m "feat(website): add page-wide background blobs"
```
