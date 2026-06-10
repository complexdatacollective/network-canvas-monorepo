# Interview-flow unlock gates + secured finish flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified "unlock on entering an interview" gate, a new "unlock on exiting an interview" gate, and replace the auto-redirect after finishing with a terminal, secured "Interview complete" screen — all configurable from the shared security-behavior control used by both the onboarding wizard and Settings.

**Architecture:** All changes live in `apps/interviewer-v7`; the shared `@codaco/interview` `Shell` is untouched. Settings gain a renamed field (`requireUnlockOnResume` → `requireUnlockOnEnter`) and a new `requireUnlockOnExit`, both stored in the existing JSON settings blob (no SQL migration). `InterviewRoute` reads these to gate entry, exit, and to render an app-level `InterviewComplete` screen after finishing.

**Tech Stack:** React 19, wouter, `@codaco/fresco-ui`, Vitest + jsdom, and (newly added) `@testing-library/react` + `@testing-library/jest-dom`.

**Spec:** `docs/superpowers/specs/2026-06-08-interview-flow-unlock-gates-design.md`

---

## File structure

| File                                                               | Responsibility                                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `apps/interviewer-v7/package.json`                                 | Add `@testing-library/react` + `@testing-library/jest-dom` devDeps.             |
| `apps/interviewer-v7/src/test-setup.ts`                            | Register jest-dom matchers + RTL auto-cleanup.                                  |
| `apps/interviewer-v7/src/lib/db/types.ts`                          | `StoredSettings` + `DEFAULT_SETTINGS`: rename field, add `requireUnlockOnExit`. |
| `apps/interviewer-v7/electron/db/service.ts`                       | Main-process `DEFAULT_SETTINGS`: same rename + add.                             |
| `apps/interviewer-v7/src/components/SecurityBehaviorControls.tsx`  | `Behavior` type + the rendered enter/exit/export toggles.                       |
| `apps/interviewer-v7/src/components/SetupWizard/Step4Behavior.tsx` | Wizard step default + normalization for the renamed/new field.                  |
| `apps/interviewer-v7/src/components/SetupWizardDialog.tsx`         | Wizard behavior type/default + the `updateSettings` persistence call.           |
| `apps/interviewer-v7/src/components/SettingsDialog.tsx`            | Settings behavior object + change handler.                                      |
| `apps/interviewer-v7/src/components/InterviewComplete.tsx`         | NEW — terminal post-finish screen with a single gated exit.                     |
| `apps/interviewer-v7/src/routes/Interview.tsx`                     | Unified enter gate, gated exit handler, finish → complete, finished-on-load.    |
| `apps/interviewer-v7/src/routes/Home.tsx`                          | Drop the now-dead `{ state: { fresh: true } }` argument.                        |
| `apps/interviewer-v7/README.md`, `apps/interviewer-v7/CLAUDE.md`   | Document the gates + finish flow.                                               |

All commands below run from `apps/interviewer-v7/` unless noted. Use `pnpm test -- <path>` to run a single test file; `pnpm typecheck` and `pnpm lint` from the repo root cover this app.

---

## Task 1: Add React Testing Library + configure test setup

**Files:**

- Modify: `apps/interviewer-v7/package.json`
- Modify: `apps/interviewer-v7/src/test-setup.ts`

- [ ] **Step 1: Add the devDependencies**

In `apps/interviewer-v7/package.json`, add these two entries to `devDependencies` (mirror the versions already used by `apps/architect-web`):

```jsonc
"@testing-library/jest-dom": "^6.9.1",
"@testing-library/react": "^16.3.2",
```

- [ ] **Step 2: Install**

Run (from repo root): `pnpm install`
Expected: lockfile updates, both packages resolve. If pnpm reports a missing peer `@testing-library/dom`, it is auto-installed (pnpm `auto-install-peers` default); no action needed.

- [ ] **Step 3: Wire up jest-dom matchers + RTL cleanup**

