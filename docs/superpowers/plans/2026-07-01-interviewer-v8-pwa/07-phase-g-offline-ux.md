## Phase G: Offline UX (spec Workstream D)

This phase implements the connectivity signal and the offline-aware surfaces. All global constraints from the plan header apply: no `any`, no `as` bypass assertions, no barrel files, no convenience re-exports; oxlint + oxfmt (2-space indent, single quotes); Vitest co-located in `__tests__/`; no changeset; TDD with a commit per task and no `Co-Authored-By` trailer.

The app-side connectivity signal (`useOnlineStatus`) and its provider live in `apps/interviewer-v8`. The interview-runtime surfaces (persistent Geospatial offline indicator + offline-aware error boundary message) live in `packages/interview`, which cannot import from the app, so that package gets its own tiny `useOnline` hook mirroring the existing `useMediaQuery` `useSyncExternalStore` pattern.

Two test commands are used:

- App units: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit <path>`
- Interview-package units: `pnpm --filter @codaco/interview exec vitest run --project=units <path>`

---

### Task G1: `useOnlineStatus` hook + `OnlineStatusProvider` in the app

**Files:**

- Create: `apps/interviewer-v8/src/lib/net/useOnlineStatus.ts`
- Create: `apps/interviewer-v8/src/lib/net/OnlineStatusProvider.tsx`
- Modify: `apps/interviewer-v8/src/providers/AppProviders.tsx`
- Test: `apps/interviewer-v8/src/lib/net/__tests__/useOnlineStatus.test.tsx`

**Interfaces:**

- Consumes: nothing (leaf).
- Produces:
  - `useOnlineStatus(): boolean` — `navigator.onLine` + `online`/`offline` events (contract §`src/lib/net/useOnlineStatus.ts`).
  - `OnlineStatusProvider({ children }: { children: ReactNode }): JSX.Element` and `useOnline(): boolean` — a context-backed reader so consumers subscribe once at the provider, not per component.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { OnlineStatusProvider, useOnline } from '../OnlineStatusProvider';
import { useOnlineStatus } from '../useOnlineStatus';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  it('reads the initial navigator.onLine value', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('flips to false on an offline event and back on online', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});

describe('OnlineStatusProvider / useOnline', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <OnlineStatusProvider>{children}</OnlineStatusProvider>;
  }

  it('exposes the current status to consumers and updates on events', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnline(), { wrapper });
    expect(result.current).toBe(false);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('throws when useOnline is used outside the provider', () => {
    function Probe() {
      useOnline();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(
      /useOnline must be used within an OnlineStatusProvider/,
    );
  });

  it('renders children', () => {
    setOnLine(true);
    render(
      <OnlineStatusProvider>
        <span>child</span>
      </OnlineStatusProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/net/__tests__/useOnlineStatus.test.tsx`
      Expected: FAIL — `useOnlineStatus`, `OnlineStatusProvider`, and `useOnline` modules do not exist yet (import/resolve error).
- [ ] **Step 3: Implement**

`apps/interviewer-v8/src/lib/net/useOnlineStatus.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react';

// navigator.onLine + online/offline events. useSyncExternalStore keeps the
// value tearing-free across concurrent renders (mirrors useMediaQuery in
// @codaco/interview).
export function useOnlineStatus(): boolean {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
```

`apps/interviewer-v8/src/lib/net/OnlineStatusProvider.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

import { useOnlineStatus } from './useOnlineStatus';

const OnlineStatusContext = createContext<boolean | null>(null);

export function OnlineStatusProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  return (
    <OnlineStatusContext.Provider value={isOnline}>
      {children}
    </OnlineStatusContext.Provider>
  );
}

export function useOnline(): boolean {
  const value = useContext(OnlineStatusContext);
  if (value === null) {
    throw new Error('useOnline must be used within an OnlineStatusProvider');
  }
  return value;
}
```

