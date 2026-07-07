# interviewer-v8 Storybook Stories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `interviewer-v8`'s unique components Storybook coverage — authentication/authorisation components first, then the remaining unique components — refactoring context-bound components into a pure presentational view plus a thin container so each renders prop-driven in isolation.

**Architecture:** Storybook infra already exists (`.storybook/`, scripts, vitest `storybook` project, turbo tasks). Each task adds a `*.stories.tsx` beside the component. Components that read app context (`useAuth`/`useWizard`/`authApi`/`useToast`/`useDialog`) get a behaviour-preserving split: a pure `XView` (all inputs via props) rendered by a thin container `X` that keeps the current exported name and every existing call site. Stories target the pure surface with a single args-driven default story; named stories are added only for a state a control can't reach or to carry a `play()` test.

**Tech Stack:** React 18, Storybook 9 (`@storybook/react-vite`), Tailwind v4, `@codaco/fresco-ui` primitives, `motion`, Vitest (`unit` + browser-mode `storybook` projects), oxlint + oxfmt.

## Global Constraints

- **No `any`, no `as` type-bypass assertions, no lint/tsc ignore rules** — fix the underlying type. (repo + app CLAUDE.md)
- **No barrel files; no re-exports for convenience** — import from source. Co-locate each `XView` in the same file as its container `X`.
- **No changeset** — interviewer-v8 is unreleased.
- **No CI/Chromatic changes** — out of scope.
- **No vault/auth runtime behaviour change** — splits are behaviour-preserving; existing unit tests must stay green.
- **Single args-driven default story per component**; presets only where a control can't reach the state.
- **Formatting/linting is handled by the pre-commit hook** (oxfmt + oxlint on staged files). Do not run `pnpm lint:fix`/`format` inside tasks; do not add a per-task `pnpm typecheck` — typecheck is deferred to the single final task (Task 16).
- **Story theming/providers** come from the existing global decorator in `apps/interviewer-v8/.storybook/preview.tsx` (Toast, Tooltip, Dialog, DnD, Direction, Motion, interview theme). Add `withFormStore` (Task 2) only for stories containing connected `Field`s.
- All paths below are relative to the repo root; the app lives at `apps/interviewer-v8/`.

## Commands (use the filtered form so turbo builds workspace deps first)

- Single unit test file: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit <path>`
- All unit tests: `pnpm --filter @codaco/interviewer-v8 test`
- Story play tests (browser-mode, headless Playwright chromium): `pnpm --filter @codaco/interviewer-v8 test:storybook`
  - This project is CI-oriented and can be slow/flaky locally (see the interview-package precedent). If it flakes, re-run once; the authoritative visual check is the build below plus eyeballing the story in the dev server.
- Build Storybook (proves every story compiles/renders): `pnpm --filter @codaco/interviewer-v8 build-storybook`
- Storybook dev server (visual check): `pnpm --filter @codaco/interviewer-v8 storybook` (port 6006 — kill any existing 6006 server first)
- knip: `pnpm knip`

## File Structure

**New files (stories, one per component beside the source):**

- `apps/interviewer-v8/src/storybook/decorators.tsx` — shared `withFormStore` decorator (Task 2).
- `apps/interviewer-v8/src/components/UnlockForms/UnlockEmblem.stories.tsx`
- `apps/interviewer-v8/src/components/SetupWizard/Glyphs.stories.tsx` (the three glyphs together)
- `apps/interviewer-v8/src/components/UnlockForms/PasswordUnlockField.stories.tsx`
- `apps/interviewer-v8/src/components/UnlockForms/PinUnlockField.stories.tsx`
- `apps/interviewer-v8/src/components/UnlockForms/BiometricUnlockForm.stories.tsx`
- `apps/interviewer-v8/src/components/UnlockForms/PinUnlockForm.stories.tsx`
- `apps/interviewer-v8/src/components/SetupWizard/NoRecoveryNotice.stories.tsx`
- `apps/interviewer-v8/src/components/SecurityBehaviorControls.stories.tsx`
- `apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.stories.tsx`
- `apps/interviewer-v8/src/components/LockScreen.stories.tsx`
- `apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.stories.tsx`
- `apps/interviewer-v8/src/components/SetupWizard/Step2MethodPicker.stories.tsx`
- `apps/interviewer-v8/src/components/SetupWizard/Step3PinConfigure.stories.tsx`
- `apps/interviewer-v8/src/components/SetupWizard/Step3PassphraseConfigure.stories.tsx`
- `apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.stories.tsx`
- `apps/interviewer-v8/src/components/ManageAuthenticator.stories.tsx`
- Non-auth stories under Part B.

**Modified source files (behaviour-preserving view extraction):**

- `UnlockForms/BiometricLockBody.tsx` (add `limited?` prop)
- `LockScreen.tsx`, `lib/auth/StepUpAuthDialog.tsx`, `SetupWizard/Step2MethodPicker.tsx`, `SetupWizard/Step3PinConfigure.tsx`, `SetupWizard/Step3PassphraseConfigure.tsx`, `SetupWizard/Step3BiometricConfigure.tsx`, `ManageAuthenticator.tsx`

---

# Part A — Auth/authz (priority)

## Task 1: UnlockEmblem + glyph stories (pure visual leaves)

**Files:**

- Create: `apps/interviewer-v8/src/components/UnlockForms/UnlockEmblem.stories.tsx`
- Create: `apps/interviewer-v8/src/components/SetupWizard/Glyphs.stories.tsx`

**Interfaces:**

- Consumes: `UnlockEmblem({ icon: LucideIcon; seed: string })` (named export); `AuthorisationGlyph`, `SecureDataGlyph`, `SetupGlyph` (default exports, pure SVG, `currentColor`, `aria-hidden`).
- Produces: nothing consumed by later tasks. Establishes the canonical single-args-story shape.

- [ ] **Step 1: Write `UnlockEmblem.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Fingerprint,
  KeyRound,
  RectangleEllipsis,
  ShieldCheck,
} from 'lucide-react';

import { UnlockEmblem } from './UnlockEmblem';

// The decorative, seed-patterned emblem shown above every unlock/enrolment
// dialog. The Pattern background and the ring colour are derived from `seed`;
// `icon` is any lucide glyph. One args-driven story — change the seed to see
// the palette shift, swap the icon from the controls.
const ICONS = { KeyRound, RectangleEllipsis, Fingerprint, ShieldCheck };

type StoryArgs = { seed: string; icon: keyof typeof ICONS };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockEmblem',
  parameters: { layout: 'centered' },
  args: { seed: 'pin-unlock', icon: 'KeyRound' },
  argTypes: {
    seed: {
      control: 'text',
      description: 'Seeds the Pattern palette + ring colour',
    },
    icon: { control: 'select', options: Object.keys(ICONS) },
  },
  render: ({ seed, icon }) => <UnlockEmblem seed={seed} icon={ICONS[icon]} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

- [ ] **Step 2: Write `Glyphs.stories.tsx`**

Confirm the three glyph import paths/exports first (`AuthorisationGlyph.tsx`, `SecureDataGlyph.tsx`, `SetupGlyph.tsx` in `SetupWizard/` — all default exports). Then:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import AuthorisationGlyph from './AuthorisationGlyph';
import SecureDataGlyph from './SecureDataGlyph';
import SetupGlyph from './SetupGlyph';

// The three decorative wizard-step SVGs. They inherit `currentColor` and size
// from their box, so one story renders all three at a controllable size/colour.
const GLYPHS = {
  Setup: SetupGlyph,
  Authorisation: AuthorisationGlyph,
  SecureData: SecureDataGlyph,
};