Replace the top of `src/test-setup.ts` so it keeps the existing Capacitor mock and adds matchers + cleanup. The full file becomes:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// The @aparajita/capacitor-biometric-auth ESM build re-exports from './definitions'
// without the .js extension, which Node ESM refuses to resolve in jsdom test mode.
// Tests that exercise Capacitor-only code paths should override this mock with
// platform-specific behaviour (see biometricNative.test.ts for an example).
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: vi.fn(),
    authenticate: vi.fn(),
  },
  BiometryErrorType: {
    none: '',
    biometryNotAvailable: 'biometryNotAvailable',
    biometryNotEnrolled: 'biometryNotEnrolled',
    passcodeNotSet: 'passcodeNotSet',
    noDeviceCredential: 'noDeviceCredential',
    userCancel: 'userCancel',
  },
}));
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `pnpm test`
Expected: PASS — the existing auth/protocol tests are unaffected; the new setup imports resolve.

- [ ] **Step 5: Commit**

```bash
# from repo root:
git add apps/interviewer-v7/package.json apps/interviewer-v7/src/test-setup.ts pnpm-lock.yaml
git commit -m "test(interviewer-v7): add React Testing Library + jest-dom setup"
```

---

## Task 2: Settings model + shared toggle UI (rename + new gate)

Renames `requireUnlockOnResume` → `requireUnlockOnEnter` and adds `requireUnlockOnExit` across the type/defaults layer, the shared control, and all its consumers in one cohesive change so `pnpm typecheck` stays green. `Interview.tsx` only gets the field renamed here (its gate logic is rewritten in Task 4).

**Files:**

- Test: `apps/interviewer-v7/src/lib/db/__tests__/defaultSettings.test.ts` (create)
- Test: `apps/interviewer-v7/src/components/__tests__/SecurityBehaviorControls.test.tsx` (create)
- Modify: `src/lib/db/types.ts`, `electron/db/service.ts`, `src/components/SecurityBehaviorControls.tsx`, `src/components/SetupWizard/Step4Behavior.tsx`, `src/components/SetupWizardDialog.tsx`, `src/components/SettingsDialog.tsx`, `src/routes/Interview.tsx`

- [ ] **Step 1: Write the failing defaults test**

Create `src/lib/db/__tests__/defaultSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../types';

describe('DEFAULT_SETTINGS security gates', () => {
  it('uses the unified enter gate (on) and exit gate (off)', () => {
    expect(DEFAULT_SETTINGS.requireUnlockOnEnter).toBe(true);
    expect(DEFAULT_SETTINGS.requireUnlockOnExit).toBe(false);
    expect(DEFAULT_SETTINGS.requireUnlockOnExport).toBe(false);
    expect('requireUnlockOnResume' in DEFAULT_SETTINGS).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing control test**

Create `src/components/__tests__/SecurityBehaviorControls.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SecurityBehaviorControls, {
  type Behavior,
} from '../SecurityBehaviorControls';

const baseValue: Behavior = {
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
};