Add the provider to `apps/interviewer-v8/src/providers/AppProviders.tsx` (inside `TooltipProvider`, wrapping `DndStoreProvider`, so every route/component below can read connectivity):

```tsx
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { Toast } from '@base-ui/react/toast';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';
import { AnalyticsProvider } from '~/lib/analytics/AnalyticsProvider';
import { AuthProvider } from '~/lib/auth/AuthContext';
import { StepUpAuthProvider } from '~/lib/auth/StepUpAuthProvider';
import { OnlineStatusProvider } from '~/lib/net/OnlineStatusProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <DirectionProvider direction="ltr">
        <Toast.Provider limit={7}>
          <TooltipProvider>
            <OnlineStatusProvider>
              <DndStoreProvider>
                <AuthProvider>
                  <AnalyticsProvider>
                    <DialogProvider>
                      <StepUpAuthProvider>{children}</StepUpAuthProvider>
                    </DialogProvider>
                  </AnalyticsProvider>
                </AuthProvider>
              </DndStoreProvider>
            </OnlineStatusProvider>
          </TooltipProvider>
          <Toaster />
        </Toast.Provider>
      </DirectionProvider>
    </MotionConfig>
  );
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/net/__tests__/useOnlineStatus.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/net/useOnlineStatus.ts apps/interviewer-v8/src/lib/net/OnlineStatusProvider.tsx apps/interviewer-v8/src/providers/AppProviders.tsx apps/interviewer-v8/src/lib/net/__tests__/useOnlineStatus.test.tsx && git commit -m "feat(interviewer-v8): add useOnlineStatus hook and OnlineStatusProvider"
```

---

### Task G2: Extract `protocolRequiresInternet` into a shared helper

**Files:**

- Create: `apps/interviewer-v8/src/lib/protocol/protocolRequiresInternet.ts`
- Modify: `apps/interviewer-v8/src/components/ProtocolCarousel/DeckSlotCard.tsx`
- Test: `apps/interviewer-v8/src/lib/protocol/__tests__/protocolRequiresInternet.test.ts`

**Interfaces:**

- Consumes: `ProtocolWithCounts` from `~/lib/db/types`.
- Produces: `protocolRequiresInternet(protocol: ProtocolWithCounts): boolean` — a protocol needs a network connection when any stage is `Geospatial` (renders an online tile server). Relocated out of `DeckSlotCard.tsx` so both `DeckSlotCard` and `NewSessionForm` (Task G3) import the single source.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { protocolRequiresInternet } from '../protocolRequiresInternet';

