# Onboarding Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/welcome` onboarding screen (animated logo + headline + sub-line + "Get started" button) that hands off to the existing security setup wizard, with an app-wide page-transition wrapper that animates between routes.

**Architecture:** Single `AnimatePresence mode="wait"` + keyed `motion.div` in `App.tsx` wraps the route `<Switch>`, doing opacity crossfades on every route change. `AuthGate` becomes redirect-only (no longer auto-opens the wizard). New `WelcomeRoute` renders an `OnboardingScreen` component with variant-based motion (lift-and-disperse exit choreography on the logo, headline, sub-line, and button).

**Tech Stack:** React, `motion/react` (Framer Motion), `wouter`, `@codaco/fresco-ui` (Button, Heading, Paragraph), Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-05-20-onboarding-animation-design.md`

---

## File Structure

New files:

- `apps/interviewer-v7/src/components/OnboardingScreen.tsx` — presentational; owns the welcome layout, copy, and motion variants
- `apps/interviewer-v7/src/routes/Welcome.tsx` — trivial route wrapper that renders `<OnboardingScreen />`

Modified files:

- `apps/interviewer-v7/src/components/AuthGate.tsx` — swap the auto-open wizard `useEffect` for redirect effects between `/welcome` and `/`
- `apps/interviewer-v7/src/App.tsx` — add `AnimatePresence` + keyed `motion.div` around the `<Switch>`, add `<Route path="/welcome">`

---

### Task 1: Create `OnboardingScreen.tsx`

**Files:**

- Create: `apps/interviewer-v7/src/components/OnboardingScreen.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useCallback, useRef } from 'react';

import { motion } from 'motion/react';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ncMarkUrl from '~/assets/NC-Flat.png';

import { useSetupWizard } from './SetupWizardDialog';

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      when: 'beforeChildren',
      staggerChildren: 0.18,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: { when: 'afterChildren', staggerChildren: 0.05 },
  },
} as const;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.32, 0, 0.67, 0] as const;

const logoVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -180,
    scale: 0.96,
    transition: { duration: 0.7, ease: EASE_IN },
  },
} as const;

const textVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  exit: { opacity: 0, y: -40, transition: { duration: 0.55 } },
} as const;

const buttonVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: 40, transition: { duration: 0.5 } },
} as const;

