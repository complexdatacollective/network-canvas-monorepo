# Architect Install Warning Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Architect's install-app banner the warning surface and the requested platinum/neon-coral warning illustration.

**Architecture:** Continue composing the shared Fresco `Alert` and `Icon` components in `InstallBanner.tsx`. Remove only the local styles that mask the `warning` variant, and provide a banner-local icon component that changes the warning illustration's CSS-variable accents without changing shared alert defaults.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Tailwind CSS v4, `@codaco/fresco-ui`

## Global Constraints

- Preserve the banner's copy, installation behavior, dismissal behavior, accessibility semantics, and motion.
- Use existing Fresco components and project color tokens; do not add hardcoded colors.
- Keep the icon customization local to Architect's install banner.
- Do not add `any`, type assertions, ignore rules, barrel files, or convenience re-exports.

---

### Task 1: Apply and verify the warning presentation

**Files:**

- Modify: `apps/architect/src/components/InstallBanner.tsx`
- Test: `apps/architect/src/components/__tests__/InstallBanner.test.tsx`

**Interfaces:**

- Consumes: `Alert`, `AlertDescription`, and `Icon` from `@codaco/fresco-ui`
- Produces: the existing default-exported `InstallBanner` component with unchanged props and behavior

- [ ] **Step 1: Write the failing regression test**

Add a test that renders the Chromium banner and verifies that the status
element does not contain the `bg-surface-1!` or `text-surface-1-contrast!`
overrides. Query the warning SVG by its `Warning` title, verify that it retains
`fill-platinum` and `fill-platinum-dark` shapes, and verify that its custom
properties are `var(--color-neon-coral)` and
`var(--color-neon-coral-dark)`.

```tsx
it('uses warning styling and the Architect warning illustration palette', () => {
  stubBrowser({ chromium: true });
  mockGetDeferredPrompt.mockReturnValue(FAKE_PROMPT);
  render(<InstallBanner />);

  const banner = screen.getByRole('status', { name: 'Install Architect' });
  expect(banner).not.toHaveClass('bg-surface-1!');
  expect(banner).not.toHaveClass('text-surface-1-contrast!');

  const warningIcon = screen.getByTitle('Warning').parentElement;
  expect(warningIcon?.querySelector('.fill-platinum')).toBeInTheDocument();
  expect(warningIcon?.querySelector('.fill-platinum-dark')).toBeInTheDocument();
  expect(warningIcon).toHaveStyle({
    '--warning-icon-accent': 'var(--color-neon-coral)',
    '--warning-icon-accent-dark': 'var(--color-neon-coral-dark)',
  });
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
pnpm --filter @codaco/architect test -- src/components/__tests__/InstallBanner.test.tsx
```

Expected: FAIL because the banner still masks its warning surface and the icon
still derives its exclamation colors from the generic warning palette.

- [ ] **Step 3: Implement the targeted banner styling**

In `InstallBanner.tsx`, define a local warning-icon component using the shared
`Icon` component and typed CSS custom properties. Set
`--warning-icon-accent` to `var(--color-neon-coral)` and
`--warning-icon-accent-dark` to `var(--color-neon-coral-dark)`, then pass that
component through the alert's `icon` prop. Remove the surface/text overrides
from the alert and use warning-contrast utilities for the dismiss button.

```diff
-import { useState, useSyncExternalStore } from 'react';
+import {
+  type CSSProperties,
+  type SVGProps,
+  useState,
+  useSyncExternalStore,
+} from 'react';

 import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
 import Button from '@codaco/fresco-ui/Button';
+import Icon from '@codaco/fresco-ui/Icon';
+
+type InstallWarningIconStyle = CSSProperties & {
+  '--warning-icon-accent': string;
+  '--warning-icon-accent-dark': string;
+};
+
+const installWarningIconStyle: InstallWarningIconStyle = {
+  '--warning-icon-accent': 'var(--color-neon-coral)',
+  '--warning-icon-accent-dark': 'var(--color-neon-coral-dark)',
+};
+
+const InstallWarningIcon = ({
+  style,
+  ...props
+}: SVGProps<SVGSVGElement>) => (
+  <Icon
+    {...props}
+    name="warning"
+    style={{ ...installWarningIconStyle, ...style }}
+  />
+);
@@
     <Alert
       aria-label="Install Architect"
       variant="warning"
+      icon={InstallWarningIcon}
       density="compact"
-      className="border-outline bg-surface-1! text-surface-1-contrast! my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-6 py-2 shadow-none!"
+      className="border-outline my-0 shrink-0 rounded-none! border-x-0 border-t-0 border-b px-6 py-2 shadow-none!"
@@
-          className="text-muted hover:text-surface-1-contrast inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-current/10"
+          className="text-warning-contrast/70 hover:text-warning-contrast hover:bg-warning-contrast/10 inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors"
```

- [ ] **Step 4: Format and verify green**

Run:

```bash
pnpm exec oxfmt apps/architect/src/components/InstallBanner.tsx apps/architect/src/components/__tests__/InstallBanner.test.tsx docs/superpowers/specs/2026-07-12-architect-install-warning-banner-design.md docs/superpowers/plans/2026-07-12-architect-install-warning-banner.md
pnpm --filter @codaco/architect test -- src/components/__tests__/InstallBanner.test.tsx
pnpm exec oxlint --fix apps/architect/src/components/InstallBanner.tsx apps/architect/src/components/__tests__/InstallBanner.test.tsx
pnpm --filter @codaco/architect typecheck
pnpm knip
```

Expected: every command exits successfully with no new warnings or errors.

- [ ] **Step 5: Inspect and capture the rendered banner**

Run Architect's development server, open it at a desktop viewport, verify the
warning banner's surface and icon palette visually, and save a screenshot for
the user.

- [ ] **Step 6: Commit the verified change**

Run:

```bash
git add apps/architect/src/components/InstallBanner.tsx apps/architect/src/components/__tests__/InstallBanner.test.tsx docs/superpowers/specs/2026-07-12-architect-install-warning-banner-design.md docs/superpowers/plans/2026-07-12-architect-install-warning-banner.md
git commit -m "style(architect): emphasize install warning banner"
```

Expected: one commit containing the tested component change and its design and
implementation documentation.