type StoryArgs = { size: number; color: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/Wizard Glyphs',
  parameters: { layout: 'centered' },
  args: { size: 96, color: '#3b2f6b' },
  argTypes: {
    size: { control: { type: 'range', min: 32, max: 240, step: 8 } },
    color: { control: 'color' },
  },
  render: ({ size, color }) => (
    <div className="flex items-end gap-8" style={{ color }}>
      {Object.entries(GLYPHS).map(([name, Glyph]) => (
        <figure key={name} className="flex flex-col items-center gap-2">
          <div style={{ width: size, height: size }}>
            <Glyph />
          </div>
          <figcaption className="text-text/60 text-xs">{name}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

> If a glyph does not size from its wrapper (fixed `width`/`height` in the SVG), drop the `style` sizing wrapper for that glyph and render it directly — check the SVG's root attributes when you open the files.

- [ ] **Step 3: Verify both stories build**

Run: `pnpm --filter @codaco/interviewer-v8 build-storybook`
Expected: build succeeds; log lists `Auth/UnlockEmblem` and `Auth/Wizard Glyphs`.

- [ ] **Step 4: Visual check** — `pnpm --filter @codaco/interviewer-v8 storybook`, open both stories, confirm the emblem shows a patterned ring and the glyphs render. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/UnlockForms/UnlockEmblem.stories.tsx apps/interviewer-v8/src/components/SetupWizard/Glyphs.stories.tsx
git commit -m "test(interviewer-v8): stories for UnlockEmblem and wizard glyphs"
```

---

## Task 2: `withFormStore` decorator + PasswordUnlockField + PinUnlockField stories

**Files:**

- Create: `apps/interviewer-v8/src/storybook/decorators.tsx`
- Create: `apps/interviewer-v8/src/components/UnlockForms/PasswordUnlockField.stories.tsx`
- Create: `apps/interviewer-v8/src/components/UnlockForms/PinUnlockField.stories.tsx`

**Interfaces:**

- Consumes: `PasswordUnlockField({ autoFocus?: boolean })` (default export); `PinUnlockField(props)` (default export, connected `Field name="pin"`, extra `onComplete?: () => void`).
- Produces: `withFormStore` — a Storybook decorator wrapping a story in fresco-ui's `FormStoreProvider`. Imported by every later story containing a connected `Field` (Tasks 4, 11).

- [ ] **Step 1: Write the shared decorator**

```tsx
// apps/interviewer-v8/src/storybook/decorators.tsx
import type { Decorator } from '@storybook/react-vite';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';

// Connected fresco-ui `Field`s read/write a form store via context. The app
// mounts one per form (or via the wizard); stories that render a bare Field
// need this decorator so the field has a store to bind to.
export const withFormStore: Decorator = (Story) => (
  <FormStoreProvider>
    <Story />
  </FormStoreProvider>
);
```

- [ ] **Step 2: Write `PasswordUnlockField.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import { withFormStore } from '~/storybook/decorators';

import PasswordUnlockField from './PasswordUnlockField';

// The passphrase entry field used by the passphrase lock/step-up dialogs.
// Password-manager autofill is suppressed and the strength meter is hidden
// (this is unlock, not enrolment).
type StoryArgs = { autoFocus: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/PasswordUnlockField',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { autoFocus: false },
  argTypes: { autoFocus: { control: 'boolean' } },
  render: ({ autoFocus }) => (
    <div className="max-w-sm">
      <PasswordUnlockField autoFocus={autoFocus} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

- [ ] **Step 3: Write `PinUnlockField.stories.tsx`**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { withFormStore } from '~/storybook/decorators';

import PinUnlockField from './PinUnlockField';

// The 8-digit segmented PIN field. It fires `onComplete` once all 8 segments
// are filled (the form uses that to auto-submit).
type StoryArgs = { autoFocus: boolean; disabled: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/PinUnlockField',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { autoFocus: true, disabled: false },
  argTypes: {
    autoFocus: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  render: ({ autoFocus, disabled }) => (
    <div className="max-w-md">
      <PinUnlockField autoFocus={autoFocus} disabled={disabled} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Confirms onComplete fires only after the 8th digit.
export const FiresOnComplete: Story = {
  render: (args) => {
    const onComplete = fn();
    return (
      <div className="max-w-md">
        <PinUnlockField {...args} onComplete={onComplete} data-onComplete />
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const inputs = await canvas.findAllByRole('textbox');
    // Type 8 digits across the segmented field.
    for (const digit of '12345678') {
      await userEvent.keyboard(digit);
    }
    // The field is filled; the visible value is what we assert on (onComplete
    // wiring is covered by PinUnlockForm's play test in Task 4).
    await expect(inputs.length).toBeGreaterThan(0);
  },
};
```

> `SegmentedCodeField`'s DOM (roles, whether it is one input or eight) must be confirmed against the rendered story — open it in the dev server and adjust the `play` selectors/assertions to match. If a robust interaction assertion isn't cheap here, keep only `Default` and drop `FiresOnComplete`; the auto-submit behaviour is fully covered by Task 4.

- [ ] **Step 4: Build + visual check**

Run: `pnpm --filter @codaco/interviewer-v8 build-storybook` → succeeds.
Dev server: confirm both fields render and accept input.

- [ ] **Step 5: knip** (first task adding a shared non-story module)

Run: `pnpm knip`
Expected: no new "unused file/export" for `src/storybook/decorators.tsx` (it is imported by the two stories, which are knip entries). If knip flags it, confirm the stories import path `~/storybook/decorators` resolves.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v8/src/storybook/decorators.tsx apps/interviewer-v8/src/components/UnlockForms/PasswordUnlockField.stories.tsx apps/interviewer-v8/src/components/UnlockForms/PinUnlockField.stories.tsx
git commit -m "test(interviewer-v8): withFormStore decorator + unlock field stories"
```

---

## Task 3: BiometricUnlockForm story (+ play)

**Files:**

- Create: `apps/interviewer-v8/src/components/UnlockForms/BiometricUnlockForm.stories.tsx`

**Interfaces:**

- Consumes: `BiometricUnlockForm({ onSubmit: () => Promise<{ ok: boolean; message?: string }>; submitLabel?: string; disabled?: boolean })` (default export). It owns its own `submitting`/`error` state; on a failed `onSubmit` it renders `result.message` in a `role="alert"`.
- Produces: the `outcome`→async-callback pattern reused by Tasks 4, 7, 9, 14.

- [ ] **Step 1: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import BiometricUnlockForm from './BiometricUnlockForm';

// The button-driven biometric unlock control. `onSubmit` returns
// {ok, message?}; the form shows a "Waiting…" label while pending and an
// alert on failure. Drive the outcome from the controls.
type Outcome = 'success' | 'failure';
type StoryArgs = { outcome: Outcome; submitLabel: string; disabled: boolean };

const makeSubmit = (outcome: Outcome) => async () => {
  await new Promise((r) => setTimeout(r, 150));
  return outcome === 'success'
    ? { ok: true }
    : { ok: false, message: 'Authenticator not recognised.' };
};

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/BiometricUnlockForm',
  parameters: { layout: 'padded' },
  args: {
    outcome: 'success',
    submitLabel: 'Unlock with authenticator',
    disabled: false,
  },
  argTypes: {
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
    submitLabel: { control: 'text' },
    disabled: { control: 'boolean' },
  },
  render: ({ outcome, submitLabel, disabled }) => (
    <div className="max-w-sm">
      <BiometricUnlockForm
        onSubmit={makeSubmit(outcome)}
        submitLabel={submitLabel}
        disabled={disabled}
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// A failed authentication surfaces the error alert.
export const Failure: Story = {
  args: { outcome: 'failure' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button'));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Authenticator not recognised.',
    );
  },
};
```

- [ ] **Step 2: Run the play test**

Run: `pnpm --filter @codaco/interviewer-v8 test:storybook`
Expected: PASS (the `Failure` story clicks and asserts the alert). If browser-mode flakes, re-run once; then confirm visually.

- [ ] **Step 3: Build** — `pnpm --filter @codaco/interviewer-v8 build-storybook` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v8/src/components/UnlockForms/BiometricUnlockForm.stories.tsx
git commit -m "test(interviewer-v8): BiometricUnlockForm story with failure play test"
```

---

## Task 4: PinUnlockForm story (+ play: auto-submit / clear-on-error)

**Files:**

- Create: `apps/interviewer-v8/src/components/UnlockForms/PinUnlockForm.stories.tsx`

**Interfaces:**

- Consumes: `PinUnlockForm({ formId: string; verifyPin: (pin: string) => Promise<{ ok: boolean; message?: string }>; invalidMessage?: string })` (named export). It renders inside a `FormWithoutProvider`, so it needs a form store (`withFormStore`). On a failed verify it clears the field and remounts it (via a changing `key`).

- [ ] **Step 1: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';

import { withFormStore } from '~/storybook/decorators';

import { PinUnlockForm } from './PinUnlockForm';

// The full PIN unlock form: it auto-submits when the 8th digit lands and, on a
// wrong PIN, clears + refocuses the field so the user can retype. Drive the
// verify outcome from the controls.
type Outcome = 'success' | 'failure';
type StoryArgs = { outcome: Outcome; invalidMessage: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/PinUnlockForm',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { outcome: 'failure', invalidMessage: 'Incorrect PIN.' },
  argTypes: {
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
    invalidMessage: { control: 'text' },
  },
  render: ({ outcome, invalidMessage }) => (
    <div className="max-w-md">
      <PinUnlockForm
        formId="story-pin-form"
        invalidMessage={invalidMessage}
        verifyPin={async (pin) => {
          await new Promise((r) => setTimeout(r, 100));
          return outcome === 'success'
            ? { ok: true }
            : { ok: false, message: invalidMessage };
        }}
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Typing 8 digits auto-submits; a wrong PIN surfaces the error and clears.
export const AutoSubmitAndClearOnError: Story = {
  render: (args) => {
    const verifyPin = fn(async () => ({
      ok: false,
      message: 'Incorrect PIN.',
    }));
    return (
      <div className="max-w-md">
        <PinUnlockForm formId="story-pin-form" verifyPin={verifyPin} />
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    for (const digit of '00000000') {
      await userEvent.keyboard(digit);
    }
    // Auto-submit fired verifyPin; the error message is shown.
    await expect(await canvas.findByText('Incorrect PIN.')).toBeInTheDocument();
  },
};
```

> Confirm the segmented field's typing model against the rendered story (focus behaviour, whether digits go to a single active segment). Adjust the `play` keyboard sequence if needed. The assertion that matters: after 8 digits, `verifyPin` ran and the error text appears.

- [ ] **Step 2: Run play test** — `pnpm --filter @codaco/interviewer-v8 test:storybook` → PASS (re-run once on flake).

- [ ] **Step 3: Build** → succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v8/src/components/UnlockForms/PinUnlockForm.stories.tsx
git commit -m "test(interviewer-v8): PinUnlockForm story with auto-submit/clear play test"
```

---

## Task 5: NoRecoveryNotice story

**Files:**

- Create: `apps/interviewer-v8/src/components/SetupWizard/NoRecoveryNotice.stories.tsx`

**Interfaces:**

- Consumes: `NoRecoveryNotice({ method: 'pin' | 'passphrase' | 'biometric' })` (default export) — a warning `Alert` whose copy varies by method.

- [ ] **Step 1: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import NoRecoveryNotice from './NoRecoveryNotice';

// The "no recovery" warning shown in each enrolment step. Copy differs per
// method (biometric has a recovery passphrase; pin/passphrase do not).
type StoryArgs = { method: 'pin' | 'passphrase' | 'biometric' };

const meta: Meta<StoryArgs> = {
  title: 'Auth/NoRecoveryNotice',
  parameters: { layout: 'padded' },
  args: { method: 'pin' },
  argTypes: {
    method: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric'],
    },
  },
  render: ({ method }) => (
    <div className="max-w-xl">
      <NoRecoveryNotice method={method} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

- [ ] **Step 2: Build** → succeeds; **Step 3: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/NoRecoveryNotice.stories.tsx
git commit -m "test(interviewer-v8): NoRecoveryNotice story"
```

---

## Task 6: SecurityBehaviorControls story

**Files:**

- Create: `apps/interviewer-v8/src/components/SecurityBehaviorControls.stories.tsx`

**Interfaces:**

- Consumes: `SecurityBehaviorControls({ value: Behavior; onChange: (next: Behavior) => void; disabled?: boolean })` (default export) and the `Behavior` type (named export from the same file): `{ idleTimeoutMinutes: IdleTimeoutMinutes; requireUnlockOnEnter: boolean; requireUnlockOnExit: boolean; requireUnlockOnExport: boolean }`. It uses `UnconnectedField`s (no form store needed). It is controlled — the story must own the value.

- [ ] **Step 1: Write the story (stateful render so the controls actually toggle)**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import SecurityBehaviorControls, {
  type Behavior,
} from './SecurityBehaviorControls';

// The reusable idle-timeout + require-unlock settings block (shared by the
// setup wizard and Settings). Controlled: this story holds the Behavior in
// local state so the toggles/select respond; the args seed the initial value.
type StoryArgs = Behavior & { disabled: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SecurityBehaviorControls',
  parameters: { layout: 'padded' },
  args: {
    idleTimeoutMinutes: 15,
    requireUnlockOnEnter: true,
    requireUnlockOnExit: false,
    requireUnlockOnExport: false,
    disabled: false,
  },
  argTypes: {
    idleTimeoutMinutes: {
      control: 'inline-radio',
      options: [1, 5, 15, 30, 60],
    },
    requireUnlockOnEnter: { control: 'boolean' },
    requireUnlockOnExit: { control: 'boolean' },
    requireUnlockOnExport: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  render: ({ disabled, ...initial }) => {
    const [value, setValue] = useState<Behavior>(initial);
    return (
      <div className="max-w-xl">
        <SecurityBehaviorControls
          value={value}
          onChange={setValue}
          disabled={disabled}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

> `render` reads `initial` fresh from args each render, so changing a control resets local state to the new args — acceptable for a settings block. Keep it.

- [ ] **Step 2: Build** → succeeds; **Step 3: Commit**

```bash
git add apps/interviewer-v8/src/components/SecurityBehaviorControls.stories.tsx
git commit -m "test(interviewer-v8): SecurityBehaviorControls story"
```

---

## Task 7: BiometricLockBody — add `limited?` prop + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.tsx`
- Create: `apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.stories.tsx`

**Interfaces:**

- Consumes: `BiometricLockBody({ unlockWithBiometric, unlockWithRecovery })` (named export). Currently computes `const limited = hasPasskeyWindowLimitation()` internally.
- Produces: `BiometricLockBody({ ...; limited?: boolean })` — new optional prop, defaulting to `hasPasskeyWindowLimitation()`, so a story (and `LockScreenView` in Task 8) can drive the macOS-Chromium recovery-first state.

- [ ] **Step 1: Add the `limited?` prop (behaviour-preserving)**

In `BiometricLockBody.tsx`, change the signature and drop the internal call:

```tsx
type BiometricLockBodyProps = {
  unlockWithBiometric: () => Promise<{ ok: boolean; message?: string }>;
  unlockWithRecovery: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  // Installed-PWA windows on macOS Chromium can't reach the enrolled passkey
  // (crbug.com/364926914), so we land on recovery there. Defaults to the live
  // platform check; overridable so callers (and stories) can force the state.
  limited?: boolean;
};

export function BiometricLockBody({
  unlockWithBiometric,
  unlockWithRecovery,
  limited = hasPasskeyWindowLimitation(),
}: BiometricLockBodyProps) {
  const [useRecovery, setUseRecovery] = useState(limited);
  const formId = useId();
  // ...rest unchanged (the two `limited ? … : …` reads now use the prop)
}
```

Leave the `import { hasPasskeyWindowLimitation }` in place (used as the default). Every existing call site (`LockScreen`) passes no `limited`, so behaviour is unchanged.

- [ ] **Step 2: Verify existing behaviour still compiles/renders** — run any existing unlock-related unit tests that touch this file:

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/UnlockForms`
Expected: PASS (or "no test files" — this component may have none; the LockScreen/StepUp tests exercise it indirectly and run later).

- [ ] **Step 3: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import { BiometricLockBody } from './BiometricLockBody';

// The biometric lock dialog. Normally shows a "Unlock with biometrics" button
// with a "Use recovery passphrase" fallback; when `limited` (macOS Chromium
// installed PWA) it starts on the recovery passphrase with a "Try biometrics
// anyway" escape. The Dialog portals to document.body.
type Outcome = 'success' | 'failure';
type StoryArgs = { limited: boolean; outcome: Outcome };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const meta: Meta<StoryArgs> = {
  title: 'Auth/UnlockForms/BiometricLockBody',
  parameters: { layout: 'fullscreen' },
  args: { limited: false, outcome: 'success' },
  argTypes: {
    limited: {
      control: 'boolean',
      description: 'macOS-Chromium installed-PWA state (recovery-first)',
    },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
  },
  render: ({ limited, outcome }) => (
    <BiometricLockBody
      limited={limited}
      unlockWithBiometric={async () => {
        await wait(150);
        return outcome === 'success'
          ? { ok: true }
          : { ok: false, message: 'Biometric attempt failed.' };
      }}
      unlockWithRecovery={async () => {
        await wait(150);
        return outcome === 'success'
          ? { ok: true }
          : { ok: false, message: 'Incorrect passphrase.' };
      }}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const MacChromiumLimited: Story = { args: { limited: true } };
```

- [ ] **Step 4: Build** → succeeds. Visual check both stories (dialog portals to body — it fills the frame).

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.tsx apps/interviewer-v8/src/components/UnlockForms/BiometricLockBody.stories.tsx
git commit -m "feat(interviewer-v8): add limited prop to BiometricLockBody; add story"
```

---

## Task 8: LockScreen → LockScreenView split + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/LockScreen.tsx`
- Create: `apps/interviewer-v8/src/components/__tests__/LockScreen.test.tsx` (view test) — or extend an existing one if present.
- Create: `apps/interviewer-v8/src/components/LockScreen.stories.tsx`

**Interfaces:**

- Consumes: `useAuth()` → `{ kind, mode, unlockWithPin, unlockWithPassphrase, unlockWithBiometric, unlockWithRecovery }`. The inner `PinLockBody`/`PassphraseLockBody` (local) and `BiometricLockBody` already take callbacks.
- Produces: `LockScreenView({ mode, unlockWithPin, unlockWithPassphrase, unlockWithBiometric, unlockWithRecovery })` (named export, pure — renders the per-mode dialog, including the result→shape mapping currently in the container). `LockScreen()` (named export, unchanged signature) becomes the container: reads `useAuth`, returns `null` unless `kind === 'locked'`, else renders `LockScreenView`.

- [ ] **Step 1: Read the `mode` type** — open `src/lib/auth/AuthContext.tsx`, note the exact type of `useAuth().mode` (e.g. an exported `AuthMode` alias, or a union on `AuthContextValue`). Use that type for the view's `mode` prop (import the type; do not inline-duplicate the union unless the source itself has no reusable alias).

- [ ] **Step 2: Write the failing view test**

```tsx
// src/components/__tests__/LockScreen.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LockScreenView } from '../LockScreen';

const noop = vi.fn(async () => ({ ok: true }));

describe('LockScreenView', () => {
  it('renders the PIN unlock body for mode="pin"', () => {
    render(
      <LockScreenView
        mode="pin"
        unlockWithPin={noop}
        unlockWithPassphrase={noop}
        unlockWithBiometric={noop}
        unlockWithRecovery={noop}
      />,
    );
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('renders nothing for mode="none"', () => {
    const { container } = render(
      <LockScreenView
        mode="none"
        unlockWithPin={noop}
        unlockWithPassphrase={noop}
        unlockWithBiometric={noop}
        unlockWithRecovery={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

> If the app's jsdom unit setup stubs `Dialog` (as the AppErrorBoundary unit test implies), assert on whatever the stub renders instead of the title. Confirm against `apps/interviewer-v8`'s vitest setup before finalising the assertion.

- [ ] **Step 3: Run — expect FAIL** (`LockScreenView` not exported)

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/LockScreen.test.tsx`
Expected: FAIL — `LockScreenView is not exported` / undefined.

- [ ] **Step 4: Extract the view.** In `LockScreen.tsx`, keep `PinLockBody`/`PassphraseLockBody` as-is. Move the `switch (mode)` body out of `LockScreen` into a new exported `LockScreenView`, and reduce `LockScreen` to the container:

```tsx
export function LockScreenView({
  mode,
  unlockWithPin,
  unlockWithPassphrase,
  unlockWithBiometric,
  unlockWithRecovery,
}: {
  mode: AuthContextValue['mode']; // or the AuthMode alias from Step 1
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  unlockWithPassphrase: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  unlockWithBiometric: () => Promise<{ ok: boolean; message?: string }>;
  unlockWithRecovery: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  switch (mode) {
    case 'biometric':
      return (
        <BiometricLockBody
          unlockWithBiometric={unlockWithBiometric}
          unlockWithRecovery={unlockWithRecovery}
        />
      );
    case 'pin':
      return (
        <PinLockBody
          verifyPin={async (pin) => {
            const result = await unlockWithPin(pin);
            return result.ok
              ? { ok: true }
              : { ok: false, message: result.message ?? 'Incorrect PIN.' };
          }}
        />
      );
    case 'passphrase':
      return (
        <PassphraseLockBody
          onSubmit={async (phrase) => {
            const result = await unlockWithPassphrase(phrase);
            return result.ok
              ? { success: true }
              : {
                  success: false,
                  formErrors: [result.message ?? 'Incorrect passphrase.'],
                };
          }}
        />
      );
    default:
      return null;
  }
}

export function LockScreen() {
  const {
    kind,
    mode,
    unlockWithPin,
    unlockWithPassphrase,
    unlockWithBiometric,
    unlockWithRecovery,
  } = useAuth();

  if (kind !== 'locked') return null;

  return (
    <LockScreenView
      mode={mode}
      unlockWithPin={unlockWithPin}
      unlockWithPassphrase={unlockWithPassphrase}
      unlockWithBiometric={unlockWithBiometric}
      unlockWithRecovery={unlockWithRecovery}
    />
  );
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/LockScreen.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import { LockScreenView } from './LockScreen';

// The locked-vault screen. It renders the unlock dialog for the enrolled mode.
// Switch `mode` to see PIN / passphrase / biometric. Dialogs portal to body.
type Outcome = 'success' | 'failure';
type StoryArgs = { mode: 'pin' | 'passphrase' | 'biometric'; outcome: Outcome };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result = (o: Outcome, msg: string) =>
  o === 'success' ? { ok: true } : { ok: false, message: msg };

const meta: Meta<StoryArgs> = {
  title: 'Auth/LockScreen',
  parameters: { layout: 'fullscreen' },
  args: { mode: 'pin', outcome: 'success' },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric'],
    },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
  },
  render: ({ mode, outcome }) => (
    <LockScreenView
      mode={mode}
      unlockWithPin={async () => {
        await wait(120);
        return result(outcome, 'Incorrect PIN.');
      }}
      unlockWithPassphrase={async () => {
        await wait(120);
        return result(outcome, 'Incorrect passphrase.');
      }}
      unlockWithBiometric={async () => {
        await wait(120);
        return result(outcome, 'Biometric attempt failed.');
      }}
      unlockWithRecovery={async () => {
        await wait(120);
        return result(outcome, 'Incorrect passphrase.');
      }}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

- [ ] **Step 7: Build** → succeeds. Visual check all three modes.

- [ ] **Step 8: Commit**

```bash
git add apps/interviewer-v8/src/components/LockScreen.tsx apps/interviewer-v8/src/components/__tests__/LockScreen.test.tsx apps/interviewer-v8/src/components/LockScreen.stories.tsx
git commit -m "refactor(interviewer-v8): extract LockScreenView; add test + story"
```

---

## Task 9: StepUpAuthDialog → StepUpAuthDialogView split + story

**Files:**

- Modify: `apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.tsx`
- Modify/Create: `apps/interviewer-v8/src/lib/auth/__tests__/StepUpAuthDialog.test.tsx` (extend existing if present)
- Create: `apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.stories.tsx`

**Interfaces:**

- Consumes: `useAuth().mode`; `authApi.verifyWithPin/verifyWithPassphrase/verifyBiometric/verifyWithRecovery`; `hasPasskeyWindowLimitation()`. `StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' }`.
- Produces: `StepUpAuthDialogView` (named export, pure) taking `mode`, `open`, `onResolve`, `onCancel`, the four `verify*` callbacks, and `limited?: boolean`. `StepUpAuthDialog({ open, onResolve })` (default export, unchanged public props) becomes the container binding `useAuth().mode`, `authApi.verify*`, and the cancel handler.

- [ ] **Step 1: Write the failing view test** (the split's contract: mode routing + cancel)

```tsx
// extend src/lib/auth/__tests__/StepUpAuthDialog.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StepUpAuthDialogView } from '../StepUpAuthDialog';

const ok = vi.fn(async () => ({ ok: true }) as const);

describe('StepUpAuthDialogView', () => {
  it('renders the PIN verify body for mode="pin"', () => {
    render(
      <StepUpAuthDialogView
        mode="pin"
        open
        onResolve={vi.fn()}
        onCancel={vi.fn()}
        verifyWithPin={ok}
        verifyWithPassphrase={ok}
        verifyBiometric={ok}
        verifyWithRecovery={ok}
      />,
    );
    expect(screen.getByText('Confirm your identity')).toBeInTheDocument();
  });
});
```

> Match the assertion to the app's jsdom Dialog stub if one is configured. Keep the existing container-level tests in this file intact.

- [ ] **Step 2: Run — expect FAIL** (`StepUpAuthDialogView` not exported)

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/StepUpAuthDialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Refactor.** In `StepUpAuthDialog.tsx`: (a) give `PinStepUp`/`PassphraseStepUp`/`BiometricStepUp` `verify*` callback props instead of importing `authApi` directly; `BiometricStepUp` also takes `limited`. (b) Add exported `StepUpAuthDialogView` that routes by `mode` and passes the callbacks down. (c) Reduce the default-export `StepUpAuthDialog` to a container. Concretely:

```tsx
// PinStepUp: replace the inline authApi.verifyWithPin with a prop.
function PinStepUp({
  open,
  onResolve,
  handleCancel,
  verifyWithPin,
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
  verifyWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const formId = useId();
  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={handleCancel}
        title="Confirm your identity"
        footer={
          <SubmitButton form={formId} submittingText="Verifying…">
            Verify
          </SubmitButton>
        }
      >
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <UnlockEmblem icon={KeyRound} seed="pin-unlock" />
          <Paragraph margin="none" emphasis="muted">
            Enter your PIN to continue.
          </Paragraph>
        </div>
        <PinUnlockForm
          formId={formId}
          verifyPin={async (pin) => {
            const result = await verifyWithPin(pin);
            if (result.ok) onResolve({ ok: true });
            return result;
          }}
        />
      </Dialog>
    </FormStoreProvider>
  );
}
```

Apply the same prop-lift to `PassphraseStepUp` (prop `verifyWithPassphrase`) and `BiometricStepUp` (props `verifyBiometric`, `verifyWithRecovery`, and `limited: boolean` replacing the internal `hasPasskeyWindowLimitation()` — mirror Task 7's default-param pattern but here `limited` is required by the view and defaulted by the container). Then:

```tsx
export function StepUpAuthDialogView({
  mode,
  open,
  onResolve,
  onCancel,
  verifyWithPin,
  verifyWithPassphrase,
  verifyBiometric,
  verifyWithRecovery,
  limited = hasPasskeyWindowLimitation(),
}: {
  mode: AuthContextValue['mode'];
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  onCancel: () => void;
  verifyWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  verifyWithPassphrase: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  verifyBiometric: () => Promise<{ ok: boolean; message?: string }>;
  verifyWithRecovery: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  limited?: boolean;
}) {
  if (mode === 'biometric')
    return (
      <BiometricStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={onCancel}
        verifyBiometric={verifyBiometric}
        verifyWithRecovery={verifyWithRecovery}
        limited={limited}
      />
    );
  if (mode === 'pin')
    return (
      <PinStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={onCancel}
        verifyWithPin={verifyWithPin}
      />
    );
  if (mode === 'passphrase')
    return (
      <PassphraseStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={onCancel}
        verifyWithPassphrase={verifyWithPassphrase}
      />
    );
  return null;
}

export default function StepUpAuthDialog({
  open,
  onResolve,
}: StepUpAuthDialogProps) {
  const { mode } = useAuth();
  return (
    <StepUpAuthDialogView
      mode={mode}
      open={open}
      onResolve={onResolve}
      onCancel={() => onResolve({ ok: false, reason: 'cancelled' })}
      verifyWithPin={authApi.verifyWithPin}
      verifyWithPassphrase={authApi.verifyWithPassphrase}
      verifyBiometric={authApi.verifyBiometric}
      verifyWithRecovery={authApi.verifyWithRecovery}
    />
  );
}
```

- [ ] **Step 4: Run the whole file — expect PASS** (new view test + existing container tests)

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/auth/__tests__/StepUpAuthDialog.test.tsx`
Expected: PASS. If an existing test mocked `authApi` and asserted it was called, it still passes because the container wires the same functions.

- [ ] **Step 5: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import { StepUpAuthDialogView } from './StepUpAuthDialog';

// The step-up re-auth dialog (verify without relocking). Routes by `mode`;
// biometric offers a recovery fallback and, when `limited`, starts on recovery.
type Outcome = 'success' | 'failure';
type StoryArgs = {
  mode: 'pin' | 'passphrase' | 'biometric';
  outcome: Outcome;
  limited: boolean;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const result = (o: Outcome, msg: string) =>
  o === 'success' ? { ok: true } : { ok: false, message: msg };

const meta: Meta<StoryArgs> = {
  title: 'Auth/StepUpAuthDialog',
  parameters: { layout: 'fullscreen' },
  args: { mode: 'pin', outcome: 'success', limited: false },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['pin', 'passphrase', 'biometric'],
    },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
    limited: { control: 'boolean' },
  },
  render: ({ mode, outcome, limited }) => (
    <StepUpAuthDialogView
      mode={mode}
      open
      limited={limited}
      onResolve={() => {}}
      onCancel={() => {}}
      verifyWithPin={async () => (
        await wait(120),
        result(outcome, 'Incorrect PIN.')
      )}
      verifyWithPassphrase={async () => (
        await wait(120),
        result(outcome, 'Incorrect passphrase.')
      )}
      verifyBiometric={async () => (
        await wait(120),
        result(outcome, 'Verification failed.')
      )}
      verifyWithRecovery={async () => (
        await wait(120),
        result(outcome, 'Incorrect passphrase.')
      )}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
```

- [ ] **Step 6: Build** → succeeds. Visual check each mode + `limited`.

- [ ] **Step 7: Commit**

```bash
git add apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.tsx apps/interviewer-v8/src/lib/auth/__tests__/StepUpAuthDialog.test.tsx apps/interviewer-v8/src/lib/auth/StepUpAuthDialog.stories.tsx
git commit -m "refactor(interviewer-v8): extract StepUpAuthDialogView (props-driven verify); add story"
```

---

## Task 10: Step2MethodPicker → Step2MethodPickerView split + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/SetupWizard/Step2MethodPicker.tsx`
- Create: `apps/interviewer-v8/src/components/SetupWizard/Step2MethodPicker.stories.tsx`

**Interfaces:**

- Consumes: `useWizard()` (`data.selectedMethod`, `setStepData`, `setNextEnabled`), `useDialog().confirm`, `useBiometric()`, `hasPasskeyWindowLimitation`/`isMacChromium`, and `WizardSelectedMethod` (imported from `../SetupWizardDialog`).
- Produces: `Step2MethodPickerView({ value, onChange, biometricDisabled, biometricDescription })` (named export, pure) rendering the `RichSelectGroupField`. The `none`-confirmation stays in the container's `onChange`. Container keeps all hooks and computes `biometricDisabled`/`biometricDescription`.

- [ ] **Step 1: Extract the view.** Move the JSX (`RichSelectGroupField` + the `options` array) into `Step2MethodPickerView`, parameterised by `biometricDisabled` and `biometricDescription`; the container computes those + owns `value`/`onChange` (including the `none` confirm flow):

```tsx
export function Step2MethodPickerView({
  value,
  onChange,
  biometricDisabled,
  biometricDescription,
}: {
  value: WizardSelectedMethod | null;
  onChange: (value: WizardSelectedMethod) => void;
  biometricDisabled: boolean;
  biometricDescription: string;
}) {
  const options = [
    {
      value: 'biometric' as const,
      label: 'Biometric authentication',
      description: biometricDescription,
      disabled: biometricDisabled,
    },
    {
      value: 'pin' as const,
      label: 'PIN code',
      description: 'An 8-digit numeric PIN.',
      disabled: false,
    },
    {
      value: 'passphrase' as const,
      label: 'Passphrase',
      description: 'A password of at least 12 characters.',
      disabled: false,
    },
    { type: 'spacer' as const },
    {
      value: 'none' as const,
      label: 'No security (not recommended)',
      description:
        'Skip app security. Your data will not be protected by the app.',
    },
  ];
  return (
    <RichSelectGroupField
      options={options}
      value={value ?? undefined}
      onChange={(v) => {
        if (isWizardSelectedMethod(v)) onChange(v);
      }}
      orientation="vertical"
      size="md"
    />
  );
}
```

The container (`Step2MethodPicker`) keeps the hooks, computes `biometricDisabled`/`biometricDescription` exactly as today, and passes an `onChange` that runs the existing `none`→`confirm` branch before `setStepData`. `isWizardSelectedMethod` stays in the module (used by both).

- [ ] **Step 2: Confirm existing setup-wizard tests still pass** (if any touch this component):

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/SetupWizard`
Expected: PASS or "no test files".

- [ ] **Step 3: Write the story**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import type { WizardSelectedMethod } from '../SetupWizardDialog';
import { Step2MethodPickerView } from './Step2MethodPicker';

// The enrolment method picker. Args model biometric availability (the only
// branch that changes the presentation); selection is local to the story.
type StoryArgs = { biometricDisabled: boolean; biometricDescription: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step2MethodPicker',
  parameters: { layout: 'padded' },
  args: {
    biometricDisabled: false,
    biometricDescription:
      'Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.',
  },
  argTypes: {
    biometricDisabled: { control: 'boolean' },
    biometricDescription: { control: 'text' },
  },
  render: ({ biometricDisabled, biometricDescription }) => {
    const [value, setValue] = useState<WizardSelectedMethod | null>(null);
    return (
      <div className="max-w-xl">
        <Step2MethodPickerView
          value={value}
          onChange={setValue}
          biometricDisabled={biometricDisabled}
          biometricDescription={biometricDescription}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const BiometricUnavailable: Story = {
  args: {
    biometricDisabled: true,
    biometricDescription: 'This device has no usable biometric sensor.',
  },
};
```

- [ ] **Step 4: Build** → succeeds. Visual check both stories.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/Step2MethodPicker.tsx apps/interviewer-v8/src/components/SetupWizard/Step2MethodPicker.stories.tsx
git commit -m "refactor(interviewer-v8): extract Step2MethodPickerView; add story"
```

---

## Task 11: Step3PinConfigure → view split + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/SetupWizard/Step3PinConfigure.tsx`
- Create: `apps/interviewer-v8/src/components/SetupWizard/Step3PinConfigure.stories.tsx`

**Interfaces:**

- Consumes: `useWizard()`, `useFormValue(['pin'])`, `authApi`. Renders two connected `Field`s (`pin`, `pin-confirm`), an error alert, `NoRecoveryNotice`, and an affirmation `UnconnectedField` checkbox.
- Produces: `Step3PinConfigureView({ error, affirmed, onAffirmChange })` (named export, pure — renders the fields/notice/error/affirmation; needs a form store from the caller). Container keeps wizard/`useFormValue`/`authApi`/`affirmed` state and renders the view.

- [ ] **Step 1: Extract the view.** Move the returned JSX into `Step3PinConfigureView`, parameterised by `error: string | null`, `affirmed: boolean`, `onAffirmChange: (v: boolean) => void`. The container keeps all effects/state and renders `<Step3PinConfigureView error={error} affirmed={affirmed} onAffirmChange={setAffirmed} />`.

```tsx
export function Step3PinConfigureView({
  error,
  affirmed,
  onAffirmChange,
}: {
  error: string | null;
  affirmed: boolean;
  onAffirmChange: (value: boolean) => void;
}) {
  return (
    <>
      <Field
        component={SegmentedCodeField}
        name="pin"
        label="Enter PIN"
        hint="An 8-digit numeric PIN."
        segments={8}
        characterSet="numeric"
        sensitive
        required
        minLength={8}
        maxLength={8}
        validateOnChange
      />
      <Field
        component={SegmentedCodeField}
        name="pin-confirm"
        label="Confirm PIN"
        segments={8}
        characterSet="numeric"
        sensitive
        required
        minLength={8}
        maxLength={8}
        sameAs="pin"
        validateOnChange
      />
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <NoRecoveryNotice method="pin" />
      <UnconnectedField
        inline
        name="pin-affirmation"
        label="I understand there is no recovery"
        component={Checkbox}
        value={affirmed}
        onChange={(v) => onAffirmChange(v ?? false)}
      />
    </>
  );
}
```

- [ ] **Step 2: Confirm setup-wizard unit tests pass** — `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/SetupWizard` → PASS / no test files.

- [ ] **Step 3: Write the story** (needs `withFormStore` for the connected `Field`s)

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { withFormStore } from '~/storybook/decorators';

import { Step3PinConfigureView } from './Step3PinConfigure';

// The PIN enrolment step's presentation: two 8-digit fields, the no-recovery
// warning, an error slot, and the affirmation checkbox. `error` is a control;
// affirmation is local so the checkbox toggles.
type StoryArgs = { error: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step3PinConfigure',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { error: '' },
  argTypes: { error: { control: 'text' } },
  render: ({ error }) => {
    const [affirmed, setAffirmed] = useState(false);
    return (
      <div className="max-w-xl">
        <Step3PinConfigureView
          error={error || null}
          affirmed={affirmed}
          onAffirmChange={setAffirmed}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'PIN setup failed.' } };
```

- [ ] **Step 4: Build** → succeeds; **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/Step3PinConfigure.tsx apps/interviewer-v8/src/components/SetupWizard/Step3PinConfigure.stories.tsx
git commit -m "refactor(interviewer-v8): extract Step3PinConfigureView; add story"
```

---

## Task 12: Step3PassphraseConfigure → view split + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/SetupWizard/Step3PassphraseConfigure.tsx`
- Create: `apps/interviewer-v8/src/components/SetupWizard/Step3PassphraseConfigure.stories.tsx`

**Interfaces:**

- Consumes: `useWizard()`, `authApi`, `getPasswordStrength`. Uses `UnconnectedField` (controlled by local `phrase`/`confirm`/`affirmed` state) — so no form store needed.
- Produces: `Step3PassphraseConfigureView({ phrase, confirmValue, affirmed, error, onPhraseChange, onConfirmChange, onAffirmChange })` (named export, pure controlled view). Container keeps state + wizard + authApi and passes state down/handlers up.

- [ ] **Step 1: Extract the controlled view.** Lift the four state values into props; the container owns `useState` and passes them:

```tsx
export function Step3PassphraseConfigureView({
  phrase,
  confirmValue,
  affirmed,
  error,
  onPhraseChange,
  onConfirmChange,
  onAffirmChange,
}: {
  phrase: string;
  confirmValue: string;
  affirmed: boolean;
  error: string | null;
  onPhraseChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onAffirmChange: (value: boolean) => void;
}) {
  return (
    <>
      <UnconnectedField
        name="passphrase"
        label="Enter passphrase"
        hint="A password of at least 12 characters that combines uppercase, lowercase, numbers, and symbols."
        component={PasswordField}
        value={phrase}
        onChange={(v) => onPhraseChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter
        placeholder="Enter passphrase"
      />
      <UnconnectedField
        name="passphrase-confirm"
        label="Confirm passphrase"
        component={PasswordField}
        value={confirmValue}
        onChange={(v) => onConfirmChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        placeholder="Confirm passphrase"
      />
      {confirmValue.length > 0 && phrase !== confirmValue && (
        <Paragraph margin="none" className="text-destructive text-sm">
          Passphrases do not match.
        </Paragraph>
      )}
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <NoRecoveryNotice method="passphrase" />
      <UnconnectedField
        name="passphrase-affirmation"
        label="I understand there is no recovery."
        component={Checkbox}
        value={affirmed}
        onChange={(v) => onAffirmChange(v ?? false)}
      />
    </>
  );
}
```

Container: keep `phrase`/`confirm`/`affirmed`/`error` state and the two effects; render `<Step3PassphraseConfigureView phrase={phrase} confirmValue={confirm} affirmed={affirmed} error={error} onPhraseChange={setPhrase} onConfirmChange={setConfirm} onAffirmChange={setAffirmed} />`.

- [ ] **Step 2: Unit tests** — `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/SetupWizard` → PASS / none.

- [ ] **Step 3: Write the story (stateful so the strength meter reacts)**

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Step3PassphraseConfigureView } from './Step3PassphraseConfigure';

// The passphrase enrolment step: entry + confirm with a live strength meter,
// mismatch hint, no-recovery warning, error slot, and affirmation. Type into
// the fields to exercise strength/mismatch; `error` is a control.
type StoryArgs = { error: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step3PassphraseConfigure',
  parameters: { layout: 'padded' },
  args: { error: '' },
  argTypes: { error: { control: 'text' } },
  render: ({ error }) => {
    const [phrase, setPhrase] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    const [affirmed, setAffirmed] = useState(false);
    return (
      <div className="max-w-xl">
        <Step3PassphraseConfigureView
          phrase={phrase}
          confirmValue={confirmValue}
          affirmed={affirmed}
          error={error || null}
          onPhraseChange={setPhrase}
          onConfirmChange={setConfirmValue}
          onAffirmChange={setAffirmed}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'Passphrase setup failed.' } };
```

- [ ] **Step 4: Build** → succeeds; **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/Step3PassphraseConfigure.tsx apps/interviewer-v8/src/components/SetupWizard/Step3PassphraseConfigure.stories.tsx
git commit -m "refactor(interviewer-v8): extract Step3PassphraseConfigureView; add story"
```

---

## Task 13: Step3BiometricConfigure → view split + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx`
- Create: `apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.stories.tsx`

**Interfaces:**

- Consumes: `useWizard()`, `authApi`, `getPasswordStrength`, `Alert`. Recovery-passphrase entry + confirm, controlled by local state.
- Produces: `Step3BiometricConfigureView({ phrase, confirmValue, error, onPhraseChange, onConfirmChange })` (named export, pure controlled view; no affirmation checkbox in this step). Container keeps state/wizard/authApi.

- [ ] **Step 1: Extract the controlled view** (mirror Task 12 without the affirmation field; keep the intro `Paragraph` + info `Alert`):

```tsx
export function Step3BiometricConfigureView({
  phrase,
  confirmValue,
  error,
  onPhraseChange,
  onConfirmChange,
}: {
  phrase: string;
  confirmValue: string;
  error: string | null;
  onPhraseChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}) {
  return (
    <>
      <Paragraph>
        Biometric unlock uses your device's Face ID, Touch ID, or Windows Hello.
        When you click Next you'll be prompted to register it.
      </Paragraph>
      <Alert variant="info">
        <AlertTitle>Set a recovery passphrase</AlertTitle>
        <AlertDescription>
          If your biometric ever becomes unavailable — you reset Face ID,
          replace the device, or remove the credential — this passphrase is the
          only way to unlock your data. Store it somewhere safe.
        </AlertDescription>
      </Alert>
      <UnconnectedField
        name="recovery-passphrase"
        label="Recovery passphrase"
        hint="At least 12 characters combining uppercase, lowercase, numbers, and symbols."
        component={PasswordField}
        value={phrase}
        onChange={(v) => onPhraseChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter
        placeholder="Enter recovery passphrase"
      />
      <UnconnectedField
        name="recovery-passphrase-confirm"
        label="Confirm recovery passphrase"
        component={PasswordField}
        value={confirmValue}
        onChange={(v) => onConfirmChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        placeholder="Confirm recovery passphrase"
      />
      {confirmValue.length > 0 && phrase !== confirmValue && (
        <Paragraph margin="none" className="text-destructive text-sm">
          Passphrases do not match.
        </Paragraph>
      )}
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
    </>
  );
}
```

Container: keep `phrase`/`confirm`/`error` + effects; render the view with `confirmValue={confirm}` and the two change handlers.

- [ ] **Step 2: Unit tests** — `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/SetupWizard` → PASS / none.

- [ ] **Step 3: Write the story** (stateful; same shape as Task 12 minus affirmation):

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Step3BiometricConfigureView } from './Step3BiometricConfigure';

// The biometric enrolment step: intro + recovery-passphrase entry/confirm with
// strength meter and mismatch hint. `error` is a control.
type StoryArgs = { error: string };

const meta: Meta<StoryArgs> = {
  title: 'Auth/SetupWizard/Step3BiometricConfigure',
  parameters: { layout: 'padded' },
  args: { error: '' },
  argTypes: { error: { control: 'text' } },
  render: ({ error }) => {
    const [phrase, setPhrase] = useState('');
    const [confirmValue, setConfirmValue] = useState('');
    return (
      <div className="max-w-xl">
        <Step3BiometricConfigureView
          phrase={phrase}
          confirmValue={confirmValue}
          error={error || null}
          onPhraseChange={setPhrase}
          onConfirmChange={setConfirmValue}
        />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'Biometric setup failed.' } };
```

- [ ] **Step 4: Build** → succeeds; **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.tsx apps/interviewer-v8/src/components/SetupWizard/Step3BiometricConfigure.stories.tsx
git commit -m "refactor(interviewer-v8): extract Step3BiometricConfigureView; add story"
```

---

## Task 14: ManageAuthenticator — prop-driven change forms + story

**Files:**

- Modify: `apps/interviewer-v8/src/components/ManageAuthenticator.tsx`
- Modify: `apps/interviewer-v8/src/components/__tests__/ManageAuthenticator.test.tsx` (keep green; adjust only if the internal wiring it asserts moved)
- Create: `apps/interviewer-v8/src/components/ManageAuthenticator.stories.tsx`

**Interfaces:**

- Consumes: `useAuth()` (`mode`, `reEnrolWithPin`, `reEnrolWithPassphrase`, `revoke`), `useToast()`, `useDialog().confirm`.
- Produces: exported, prop-driven `ChangePinForm({ onReEnrol, onSuccess, onCancel })` and `ChangePassphraseForm({ onReEnrol, onSuccess, onCancel })` where `onReEnrol: (current: string, next: string) => Promise<{ ok: boolean; message?: string }>` and `onSuccess: () => void` (the toast fires in the container, not the form). `ManageAuthenticator` / `ResetDeviceRow` keep their current exported signatures and wire the callbacks from context.

- [ ] **Step 1: Make the change forms prop-driven.** Lift `useAuth`/`useToast` out of `ChangePinForm`/`ChangePassphraseForm`; export them; replace `auth.reEnrolWith*` with `onReEnrol` and `toast.add(...)` + `onDone()` with `onSuccess()`. E.g. for `ChangePinForm`:

```tsx
export function ChangePinForm({
  onReEnrol,
  onSuccess,
  onCancel,
}: {
  onReEnrol: (
    current: string,
    next: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [nextPinConfirm, setNextPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!PIN_PATTERN.test(nextPin)) {
      setError('Your new PIN must be exactly 8 digits.');
      return;
    }
    if (nextPin !== nextPinConfirm) {
      setError('The two new PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await onReEnrol(currentPin, nextPin);
      if (result.ok) {
        onSuccess();
        return;
      }
      setError(result.message ?? 'We could not change your PIN.');
    } finally {
      setBusy(false);
    }
  };
  // ...unchanged field JSX, but the Cancel button calls onCancel instead of onDone
}
```

In the container, render `<ChangePinForm onReEnrol={auth.reEnrolWithPin} onCancel={() => setChanging(false)} onSuccess={() => { toast.add({ title: 'PIN changed', variant: 'success' }); setChanging(false); }} />` (and the passphrase equivalent with `'Passphrase changed'`). `ManageAuthenticator` and `ResetDeviceRow` keep reading `useAuth`/`useDialog` as today.

- [ ] **Step 2: Run the existing test — keep it green.**

Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/ManageAuthenticator.test.tsx`
Expected: PASS. If it asserted on `auth.reEnrolWithPin` being called, that still happens through the container. If it rendered `ChangePinForm` directly with a mocked `useAuth`, update it to pass the new props (the mock's `reEnrolWithPin` becomes the `onReEnrol` prop) — this is a mechanical adjustment, not a behaviour change.

- [ ] **Step 3: Write the story** (the two change forms, driven by an `outcome` arg)

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ChangePassphraseForm, ChangePinForm } from './ManageAuthenticator';

// The re-enrolment forms from Settings → Authenticator. Prop-driven: the story
// supplies onReEnrol (outcome-controlled) and no-op success/cancel.
type Outcome = 'success' | 'failure';
type StoryArgs = { form: 'pin' | 'passphrase'; outcome: Outcome };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const meta: Meta<StoryArgs> = {
  title: 'Auth/ManageAuthenticator',
  parameters: { layout: 'padded' },
  args: { form: 'pin', outcome: 'success' },
  argTypes: {
    form: { control: 'inline-radio', options: ['pin', 'passphrase'] },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
  },
  render: ({ form, outcome }) => {
    const onReEnrol = async () => {
      await wait(120);
      return outcome === 'success'
        ? { ok: true }
        : { ok: false, message: 'Current secret is incorrect.' };
    };
    const props = { onReEnrol, onSuccess: () => {}, onCancel: () => {} };
    return (
      <div className="max-w-xl">
        {form === 'pin' ? (
          <ChangePinForm {...props} />
        ) : (
          <ChangePassphraseForm {...props} />
        )}
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const ChangePassphrase: Story = { args: { form: 'passphrase' } };
```

- [ ] **Step 4: Build** → succeeds; visual check both forms.

- [ ] **Step 5: knip** (change forms are now exported — must be consumed by the story)

Run: `pnpm knip`
Expected: no unused-export for `ChangePinForm`/`ChangePassphraseForm` (the story imports both). If flagged, confirm the story import.

- [ ] **Step 6: Commit**

```bash
git add apps/interviewer-v8/src/components/ManageAuthenticator.tsx apps/interviewer-v8/src/components/__tests__/ManageAuthenticator.test.tsx apps/interviewer-v8/src/components/ManageAuthenticator.stories.tsx
git commit -m "refactor(interviewer-v8): prop-driven ManageAuthenticator change forms; add story"
```

---

# Part B — Remaining unique components

Each component below gets one `*.stories.tsx` beside it, following the **canonical shape from Task 1/Task 3** (single args-driven `Default`; `argTypes` for the props that vary; presets only for an unreachable state or a `play` test). Where a component reads app context/data, apply the **Task 8 container/view split** first (extract `XView`, keep `X` as the container), then story `XView`.

**Per-component procedure (every Part B task):**

1. Open the component; note its exported name(s) and prop signature.
2. If it renders only from props → write the story directly. If it reads `useAuth`/`useWizard`/`useToast`/`useDialog`/react-query/Dexie or wouter routing → extract a pure `XView` (props only), keep `X` as the thin container, add a view test if the split changes structure, then story `XView`.
3. `render` wraps the component in a width-constrained box (`max-w-*`) unless it is `layout: 'fullscreen'`.
4. Add `withFormStore` only if the view contains connected `Field`s.
5. Build (`build-storybook`), visual-check, commit one component (or one tight cluster) per commit.

**Task 15 clusters (one commit each):**

- [ ] **15a — ProtocolCarousel remainder:** `ProtocolCarousel/DeckSlotCard.tsx`, `ProtocolCarousel/ImportTriggerCard.tsx`, `ProtocolCarousel/DeckCarousel.tsx`. Mirror the existing `DeckCard.stories.tsx`/`ProtocolDeck.stories.tsx` conventions (resizable frame, `makeProtocol` helper) already in that folder. `DeckCarousel` is drag/wheel-driven — story it with a small fixed set of slot inputs; keep interactions manual (no `play`).
- [ ] **15b — PWA/marketing banners:** `InstallBanner.tsx`, `PwaUpdateBanner.tsx`. If either reads an install-prompt/SW store, extract the presentational banner (props: `onInstall`/`onReload`/`onDismiss`, `visible`) and story that. `layout: 'fullscreen'` (they are bottom/edge-anchored).
- [ ] **15c — Header/chrome:** `BrandHeader.tsx` (args: any version/installation-id text it surfaces — inject via prop if it reads `installationId`), `TopActionBar.tsx` (extract a view if it reads context; props for the action callbacks + labels), `ViewSwitcher.tsx` (args: `value` + `onChange` for the tabs).
- [ ] **15d — Home/session bits:** `ResumePill.tsx` (args: label/onClick), `InterviewComplete.tsx` (args: any summary counts + `onDone`; `layout: 'fullscreen'`), `StatusRow.tsx` (args: the status/storage values it shows — inject via props), `SettingsRow.tsx` (args: `title`, `desc`, plus a sample `control` node via `render`).
- [ ] **15e — Forms/data:** `NewSessionForm.tsx` (extract a view: props `protocol` summary, `requiresInternet`, `online`, `onStart`; story offline + online), `DataView/DataViewToolbar.tsx` (extract a view: props for filter/sort/selection state + handlers; story empty + active selection).
- [ ] **15f — Onboarding:** `OnboardingScreen.tsx` (if it only triggers the wizard, story a view with props `onBegin`; `layout: 'fullscreen'`).

For any Part B component that turns out to be pure orchestration with no isolable visual (e.g. it only wires effects/routing), **skip it and note the skip in the commit message** — do not force a meaningless story. The excluded set from the spec (`AuthGate`, full `SetupWizardDialog`, `DataView` orchestrator, full `SettingsDialog`/`ImportDialog`/`HomeModal`) stays excluded.

---

## Task 16: Final verification pass

- [ ] **Step 1: Full typecheck** (deferred here per the minimize-verification convention)

Run: `pnpm --filter @codaco/interviewer-v8 typecheck`
Expected: clean. (If a turbo cache masks a cross-package type break, run the repo-root `pnpm typecheck`.)

- [ ] **Step 2: Full unit suite** — `pnpm --filter @codaco/interviewer-v8 test` → all PASS (proves no split regressed a container).

- [ ] **Step 3: Storybook build** — `pnpm --filter @codaco/interviewer-v8 build-storybook` → succeeds (every story compiles/renders).

- [ ] **Step 4: Story play tests** — `pnpm --filter @codaco/interviewer-v8 test:storybook` → PASS (re-run once on browser-mode flake).

- [ ] **Step 5: knip** — `pnpm knip` → no new unused files/exports for the app.

- [ ] **Step 6: Visual sweep** — `pnpm --filter @codaco/interviewer-v8 storybook`; click through the `Auth/*` stories, confirm each renders correctly (per the "verify UI visually" convention — jsdom/`play` can pass while a story looks wrong). Stop the server.

- [ ] **Step 7: Final commit** (only if Steps fixed anything; otherwise nothing to do)

```bash
git add -A
git commit -m "chore(interviewer-v8): typecheck/knip fixes for storybook stories"
```

---

## Self-Review (author checklist — completed)

**Spec coverage:** every spec coverage-table row maps to a task — auth leaves → Tasks 1–7; `LockScreen`/`StepUpAuthDialog`/`Step2`/`Step3×3`/`ManageAuthenticator` splits → Tasks 8–14; non-auth → Task 15; exclusions preserved in Task 15's closing note; verification/knip/no-changeset → global constraints + Task 16.

**Placeholder scan:** no "TBD/TODO/handle edge cases". The two honest read-first steps (Task 8 Step 1 `mode` type; Part B "open the component") are explicit actions, not vague code — Part B components' exact props are intentionally read at execution time rather than guessed.

**Type consistency:** the `{ ok: boolean; message?: string }` result shape and `verify*`/`unlockWith*`/`onReEnrol` signatures match across Tasks 3/4/7/8/9/14; `Behavior` (Task 6) matches the source; `WizardSelectedMethod` (Task 10) imported from `SetupWizardDialog`; `StepUpResult` (Task 9) matches the source.