export function OnboardingScreen() {
  const { openSetupWizard } = useSetupWizard();
  const openedRef = useRef(false);

  const handleStart = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void openSetupWizard().finally(() => {
      openedRef.current = false;
    });
  }, [openSetupWizard]);

  return (
    <motion.div
      variants={containerVariants}
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center"
    >
      <motion.img
        variants={logoVariants}
        src={ncMarkUrl}
        alt=""
        className="size-32"
      />
      <motion.div variants={textVariants}>
        <Heading level="h1" margin="none" className="font-black tracking-tight">
          Welcome to Network Canvas Interviewer
        </Heading>
      </motion.div>
      <motion.div variants={textVariants}>
        <Paragraph margin="none">Let's set up this device.</Paragraph>
      </motion.div>
      <motion.div variants={buttonVariants} className="mt-2">
        <Button type="button" color="primary" onClick={handleStart}>
          Get started
        </Button>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/interviewer-v7 typecheck`
Expected: no errors related to this file. (The rest of the app won't compile yet because `useSetupWizard` is still imported from `SetupWizardDialog` — that should still work since `useSetupWizard` is exported. No other changes are needed.)

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/src/components/OnboardingScreen.tsx
git commit -m "feat(interviewer-v7): add OnboardingScreen component"
```

---

### Task 2: Create `Welcome.tsx` route

**Files:**

- Create: `apps/interviewer-v7/src/routes/Welcome.tsx`

- [ ] **Step 1: Write the route wrapper**

```tsx
import { OnboardingScreen } from '~/components/OnboardingScreen';

export function WelcomeRoute() {
  return <OnboardingScreen />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/interviewer-v7 typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/src/routes/Welcome.tsx
git commit -m "feat(interviewer-v7): add Welcome route"
```

---

### Task 3: Modify `AuthGate.tsx` — redirect-only

**Files:**

- Modify: `apps/interviewer-v7/src/components/AuthGate.tsx`

Current file content (for reference):

```tsx
import { type ReactNode, useEffect, useRef } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';
import { useSetupWizard } from './SetupWizardDialog';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const { openSetupWizard } = useSetupWizard();
  const openedRef = useRef(false);

  useEffect(() => {
    if (kind !== 'unconfigured' || openedRef.current) return;
    openedRef.current = true;
    void openSetupWizard().finally(() => {
      openedRef.current = false;
    });
  }, [kind, openSetupWizard]);

  if (kind === 'loading') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (kind === 'unconfigured') {
    return <div className="min-h-dvh" aria-hidden />;
  }

  if (kind === 'locked') return <LockScreen />;

  return <>{children}</>;
}
```

- [ ] **Step 1: Replace the file**

Replace the entire file contents with:

```tsx
import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (kind === 'unconfigured' && location !== '/welcome') {
      navigate('/welcome', { replace: true });
    } else if (kind === 'unlocked' && location === '/welcome') {
      navigate('/', { replace: true });
    }
  }, [kind, location, navigate]);

  if (kind === 'loading') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (kind === 'locked') return <LockScreen />;

  return <>{children}</>;
}
```

Notes:

- `useRef` is no longer imported (no `openedRef` here anymore).
- `useSetupWizard` import is removed entirely (the wizard is now triggered from `OnboardingScreen`).
- `useLocation` from `wouter` is added. Note: wouter's `useLocation` returns `[location, setLocation]`; the second element is the navigation function.
- The previous `kind === 'unconfigured'` branch that returned a placeholder is deleted — the route tree now renders so `/welcome` can mount.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/interviewer-v7 typecheck`
Expected: clean (the file imports nothing that doesn't exist).

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/src/components/AuthGate.tsx
git commit -m "refactor(interviewer-v7): AuthGate redirects to /welcome instead of auto-opening wizard"
```

---

### Task 4: Modify `App.tsx` — add page-transition wrapper + `/welcome` route

**Files:**

- Modify: `apps/interviewer-v7/src/App.tsx`

Current file content (for reference):

```tsx
import { motion } from 'motion/react';
import { Route, Switch } from 'wouter';

import { BackgroundBlobs } from '@codaco/art';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { isElectron } from './lib/platform/platform';
import { AppProviders } from './providers/AppProviders';
import { HomeRoute } from './routes/Home';
import { InterviewRoute } from './routes/Interview';
import { NotFoundRoute } from './routes/NotFound';
import { ProtocolsRoute } from './routes/Protocols';
import { SessionsRoute } from './routes/Sessions';
import { SettingsRoute } from './routes/Settings';

export default function App() {
  return (
    <AppProviders>
      <ThemedRegion theme="interview" className="isolate">
        {isElectron && (
          <div
            aria-hidden
            className="app-drag fixed inset-x-0 top-0 z-50 h-8"
          />
        )}
        <motion.div
          className="fixed inset-0 -z-10 blur-[10rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{
            duration: 2,
          }}
        >
          <BackgroundBlobs
            large={0}
            medium={4}
            small={0}
            compositeOperation="color-dodge"
          />
        </motion.div>
        <AuthGate>
          <Switch>
            <Route path="/interview/:sessionId">
              {({ sessionId }) => <InterviewRoute sessionId={sessionId} />}
            </Route>
            <Route path="/" component={HomeRoute} />
            <Route>
              <AppShell>
                <Switch>
                  <Route path="/protocols" component={ProtocolsRoute} />
                  <Route path="/sessions" component={SessionsRoute} />
                  <Route path="/settings" component={SettingsRoute} />
                  <Route component={NotFoundRoute} />
                </Switch>
              </AppShell>
            </Route>
          </Switch>
        </AuthGate>
      </ThemedRegion>
    </AppProviders>
  );
}
```

- [ ] **Step 1: Replace the file**

Replace the entire file contents with:

```tsx
import { AnimatePresence, motion } from 'motion/react';
import { Route, Switch, useLocation } from 'wouter';

import { BackgroundBlobs } from '@codaco/art';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { isElectron } from './lib/platform/platform';
import { AppProviders } from './providers/AppProviders';
import { HomeRoute } from './routes/Home';
import { InterviewRoute } from './routes/Interview';
import { NotFoundRoute } from './routes/NotFound';
import { ProtocolsRoute } from './routes/Protocols';
import { SessionsRoute } from './routes/Sessions';
import { SettingsRoute } from './routes/Settings';
import { WelcomeRoute } from './routes/Welcome';

const pageWrapperVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: 'beforeChildren', duration: 0.4 },
  },
  exit: { opacity: 0, transition: { duration: 0.4 } },
} as const;

export default function App() {
  const [location] = useLocation();

  return (
    <AppProviders>
      <ThemedRegion theme="interview" className="isolate">
        {isElectron && (
          <div
            aria-hidden
            className="app-drag fixed inset-x-0 top-0 z-50 h-8"
          />
        )}
        <motion.div
          className="fixed inset-0 -z-10 blur-[10rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ duration: 2 }}
        >
          <BackgroundBlobs
            large={0}
            medium={4}
            small={0}
            compositeOperation="color-dodge"
          />
        </motion.div>
        <AuthGate>
          <AnimatePresence mode="wait">
            <motion.div
              key={location}
              variants={pageWrapperVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <Switch location={location}>
                <Route path="/welcome" component={WelcomeRoute} />
                <Route path="/interview/:sessionId">
                  {({ sessionId }) => <InterviewRoute sessionId={sessionId} />}
                </Route>
                <Route path="/" component={HomeRoute} />
                <Route>
                  <AppShell>
                    <Switch location={location}>
                      <Route path="/protocols" component={ProtocolsRoute} />
                      <Route path="/sessions" component={SessionsRoute} />
                      <Route path="/settings" component={SettingsRoute} />
                      <Route component={NotFoundRoute} />
                    </Switch>
                  </AppShell>
                </Route>
              </Switch>
            </motion.div>
          </AnimatePresence>
        </AuthGate>
      </ThemedRegion>
    </AppProviders>
  );
}
```

Notes:

- `AnimatePresence` is added to the `motion/react` import.
- `useLocation` is added to the `wouter` import.
- `WelcomeRoute` is imported from `./routes/Welcome`.
- The page wrapper variants live as a module-scope constant (above the component).
- Both inner `<Switch>` components receive `location={location}` so they branch off the same observed location wouter is rendering — this is the canonical wouter + `AnimatePresence` pattern.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/interviewer-v7 typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `pnpm --filter @codaco/interviewer-v7 lint` (or `pnpm lint:fix` from repo root).
Expected: clean. If oxlint or oxfmt rewrite anything, accept the rewrites (the pre-commit hook will format too).

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/src/App.tsx
git commit -m "feat(interviewer-v7): app-wide page transitions and /welcome route"
```

---

### Task 5: Verification

**Files:** none — just running checks.

- [ ] **Step 1: Repo-wide typecheck**

Run: `pnpm typecheck`
Expected: clean across all packages.

- [ ] **Step 2: Repo-wide lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Cold-start manual check (web)**

Run: `pnpm --filter @codaco/interviewer-v7 dev`

In a fresh browser profile (or after clearing local storage / Capacitor preferences / IndexedDB for the dev origin):

1. Open the dev URL. Expect: spinner briefly → welcome screen fades in → logo + headline + sub-line + button sequence in.
2. Click "Get started". Expect: setup wizard opens over the welcome screen. Welcome content remains visible behind the dialog.
3. Complete the wizard with any method (or click "Skip"). Expect: wizard closes; welcome content lifts and disperses (logo up, headline up, sub-line up, button drops) while the page wrapper fades; home screen fades in with its existing entrance animations.
4. Navigate between home and any of the secondary routes (protocols / sessions / settings) via the top action bar. Expect: smooth opacity crossfade on every route change.

If any of these expectations don't hold, the implementation is incomplete — fix and re-verify.

- [ ] **Step 4: Already-configured cold start**

Reload the same browser profile (now configured). Expect: spinner briefly → home screen fades in directly, no flash of /welcome.

- [ ] **Step 5: Lock screen unchanged**

Open settings, set the idle timeout to its shortest value, then leave the app alone. When idle expires, expect the lock screen modal to appear (covering the page tree) as it did before.

- [ ] **Step 6: Final commit (none needed if all prior tasks committed cleanly)**

Run: `git status`
Expected: nothing to commit; working tree clean.