describe('SecurityBehaviorControls', () => {
  it('renders the three unlock toggles', () => {
    render(<SecurityBehaviorControls value={baseValue} onChange={vi.fn()} />);
    expect(
      screen.getByText('Require unlock when entering an interview'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Require unlock when exiting an interview'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Require unlock before exporting data'),
    ).toBeInTheDocument();
  });

  it('emits requireUnlockOnExit when the exit toggle is switched on', () => {
    const onChange = vi.fn();
    render(<SecurityBehaviorControls value={baseValue} onChange={onChange} />);
    // Toggle order: enter, exit, export (idle timeout is a Select, not a switch).
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]);
    expect(onChange).toHaveBeenCalledWith({
      ...baseValue,
      requireUnlockOnExit: true,
    });
  });
});
```

> Note: `ToggleField` (fresco-ui) renders `role="switch"`. If `getAllByRole('switch')` finds none, open `@codaco/fresco-ui/form/fields/ToggleField` to confirm the role and adjust the query.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm test -- src/lib/db/__tests__/defaultSettings.test.ts src/components/__tests__/SecurityBehaviorControls.test.tsx`
Expected: FAIL — `DEFAULT_SETTINGS.requireUnlockOnEnter` is undefined and the control still renders the old "resuming" label / lacks the exit toggle (and the `Behavior` import won't type-check the new fields).

- [ ] **Step 4: Update `src/lib/db/types.ts`**

In `StoredSettings`, replace the `requireUnlockOnResume` line and add the exit field:

```ts
idleTimeoutMinutes: IdleTimeoutMinutes;
requireUnlockOnEnter: boolean;
requireUnlockOnExit: boolean;
requireUnlockOnExport: boolean;
```

In `DEFAULT_SETTINGS`, replace the corresponding lines:

```ts
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
```

- [ ] **Step 5: Update `electron/db/service.ts`**

In the main-process `DEFAULT_SETTINGS` constant, replace the two gate lines with three:

```ts
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
```

- [ ] **Step 6: Update `src/components/SecurityBehaviorControls.tsx`**

Replace the `Behavior` type:

```ts
export type Behavior = {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnEnter: boolean;
  requireUnlockOnExit: boolean;
  requireUnlockOnExport: boolean;
};
```

Replace the single `requireUnlockOnResume` field block with two field blocks (entering + exiting), keeping the export field below them:

```tsx
      <UnconnectedField
        name="requireUnlockOnEnter"
        label="Require unlock when entering an interview"
        inline
        component={ToggleField}
        value={value.requireUnlockOnEnter}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnEnter: v === true })
        }
      />
      <UnconnectedField
        name="requireUnlockOnExit"
        label="Require unlock when exiting an interview"
        inline
        component={ToggleField}
        value={value.requireUnlockOnExit}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnExit: v === true })
        }
      />
      <UnconnectedField
        name="requireUnlockOnExport"
        label="Require unlock before exporting data"
        inline
        component={ToggleField}
        value={value.requireUnlockOnExport}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnExport: v === true })
        }
      />
```

- [ ] **Step 7: Update `src/components/SetupWizard/Step4Behavior.tsx`**

In `DEFAULT_BEHAVIOR`:

```ts
const DEFAULT_BEHAVIOR: Behavior = {
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
};
```

In `asBehavior`, replace the `requireUnlockOnResume` branch and add the exit branch:

```ts
return {
  idleTimeoutMinutes,
  requireUnlockOnEnter:
    typeof obj.requireUnlockOnEnter === 'boolean'
      ? obj.requireUnlockOnEnter
      : DEFAULT_BEHAVIOR.requireUnlockOnEnter,
  requireUnlockOnExit:
    typeof obj.requireUnlockOnExit === 'boolean'
      ? obj.requireUnlockOnExit
      : DEFAULT_BEHAVIOR.requireUnlockOnExit,
  requireUnlockOnExport:
    typeof obj.requireUnlockOnExport === 'boolean'
      ? obj.requireUnlockOnExport
      : DEFAULT_BEHAVIOR.requireUnlockOnExport,
};
```

- [ ] **Step 8: Update `src/components/SetupWizardDialog.tsx`**

In `SetupWizardData['behavior']`:

```ts
behavior: {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnEnter: boolean;
  requireUnlockOnExit: boolean;
  requireUnlockOnExport: boolean;
}
```

In `DEFAULT_BEHAVIOR`:

```ts
const DEFAULT_BEHAVIOR: SetupWizardData['behavior'] = {
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
};
```

In the `updateSettings` call inside `openSetupWizard`, persist all three gates:

```ts
await updateSettings({
  idleTimeoutMinutes: behavior.idleTimeoutMinutes,
  requireUnlockOnEnter: behavior.requireUnlockOnEnter,
  requireUnlockOnExit: behavior.requireUnlockOnExit,
  requireUnlockOnExport: behavior.requireUnlockOnExport,
});
```

- [ ] **Step 9: Update `src/components/SettingsDialog.tsx`**

In the `behavior` object:

```ts
const behavior: Behavior = {
  idleTimeoutMinutes: auth.idleTimeoutMinutes,
  requireUnlockOnEnter: settings?.requireUnlockOnEnter ?? true,
  requireUnlockOnExit: settings?.requireUnlockOnExit ?? false,
  requireUnlockOnExport: settings?.requireUnlockOnExport ?? false,
};
```

In `handleBehaviorChange`, replace the resume diff with enter + exit diffs:

```ts
const patch: Partial<Omit<StoredSettings, 'id'>> = {};
if (next.requireUnlockOnEnter !== settings.requireUnlockOnEnter) {
  patch.requireUnlockOnEnter = next.requireUnlockOnEnter;
}
if (next.requireUnlockOnExit !== settings.requireUnlockOnExit) {
  patch.requireUnlockOnExit = next.requireUnlockOnExit;
}
if (next.requireUnlockOnExport !== settings.requireUnlockOnExport) {
  patch.requireUnlockOnExport = next.requireUnlockOnExport;
}
```

- [ ] **Step 10: Update `src/routes/Interview.tsx` (field rename only)**

In the load effect, rename the gate field but keep the existing `!isFreshSession` logic for now (rewritten in Task 4):

```ts
      if (!isFreshSession && settings.requireUnlockOnEnter) {
```

- [ ] **Step 11: Run the tests + typecheck**

Run: `pnpm test -- src/lib/db/__tests__/defaultSettings.test.ts src/components/__tests__/SecurityBehaviorControls.test.tsx`
Expected: PASS

Run (repo root): `pnpm typecheck`
Expected: PASS — no remaining references to `requireUnlockOnResume`.

- [ ] **Step 12: Lint-fix + commit**

```bash
# from repo root:
pnpm lint:fix
git add apps/interviewer-v7/src apps/interviewer-v7/electron
git commit -m "feat(interviewer-v7): unify enter gate + add exit-unlock setting"
```

---

## Task 3: `InterviewComplete` terminal screen

**Files:**

- Create: `apps/interviewer-v7/src/components/InterviewComplete.tsx`
- Test: `apps/interviewer-v7/src/components/__tests__/InterviewComplete.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/InterviewComplete.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InterviewComplete } from '../InterviewComplete';

describe('InterviewComplete', () => {
  it('renders the completion heading and exit button', () => {
    render(<InterviewComplete onExit={vi.fn()} />);
    expect(screen.getByText('Interview complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument();
  });

  it('calls onExit when the exit button is clicked', () => {
    const onExit = vi.fn();
    render(<InterviewComplete onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/__tests__/InterviewComplete.test.tsx`
Expected: FAIL — `InterviewComplete` module does not exist.

- [ ] **Step 3: Create the component**

Create `src/components/InterviewComplete.tsx` (mirrors the existing "Interview not found" layout in `Interview.tsx`):

```tsx
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function InterviewComplete({ onExit }: { onExit: () => void }) {
  return (
    <div className="mx-auto flex h-dvh max-w-lg items-center justify-center p-8">
      <Surface
        level={1}
        spacing="lg"
        shadow="lg"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Heading level="h1">Interview complete</Heading>
        <Paragraph>
          Thank you. This interview is finished and its responses can no longer
          be changed. Please hand the device back to the researcher.
        </Paragraph>
        <Button onClick={onExit}>Exit</Button>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/__tests__/InterviewComplete.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/src/components/InterviewComplete.tsx apps/interviewer-v7/src/components/__tests__/InterviewComplete.test.tsx
git commit -m "feat(interviewer-v7): add InterviewComplete terminal screen"
```

---

## Task 4: Interview flow — enter gate, exit gate, finish → complete

Rewrites `InterviewRoute` to gate entry unconditionally on `requireUnlockOnEnter`, route both the Shell exit button and the completion-screen exit through a single `requireUnlockOnExit`-gated handler, render `InterviewComplete` after finishing (and when re-opening a finished session), and removes the now-dead `fresh` plumbing (including its only producer in `Home.tsx`).

**Files:**

- Test: `apps/interviewer-v7/src/routes/__tests__/Interview.test.tsx` (create)
- Modify: `src/routes/Interview.tsx` (full rewrite below)
- Modify: `src/routes/Home.tsx` (drop `fresh` arg)

- [ ] **Step 1: Write the failing behavior tests**

Create `src/routes/__tests__/Interview.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/interview/s1', navigateMock],
}));

const requireFreshUnlockMock = vi.fn();
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock: requireFreshUnlockMock }),
}));

const getSettingsMock = vi.fn();
const getSessionMock = vi.fn();
const getProtocolByHashMock = vi.fn();
const markSessionFinishedMock = vi.fn();
vi.mock('~/lib/db/api', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getSession: (...a: unknown[]) => getSessionMock(...a),
  getProtocolByHash: (...a: unknown[]) => getProtocolByHashMock(...a),
  updateSession: vi.fn(),
  updateSettings: vi.fn(),
  markSessionFinished: (...a: unknown[]) => markSessionFinishedMock(...a),
}));

vi.mock('~/lib/assets/assetResolver', () => ({
  buildResolvedAssets: vi.fn(async () => ({})),
  makeAssetResolver: vi.fn(() => async () => ''),
}));
vi.mock('~/lib/platform/installationId', () => ({
  getInstallationId: () => 'test-install',
}));
vi.mock('~/lib/platform/platform', () => ({
  hostAppName: 'web',
  isElectron: false,
  isCapacitor: false,
}));

const { shellMock } = vi.hoisted(() => ({ shellMock: vi.fn() }));
vi.mock('@codaco/interview', () => ({
  Shell: (props: Record<string, unknown>) => {
    shellMock(props);
    return <div data-testid="shell-mounted" />;
  },
}));

import { InterviewRoute } from '../Interview';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    protocolHash: 'h1',
    protocolName: 'P',
    caseId: 'c1',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: { nodes: [], edges: [] },
    ...overrides,
  };
}

function makeProtocol() {
  return {
    id: 'p1',
    hash: 'h1',
    importedAt: '2026-01-01T00:00:00.000Z',
    protocol: { stages: [], codebook: { node: {}, edge: {}, ego: {} } },
  };
}

function lastShellProps(): Record<string, unknown> {
  return shellMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

async function invoke(fn: () => unknown) {
  await act(async () => {
    void fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(makeSession());
  getProtocolByHashMock.mockResolvedValue(makeProtocol());
  requireFreshUnlockMock.mockResolvedValue({ ok: true });
});

describe('InterviewRoute enter gate', () => {
  it('navigates home when the enter gate is cancelled', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: true,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });

    render(<InterviewRoute sessionId="s1" />);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('mounts the Shell without prompting when the enter gate is off', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(requireFreshUnlockMock).not.toHaveBeenCalled();
  });
});

describe('InterviewRoute exit gate', () => {
  beforeEach(() => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: false,
    });
  });

  it('stays in the interview when the exit gate is cancelled', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });

    await invoke(lastShellProps().onExit as () => void);

    expect(navigateMock).not.toHaveBeenCalledWith('/');
  });

  it('navigates home when the exit gate passes', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await invoke(lastShellProps().onExit as () => void);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });
});

describe('InterviewRoute finish flow', () => {
  beforeEach(() => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
  });

  it('shows the completion screen after finishing', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await act(async () => {
      await (lastShellProps().onFinish as (id: string) => Promise<void>)('s1');
    });

    expect(markSessionFinishedMock).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Interview complete')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('renders the completion screen for an already-finished session', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({ finishedAt: '2026-01-02T00:00:00.000Z' }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByText('Interview complete')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/routes/__tests__/Interview.test.tsx`
Expected: FAIL — the current `Interview.tsx` still keys the gate off `fresh`, navigates to `/data` on finish, and has no completion screen.

- [ ] **Step 3: Rewrite `src/routes/Interview.tsx`**

Replace the entire file with:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  type InterviewPayload,
  type SessionPayload,
  Shell,
} from '@codaco/interview';
import { InterviewComplete } from '~/components/InterviewComplete';
import {
  buildResolvedAssets,
  makeAssetResolver,
} from '~/lib/assets/assetResolver';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import {
  getProtocolByHash,
  getSession,
  getSettings,
  markSessionFinished,
  updateSession,
  updateSettings,
} from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import { getInstallationId } from '~/lib/platform/installationId';
import { hostAppName } from '~/lib/platform/platform';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | {
      kind: 'ready';
      payload: InterviewPayload;
      resolver: (id: string) => Promise<string>;
    };