function makeProtocol(stageTypes: string[]): ProtocolWithCounts {
  const stages = stageTypes.map((type, index) => ({
    id: `stage-${index}`,
    type,
    label: type,
  }));
  const protocol = {
    name: 'Test',
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages,
  } as unknown as CurrentProtocol;
  return {
    id: 'test',
    hash: 'hash',
    name: 'Test',
    schemaVersion: 8,
    importedAt: '2026-07-01T00:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

describe('protocolRequiresInternet', () => {
  it('is true when any stage is Geospatial', () => {
    expect(
      protocolRequiresInternet(makeProtocol(['NameGenerator', 'Geospatial'])),
    ).toBe(true);
  });

  it('is false when no stage is Geospatial', () => {
    expect(
      protocolRequiresInternet(makeProtocol(['NameGenerator', 'Sociogram'])),
    ).toBe(false);
  });

  it('is false for a protocol with no stages', () => {
    expect(protocolRequiresInternet(makeProtocol([]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol/__tests__/protocolRequiresInternet.test.ts`
      Expected: FAIL — `../protocolRequiresInternet` does not exist yet.
- [ ] **Step 3: Implement**

`apps/interviewer-v8/src/lib/protocol/protocolRequiresInternet.ts`:

```ts
import type { ProtocolWithCounts } from '~/lib/db/types';

// A Geospatial stage renders an online map (tile server), so a protocol
// that contains one can't be administered while offline.
export function protocolRequiresInternet(
  protocol: ProtocolWithCounts,
): boolean {
  return protocol.protocol.stages.some((stage) => stage.type === 'Geospatial');
}
```

Update `apps/interviewer-v8/src/components/ProtocolCarousel/DeckSlotCard.tsx` — remove the inline function (lines 24–28) and its now-unused `ProtocolWithCounts` type-only import if it becomes unused, and import the helper. Replace the import block near the top:

```tsx
import { Download } from 'lucide-react';

import type { StoredSession } from '~/lib/db/types';
import type { ImportPhase } from '~/lib/protocol/importProtocol';
import { protocolRequiresInternet } from '~/lib/protocol/protocolRequiresInternet';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';

import { NewSessionForm } from '../NewSessionForm';
```

Delete the inline `protocolRequiresInternet` definition (the comment + function at former lines 24–28). The `DeckSlotCardProps` type still references `ProtocolWithCounts`? It does not — `entry.protocol` is typed via `DeckEntry`, so the `ProtocolWithCounts` import is now unused and must be dropped (as shown above, only `StoredSession` is retained). The existing call site `protocolRequiresInternet(entry.protocol)` is unchanged.

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/protocol/__tests__/protocolRequiresInternet.test.ts && pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/ProtocolCarousel/__tests__/DeckSlotCard.test.tsx`
      Expected: PASS — new helper test passes and the existing `DeckSlotCard` test still passes (behaviour unchanged).
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/lib/protocol/protocolRequiresInternet.ts apps/interviewer-v8/src/components/ProtocolCarousel/DeckSlotCard.tsx apps/interviewer-v8/src/lib/protocol/__tests__/protocolRequiresInternet.test.ts && git commit -m "refactor(interviewer-v8): extract protocolRequiresInternet into a shared helper"
```

---

### Task G3: Offline warning at session start that allows proceeding

**Files:**

- Modify: `apps/interviewer-v8/src/components/NewSessionForm.tsx`
- Test: `apps/interviewer-v8/src/components/__tests__/NewSessionForm.test.tsx`

**Interfaces:**

- Consumes:
  - `useOnline()` from `~/lib/net/OnlineStatusProvider` (Task G1).
  - `protocolRequiresInternet(protocol)` from `~/lib/protocol/protocolRequiresInternet` (Task G2).
  - `useDialog()` from `@codaco/fresco-ui/dialogs/useDialog` → `openDialog({ type: 'choice', intent: 'warning', ... })` returning the chosen action value (`true` to proceed, `null`/cancel otherwise); type from `ChoiceDialog`/`DialogReturnType` in `@codaco/fresco-ui/dialogs/DialogProvider`.
- Produces: no new exports; the submit flow gains an offline gate before `createSession`.

Behaviour: when the target protocol requires internet (`protocolRequiresInternet`) and the app is offline (`!useOnline()`), the submit handler shows a warning choice dialog. Proceeding continues to the existing enter-gate + `createSession`; declining aborts without creating a session. Online, or for non-internet protocols, the flow is unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

const openDialog = vi.fn();
const createSession = vi.fn();
const getSettings = vi.fn();
const requireFreshUnlock = vi.fn();
const setAuthorizedInterviewId = vi.fn();
let online = true;

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog, closeDialog: vi.fn(), confirm: vi.fn() }),
}));
vi.mock('~/lib/net/OnlineStatusProvider', () => ({
  useOnline: () => online,
}));
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock, setAuthorizedInterviewId }),
}));
vi.mock('~/lib/db/api', () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  getSettings: () => getSettings(),
}));
vi.mock('@codaco/interview', () => ({
  createInitialNetwork: () => ({ nodes: [], edges: [], ego: {} }),
}));

import { NewSessionForm } from '../NewSessionForm';

function makeProtocol(stageTypes: string[]): ProtocolWithCounts {
  const stages = stageTypes.map((type, index) => ({
    id: `stage-${index}`,
    type,
    label: type,
  }));
  const protocol = {
    name: 'Test',
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages,
  } as unknown as CurrentProtocol;
  return {
    id: 'test',
    hash: 'hash',
    name: 'Test',
    schemaVersion: 8,
    importedAt: '2026-07-01T00:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

const session: StoredSession = {
  id: 'session-1',
} as unknown as StoredSession;

function Harness({ protocol }: { protocol: ProtocolWithCounts }): ReactNode {
  return (
    <NewSessionForm
      protocol={protocol}
      onCreated={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

describe('NewSessionForm offline warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online = true;
    getSettings.mockResolvedValue({ requireUnlockOnEnter: false });
    createSession.mockResolvedValue(session);
  });

  it('warns before starting an internet-requiring session while offline and creates the session when the researcher proceeds', async () => {
    online = false;
    openDialog.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText('Case ID'), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'choice', intent: 'warning' }),
    );
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  });

  it('does not create the session when the researcher declines the offline warning', async () => {
    online = false;
    openDialog.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText('Case ID'), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(openDialog).toHaveBeenCalledTimes(1));
    expect(createSession).not.toHaveBeenCalled();
  });

  it('does not warn when online even for an internet-requiring protocol', async () => {
    online = true;
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['Geospatial'])} />);

    await user.type(screen.getByLabelText('Case ID'), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(openDialog).not.toHaveBeenCalled();
  });

  it('does not warn offline when the protocol does not require internet', async () => {
    online = false;
    const user = userEvent.setup();
    render(<Harness protocol={makeProtocol(['NameGenerator'])} />);

    await user.type(screen.getByLabelText('Case ID'), 'P01');
    await user.click(screen.getByRole('button', { name: 'Start interview' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(openDialog).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/NewSessionForm.test.tsx`
      Expected: FAIL — the submit handler does not consult `useOnline`/`openDialog` yet, so the offline-decline and warning-payload assertions fail (the session is created unconditionally).
- [ ] **Step 3: Implement**

`apps/interviewer-v8/src/components/NewSessionForm.tsx` (add the two imports, read online + dialog, and gate the submit before the enter-gate):

```tsx
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { createInitialNetwork } from '@codaco/interview';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import { createSession, getSettings } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';
import { useOnline } from '~/lib/net/OnlineStatusProvider';
import { protocolRequiresInternet } from '~/lib/protocol/protocolRequiresInternet';

type NewSessionFormProps = {
  protocol: ProtocolWithCounts;
  onCreated: (session: StoredSession) => void;
  onCancel: () => void;
};

export function NewSessionForm({
  protocol,
  onCreated,
  onCancel,
}: NewSessionFormProps) {
  const { requireFreshUnlock, setAuthorizedInterviewId } = useStepUpAuth();
  const isOnline = useOnline();
  const { openDialog } = useDialog();

  return (
    <Form
      onSubmit={async (values) => {
        const raw = values.caseId;
        const caseId = typeof raw === 'string' ? raw.trim() : '';
        if (!caseId) {
          return {
            success: false,
            fieldErrors: { caseId: ['Case ID is required'] },
          };
        }
        // This protocol renders an online map but the device is offline. Warn
        // the researcher; the map won't load, but they may still want to start
        // (the rest of the interview works, and connectivity may return).
        if (!isOnline && protocolRequiresInternet(protocol)) {
          const proceed = await openDialog({
            type: 'choice',
            intent: 'warning',
            title: 'You appear to be offline',
            description:
              'This protocol includes a map stage that needs an internet connection. The map will not load until you reconnect. You can still start the interview and complete the other stages.',
            actions: {
              primary: { label: 'Start anyway', value: true },
              cancel: { label: 'Cancel', value: null },
            },
          });
          if (proceed !== true) return { success: false };
        }
        // Run the enter gate before creating the session so a declined or
        // failed unlock doesn't leave an orphan session behind.
        const settings = await getSettings();
        if (settings.requireUnlockOnEnter) {
          const result = await requireFreshUnlock();
          if (!result.ok) return { success: false };
        }
        const session = await createSession({
          protocolHash: protocol.hash,
          protocolName: protocol.name,
          caseId,
          initialNetwork: createInitialNetwork(),
        });
        // The user just satisfied the enter gate for this session; mark it
        // authorized so the InterviewRoute mount doesn't prompt again.
        setAuthorizedInterviewId(session.id);
        onCreated(session);
        return { success: true };
      }}
    >
      <Paragraph>
        Before the interview begins, enter a case ID. This will be shown on the
        resume interview screen to help you quickly identify this session.
      </Paragraph>

      <Field
        name="caseId"
        label="Case ID"
        hint="A label used to identify this interview in exports."
        component={InputField}
        required="Case ID is required"
        minLength={1}
        validateOnChange
        autoFocus
      />
      <div className="flex items-center justify-end gap-[2cqi]">
        <Button type="button" variant="text" color="dynamic" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton>Start interview</SubmitButton>
      </div>
    </Form>
  );
}
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/components/__tests__/NewSessionForm.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v8/src/components/NewSessionForm.tsx apps/interviewer-v8/src/components/__tests__/NewSessionForm.test.tsx && git commit -m "feat(interviewer-v8): warn (but allow) starting an offline internet-requiring session"
```

---

### Task G4: `useOnline` connectivity hook in the interview package

**Files:**

- Create: `packages/interview/src/hooks/useOnline.ts`
- Test: `packages/interview/src/hooks/__tests__/useOnline.test.ts`

**Interfaces:**

- Consumes: nothing (leaf; mirrors `packages/interview/src/hooks/useMediaQuery.ts`).
- Produces: `default useOnline(): boolean` — `navigator.onLine` + `online`/`offline` events via `useSyncExternalStore`. Package-local because `@codaco/interview` cannot import from the app; used by Tasks G5 and G6.

- [ ] **Step 1: Write the failing test**

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import useOnline from '../useOnline';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnline', () => {
  it('reads the initial navigator.onLine value', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it('reacts to offline and online events', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline());

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interview exec vitest run --project=units src/hooks/__tests__/useOnline.test.ts`
      Expected: FAIL — `../useOnline` does not exist yet.
- [ ] **Step 3: Implement**

`packages/interview/src/hooks/useOnline.ts`:

```ts
import { useCallback, useSyncExternalStore } from 'react';

// navigator.onLine + online/offline events. Mirrors useMediaQuery's
// useSyncExternalStore pattern; the SSR snapshot assumes online so the map
// UI is never gated on the server render.
const useOnline = (): boolean => {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
};

export default useOnline;
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interview exec vitest run --project=units src/hooks/__tests__/useOnline.test.ts`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/hooks/useOnline.ts packages/interview/src/hooks/__tests__/useOnline.test.ts && git commit -m "feat(interview): add package-local useOnline connectivity hook"
```

---

### Task G5: Offline-aware Geospatial error boundary message

**Files:**

- Modify: `packages/interview/src/components/StageErrorBoundary.tsx`
- Test: `packages/interview/src/components/__tests__/StageErrorBoundary.test.tsx`

**Interfaces:**

- Consumes: `useOnline()` from `~/hooks/useOnline` (Task G4).
- Produces: no new exports. The boundary's functional wrapper reads connectivity and passes an `isOffline` flag into the inner class component; when a stage crashes while offline, the boundary shows an offline-aware message (with a `data-testid="offline-error-message"` marker) instead of the generic "problem occurred" copy. Online failures render exactly as before.

Rationale: a Geospatial stage that crashes because Mapbox couldn't reach the network is most likely to fail while offline. Reading connectivity in the wrapper (not the class) keeps the class component pure and testable via a prop.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

let online = true;
vi.mock('~/hooks/useOnline', () => ({
  default: () => online,
}));
vi.mock('../../analytics/useTrack', () => ({
  useCaptureException: () => vi.fn(),
}));

import StageErrorBoundary from '../StageErrorBoundary';

function Boom(): ReactNode {
  throw new Error('WebGL init failed');
}

describe('StageErrorBoundary', () => {
  it('shows a generic message when a stage crashes while online', () => {
    online = true;
    render(
      <StageErrorBoundary>
        <Boom />
      </StageErrorBoundary>,
    );
    expect(screen.getByText('A problem occurred!')).toBeInTheDocument();
    expect(
      screen.queryByTestId('offline-error-message'),
    ).not.toBeInTheDocument();
  });

  it('shows an offline-aware message when a stage crashes while offline', () => {
    online = false;
    render(
      <StageErrorBoundary>
        <Boom />
      </StageErrorBoundary>,
    );
    expect(screen.getByTestId('offline-error-message')).toBeInTheDocument();
    expect(screen.queryByText('A problem occurred!')).not.toBeInTheDocument();
  });

  it('renders children when there is no error', () => {
    online = true;
    render(
      <StageErrorBoundary>
        <span>ok</span>
      </StageErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interview exec vitest run --project=units src/components/__tests__/StageErrorBoundary.test.tsx`
      Expected: FAIL — the boundary always renders the generic message; there is no `offline-error-message` element and no offline branch.
- [ ] **Step 3: Implement**

`packages/interview/src/components/StageErrorBoundary.tsx` — thread `isOffline` from the functional wrapper into the class and branch the rendered message:

```tsx
import React, { Component, type ReactNode } from 'react';

import Icon from '@codaco/fresco-ui/Icon';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import useOnline from '~/hooks/useOnline';

import { useCaptureException } from '../analytics/useTrack';
import CopyDebugInfoButton from './CopyDebugInfoButton';

// Build the copyable debug string. The stack alone is not enough: Firefox's
// Error.stack contains only call frames, not the error message, so copying
// `error.stack` there silently drops the single most useful piece of
// information (e.g. "Failed to initialize WebGL"). Always lead with the
// name/message so reports are actionable regardless of browser.
function formatDebugInfo(error: Error): string {
  const heading = error.message
    ? `${error.name}: ${error.message}`
    : error.name;
  return error.stack ? `${heading}\n\n${error.stack}` : heading;
}

type StageErrorBoundaryInnerProps = {
  children: ReactNode;
  captureException: (error: Error, props?: Record<string, unknown>) => void;
  isOffline: boolean;
};

type StageErrorBoundaryState = {
  error?: Error;
};

class StageErrorBoundaryInner extends Component<
  StageErrorBoundaryInnerProps,
  StageErrorBoundaryState
> {
  constructor(props: StageErrorBoundaryInnerProps) {
    super(props);
    this.state = {};
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.captureException(error, {
      component_stack: info.componentStack,
      feature: 'stage-error-boundary',
      is_offline: this.props.isOffline,
    });
    this.setState({ error });
  }

  render() {
    const { children, isOffline } = this.props;
    const { error } = this.state;

    if (error) {
      return (
        <Surface noContainer className="mx-auto h-fit max-w-2xl grow-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center justify-center">
              <Icon name="error" />
            </div>
            {isOffline ? (
              <div data-testid="offline-error-message">
                <Heading>This task needs an internet connection</Heading>
                <Paragraph>
                  You appear to be offline, and this task could not be
                  displayed. Some tasks (such as maps) need a connection. Check
                  your connection and refresh the page. You may be able to
                  continue by selecting the next arrow. If the problem persists
                  once you are back online, please contact the study organizer
                  and provide the debug information below.
                </Paragraph>
              </div>
            ) : (
              <div>
                <Heading>A problem occurred!</Heading>
                <Paragraph>
                  There was an error with the interview software, and this task
                  could not be displayed. Try refreshing the page. If the
                  problem persists, please contact the study organizer and
                  provide the debug information below. You may be able to
                  continue your interview by clicking the next button.
                </Paragraph>
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <CopyDebugInfoButton debugInfo={formatDebugInfo(error)} />
          </div>
        </Surface>
      );
    }

    return children;
  }
}

type StageErrorBoundaryProps = {
  children: ReactNode;
};

const StageErrorBoundary = ({ children }: StageErrorBoundaryProps) => {
  const captureException = useCaptureException();
  const isOnline = useOnline();
  return (
    <StageErrorBoundaryInner
      captureException={captureException}
      isOffline={!isOnline}
    >
      {children}
    </StageErrorBoundaryInner>
  );
};

export default StageErrorBoundary;
```

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interview exec vitest run --project=units src/components/__tests__/StageErrorBoundary.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/components/StageErrorBoundary.tsx packages/interview/src/components/__tests__/StageErrorBoundary.test.tsx && git commit -m "feat(interview): offline-aware Geospatial stage error boundary message"
```

---

### Task G6: Persistent offline indicator when a Geospatial stage is reached offline

**Files:**

- Create: `packages/interview/src/components/GeospatialOfflineIndicator.tsx`
- Modify: `packages/interview/src/Shell.tsx`
- Test: `packages/interview/src/components/__tests__/GeospatialOfflineIndicator.test.tsx`

**Interfaces:**

- Consumes: `useOnline()` from `~/hooks/useOnline` (Task G4).
- Produces: `GeospatialOfflineIndicator({ active }: { active: boolean }): JSX.Element | null` — renders a persistent, `aria-live="polite"` offline banner only when `active` is `true` (the current stage is `Geospatial`) AND the device is offline. Mounted in `Shell.tsx`'s `Interview` component, driven by `stage?.type === 'Geospatial'`, so the indicator is visible for the whole time a Geospatial stage is on screen offline and auto-dismisses when connectivity returns or the stage changes.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let online = true;
vi.mock('~/hooks/useOnline', () => ({
  default: () => online,
}));

import { GeospatialOfflineIndicator } from '../GeospatialOfflineIndicator';

describe('GeospatialOfflineIndicator', () => {
  it('renders an offline banner when active and offline', () => {
    online = false;
    render(<GeospatialOfflineIndicator active />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/offline/i);
  });

  it('renders nothing when active but online', () => {
    online = true;
    const { container } = render(<GeospatialOfflineIndicator active />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when offline but not on a Geospatial stage', () => {
    online = false;
    const { container } = render(<GeospatialOfflineIndicator active={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it, expect fail**
      Run: `pnpm --filter @codaco/interview exec vitest run --project=units src/components/__tests__/GeospatialOfflineIndicator.test.tsx`
      Expected: FAIL — `../GeospatialOfflineIndicator` does not exist yet.
- [ ] **Step 3: Implement**

`packages/interview/src/components/GeospatialOfflineIndicator.tsx`:

```tsx
import { WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import useOnline from '~/hooks/useOnline';

// Persistent banner shown while a Geospatial stage is on screen and the device
// is offline. The map will not load without a connection, so this is a
// standing signal (not a transient toast). aria-live announces it when it
// appears; it auto-dismisses when connectivity returns or the stage changes.
export function GeospatialOfflineIndicator({ active }: { active: boolean }) {
  const isOnline = useOnline();
  const show = active && !isOnline;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-surface/90 text-foreground pointer-events-none absolute top-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur-md"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          <span>
            You are offline — the map will not load until you reconnect.
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Wire it into `packages/interview/src/Shell.tsx`. Add the import near the other component imports:

```tsx
import { GeospatialOfflineIndicator } from './components/GeospatialOfflineIndicator';
```

Render it inside the `Interview` component's stage container. The stage `<motion.div>` (keyed by `displayedStep`) already positions the stage; place the indicator inside its inner `#stage` div so it overlays the stage. Change the block currently at lines 138–152:

```tsx
<div
  className="relative flex size-full flex-col items-center justify-center"
  id="stage"
  key={stage.id}
>
  <GeospatialOfflineIndicator active={stage.type === 'Geospatial'} />
  <StageErrorBoundary>
    {CurrentInterface && (
      <CurrentInterface
        key={stage.id}
        stage={stage}
        getNavigationHelpers={getNavigationHelpers}
      />
    )}
  </StageErrorBoundary>
</div>
```

(The only change to the existing `#stage` div is adding `relative` to its className — required so the absolutely-positioned indicator anchors to the stage — and inserting the `<GeospatialOfflineIndicator>` before `<StageErrorBoundary>`.)

- [ ] **Step 4: Run it, expect pass**
      Run: `pnpm --filter @codaco/interview exec vitest run --project=units src/components/__tests__/GeospatialOfflineIndicator.test.tsx`
      Expected: PASS
- [ ] **Step 5: Commit**

```bash
git add packages/interview/src/components/GeospatialOfflineIndicator.tsx packages/interview/src/Shell.tsx packages/interview/src/components/__tests__/GeospatialOfflineIndicator.test.tsx && git commit -m "feat(interview): persistent offline indicator on Geospatial stages"
```

---

### Task G7: Typecheck the phase and confirm no dead exports

**Files:**

- Modify: none (verification-only task).

**Interfaces:**

- Consumes: all exports produced in G1–G6.
- Produces: nothing.

This task closes the phase with one consolidated typecheck + knip pass (per the "defer all tsc to ONE final pass" convention), catching any cross-file type drift from the extraction (G2), the `NewSessionForm` gate (G3), and the interview-package wiring (G4–G6), plus any newly unused export.

- [ ] **Step 1: Verification — typecheck both affected packages**
      Run: `pnpm --filter @codaco/interviewer-v8 typecheck && pnpm --filter @codaco/interview typecheck`
      Expected: PASS — no type errors. In particular, `DeckSlotCard.tsx` compiles with the `ProtocolWithCounts` import removed (G2), and `Shell.tsx` accepts `stage.type === 'Geospatial'` narrowing.
- [ ] **Step 2: Verification — no unused exports introduced**
      Run: `pnpm knip`
      Expected: PASS — `useOnlineStatus`, `OnlineStatusProvider`/`useOnline`, `protocolRequiresInternet`, the package `useOnline`, and `GeospatialOfflineIndicator` are all consumed (`OnlineStatusProvider` by `AppProviders`, `useOnline` by `NewSessionForm`, `protocolRequiresInternet` by `DeckSlotCard` + `NewSessionForm`, the package `useOnline` by `StageErrorBoundary` + `GeospatialOfflineIndicator`, and `GeospatialOfflineIndicator` by `Shell`). No new knip findings.
- [ ] **Step 3: Verification — full offline-UX unit suite is green**
      Run: `pnpm --filter @codaco/interviewer-v8 exec vitest run --project=unit src/lib/net src/lib/protocol/__tests__/protocolRequiresInternet.test.ts src/components/__tests__/NewSessionForm.test.tsx && pnpm --filter @codaco/interview exec vitest run --project=units src/hooks/__tests__/useOnline.test.ts src/components/__tests__/StageErrorBoundary.test.tsx src/components/__tests__/GeospatialOfflineIndicator.test.tsx`
      Expected: PASS — every G1–G6 test file passes together.
- [ ] **Step 4: Commit**
      No code changes; if `pnpm lint:fix` (run at Step 1 pre-commit for earlier tasks) reformatted anything, stage and commit it:

```bash
git add -A && git commit -m "chore(interviewer-v8): typecheck + knip pass for offline UX phase" --allow-empty
```