export function InterviewRoute({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [, navigate] = useLocation();
  const { requireFreshUnlock } = useStepUpAuth();
  const [finished, setFinished] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  // SessionPayload from @codaco/interview's onSync does not carry the current
  // step. Mirror it into a ref so handleSync sees the latest value rather
  // than the stale closure value.
  const currentStepRef = useRef(0);

  // Gated exit shared by the Shell exit button and the completion screen.
  const handleExit = useCallback(async () => {
    const settings = await getSettings();
    if (settings.requireUnlockOnExit) {
      const result = await requireFreshUnlock();
      if (!result.ok) return;
    }
    navigate('/');
  }, [requireFreshUnlock, navigate]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const settings = await getSettings();
      if (settings.requireUnlockOnEnter) {
        const result = await requireFreshUnlock();
        if (!result.ok) {
          if (active) navigate('/');
          return;
        }
      }
      if (!active) return;
      const session = await getSession(sessionId);
      if (!session) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      if (session.finishedAt) {
        if (active) setFinished(true);
        return;
      }
      const protocol = await getProtocolByHash(session.protocolHash);
      if (!protocol) {
        if (active) setState({ kind: 'missing' });
        return;
      }
      const assets = await buildResolvedAssets(session.protocolHash);
      const payload: InterviewPayload = {
        session: hydrateSession(session),
        protocol: {
          ...protocol.protocol,
          id: protocol.id,
          hash: protocol.hash,
          importedAt: protocol.importedAt,
          assets,
        },
      };
      if (!active) return;
      const initialStep = session.currentStep ?? 0;
      setCurrentStep(initialStep);
      currentStepRef.current = initialStep;
      setState({
        kind: 'ready',
        payload,
        resolver: makeAssetResolver(session.protocolHash, protocol.importedAt),
      });
      void updateSettings({
        lastActiveSessionId: session.id,
        lastActiveProtocolHash: session.protocolHash,
      });
    };
    void load();
    return () => {
      active = false;
    };
  }, [sessionId, navigate, requireFreshUnlock]);

  const analytics = useMemo(
    () => ({ installationId: getInstallationId(), hostApp: hostAppName }),
    [],
  );

  const handleSync = useCallback(
    async (id: string, session: SessionPayload) => {
      await updateSession(id, {
        network: session.network,
        currentStep: currentStepRef.current,
        stageMetadata: session.stageMetadata as
          | Record<string, unknown>
          | undefined,
        finishedAt: session.finishTime,
      });
    },
    [],
  );

  const handleFinish = useCallback(async (id: string) => {
    await markSessionFinished(id);
    setFinished(true);
  }, []);

  const handleStepChange = useCallback(
    (step: number) => {
      currentStepRef.current = step;
      setCurrentStep(step);
      void updateSession(sessionId, { currentStep: step });
    },
    [sessionId],
  );

  if (finished) {
    return <InterviewComplete onExit={() => void handleExit()} />;
  }

  if (state.kind === 'loading') {
    return (
      <div className="bg-background flex h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (state.kind === 'missing') {
    return (
      <div className="mx-auto flex h-dvh max-w-lg items-center justify-center p-8">
        <Surface
          level={1}
          spacing="lg"
          shadow="lg"
          className="flex flex-col items-center gap-4 text-center"
        >
          <Heading level="h1">Interview not found</Heading>
          <Paragraph>
            This interview may have been deleted, or the protocol it used is no
            longer installed.
          </Paragraph>
          <Button onClick={() => navigate('/')}>Return home</Button>
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-dvw">
      <Shell
        payload={state.payload}
        currentStep={currentStep}
        onStepChange={handleStepChange}
        onSync={handleSync}
        onFinish={handleFinish}
        onRequestAsset={state.resolver}
        analytics={analytics}
        disableAnalytics
        onExit={() => void handleExit()}
      />
    </div>
  );
}

function hydrateSession(stored: StoredSession): SessionPayload {
  return {
    id: stored.id,
    startTime: stored.startedAt,
    finishTime: stored.finishedAt,
    exportTime: stored.exportedAt,
    lastUpdated: stored.lastUpdatedAt,
    network: stored.network,
    promptIndex: 0,
    stageMetadata: stored.stageMetadata as SessionPayload['stageMetadata'],
  };
}
```

- [ ] **Step 4: Remove the dead `fresh` producer in `src/routes/Home.tsx`**

In `handleSessionCreated`, drop the second argument:

```ts
const handleSessionCreated = useCallback(
  (session: StoredSession) => {
    setPendingProtocolHash(null);
    navigate(`/interview/${session.id}`);
  },
  [navigate],
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test -- src/routes/__tests__/Interview.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Typecheck + lint-fix**

Run (repo root): `pnpm typecheck`
Expected: PASS — no references to `useHistoryState`, `InterviewLocationState`, or `fresh` remain.

Run (repo root): `pnpm lint:fix`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/interviewer-v7/src/routes/Interview.tsx apps/interviewer-v7/src/routes/Home.tsx apps/interviewer-v7/src/routes/__tests__/Interview.test.tsx
git commit -m "feat(interviewer-v7): gate interview enter/exit + secured finish screen"
```

---

## Task 5: Documentation

**Files:**

- Modify: `apps/interviewer-v7/README.md`
- Modify: `apps/interviewer-v7/CLAUDE.md`

- [ ] **Step 1: Add a README section**

In `apps/interviewer-v7/README.md`, immediately after the "## Architecture — auth flow" code block (before "## Data flow — protocol import"), insert:

```markdown
## Step-up auth & interview-flow gates

Beyond the global `AuthGate`, sensitive actions re-authenticate without
unlocking the whole app. `StepUpAuthProvider.requireFreshUnlock()` opens a
verify-only `StepUpAuthDialog` (Touch ID re-prompt for `biometric-keystore`,
the Capacitor plugin for `biometric-native`, or a verifier recompute for
`pin` / `passphrase`) and resolves `{ ok }` without flipping the global lock
state. Under `mode: none` it resolves `{ ok: true }` immediately — there is
no "security-disabled" branch.

Three persisted `StoredSettings` flags gate interview actions, all edited in
one shared control (`src/components/SecurityBehaviorControls.tsx`) surfaced
both in the first-launch wizard (`SetupWizard/Step4Behavior`) and in Settings
(`SettingsDialog`):

| Setting                 | Default | Gate                                              |
| ----------------------- | ------- | ------------------------------------------------- |
| `requireUnlockOnEnter`  | `true`  | Entering any interview — newly started or resumed |
| `requireUnlockOnExit`   | `false` | Exiting an interview back to the dashboard        |
| `requireUnlockOnExport` | `false` | Before exporting session data                     |

Finishing an interview no longer auto-returns to the dashboard. `InterviewRoute`
renders a terminal `InterviewComplete` screen (no navigation bar) whose only
control is an exit gated by `requireUnlockOnExit`; re-opening an
already-finished session shows the same screen. This stops a completed device
from being handed back into the researcher's dashboard without a fresh unlock.
```

- [ ] **Step 2: Update CLAUDE.md — step-up paragraph**

In `apps/interviewer-v7/CLAUDE.md`, find the paragraph beginning "Step-up auth (re-authenticate-before-action) is handled by `StepUpAuthProvider`…" and append, as a new paragraph directly after it:

```markdown
Three persisted `StoredSettings` flags drive step-up at interview
boundaries — `requireUnlockOnEnter` (default `true`; entering any interview,
new or resumed), `requireUnlockOnExit` (default `false`; exiting to the
dashboard), and `requireUnlockOnExport` (default `false`). All three are
edited through the single shared `SecurityBehaviorControls`, used by both the
wizard (`Step4Behavior`) and `SettingsDialog`. Finishing an interview shows a
terminal `InterviewComplete` screen (no nav bar) whose only exit is gated by
`requireUnlockOnExit`; the auto-redirect to `/data` is gone.
```

- [ ] **Step 3: Update CLAUDE.md — source-surface rows**

In the `src/routes/` row, change the `Interview.tsx` description from
`` `Interview.tsx` (hosts the `@codaco/interview` Shell) `` to
`` `Interview.tsx` (hosts the `@codaco/interview` Shell, with enter/exit unlock gates and the post-finish `InterviewComplete` screen) ``.

For the `src/components/` row, append `InterviewComplete` to the component list (e.g. after `ManageAuthenticator`): `, InterviewComplete`.

Finally, update the `src/lib/db/` row, changing `` `StoredSettings` (includes `requireUnlockOnResume` and `requireUnlockOnExport` boolean fields) `` to `` `StoredSettings` (includes `requireUnlockOnEnter`, `requireUnlockOnExit`, and `requireUnlockOnExport` boolean fields) ``.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/README.md apps/interviewer-v7/CLAUDE.md
git commit -m "docs(interviewer-v7): document interview-flow unlock gates"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full typecheck**

Run (repo root): `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run (repo root): `pnpm lint`
Expected: PASS (no errors). If errors, `pnpm lint:fix` then re-run.

- [ ] **Step 3: Dead-code check**

Run (repo root): `pnpm knip`
Expected: no new unused files/exports for interviewer-v7 (`InterviewComplete` is imported by `Interview.tsx`; the new RTL deps are used by the test files).

- [ ] **Step 4: Full test run**

Run (repo root): `pnpm test`
Expected: PASS, including the four new test files.

- [ ] **Step 5: Manual smoke (not automated)**

With the dev server (`pnpm electron:dev` or `pnpm dev`), for at least one lock mode and for `mode: none`:

- Start a new interview and resume an existing one — confirm the enter gate prompts when `requireUnlockOnEnter` is on, and is silent under `mode: none`.
- Toggle `requireUnlockOnExit` on; press the in-interview exit button and confirm the prompt; cancel keeps you in the interview, success returns to the dashboard.
- Finish an interview — confirm the `InterviewComplete` screen appears with no nav bar, and its Exit honours `requireUnlockOnExit`.
- Confirm the wizard's step-4 toggles and the Settings → Security toggles show and persist all three gates identically.

---

## Self-review notes

- **Spec coverage:** settings rename + new field (Task 2), shared UI (Task 2), enter gate (Task 4), exit gate (Task 4), finished screen incl. finished-on-load (Tasks 3–4), `fresh` removal (Task 4), docs (Task 5), tests (Tasks 2–4). The spec's "component tests via RTL" is realized by adding RTL in Task 1 (a decision taken after the spec; the spec's manual-smoke list is preserved in Task 6).
- **Extra rename sites** beyond the spec's file map (`electron/db/service.ts`, `SetupWizardDialog.tsx`) are covered in Task 2.
- **Type consistency:** field names `requireUnlockOnEnter` / `requireUnlockOnExit` / `requireUnlockOnExport` are used identically across `StoredSettings`, `Behavior`, `SetupWizardData['behavior']`, both `DEFAULT_*` constants, and the gate reads.
