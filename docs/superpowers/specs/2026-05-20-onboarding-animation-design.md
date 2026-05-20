# Onboarding animation

## Background

`apps/interviewer-v7` currently auto-opens the security setup wizard
the moment `AuthGate` detects `state.kind === 'unconfigured'`. The
wizard appears over an empty `<div className="min-h-dvh" aria-hidden />`
placeholder. There is no welcome screen, no introductory text, and no
visible app identity before the wizard takes over.

We're adding a dedicated onboarding screen that shows once, on first
launch, before the wizard. It introduces the app, then hands off to
the wizard via a "Get started" button. When the wizard completes (or
is skipped), the onboarding screen animates out and the home screen
animates in, sharing a single app-wide page-transition system.

Side effect: the page-transition system becomes the route-change
animation for the rest of the app's routes too. This is intentional —
the welcome→home transition is the first use case but the wrapper
applies to every route change.

## Goals

1. New `WelcomeRoute` at `/welcome` that renders an `OnboardingScreen`
   with a centred logo, headline ("Welcome to Network Canvas
   Interviewer"), sub-line ("Let's set up this device."), and a
   "Get started" button.
2. App-wide page-transition wrapper using `AnimatePresence mode="wait"`
   - a keyed `motion.div` in `App.tsx`, with `when: 'beforeChildren'`
     orchestration on the wrapper's opacity fade.
3. Lift-and-disperse exit choreography on the welcome screen's
   elements, composed with the page wrapper's crossfade.
4. `AuthGate` switches from auto-opening the wizard to redirecting
   between `/welcome` and `/` based on auth `kind`.
5. The wizard is triggered from the "Get started" button via the
   existing `useSetupWizard()` hook.

Non-goals:

- Modifying the wizard itself or its existing post-completion flow.
- Refactoring `HomeRoute`'s existing entrance animations
  (`BrandHeader`, `ResumePill`, `StatusRow`, etc. keep their current
  `initial`/`animate` props).
- Showing the onboarding screen on anything other than first launch
  (after `revoke()`, the same flow runs because `kind` returns to
  `'unconfigured'` — but this is incidental, not a designed feature).
- Adding a "Skip the intro" preference.

## Design

### Component map

| Path                                        | Responsibility                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                               | Adds the `AnimatePresence` + keyed page wrapper around the existing `<Switch>`. Adds `/welcome` route.                                                                       |
| `src/components/AuthGate.tsx`               | Drops the auto-open wizard `useEffect`. Adds redirect effects for `unconfigured` ↔ `/welcome`. Returns `children` for `'unconfigured'` (was placeholder).                    |
| `src/routes/Welcome.tsx` (new)              | Route component. Renders `<OnboardingScreen />`. No auth logic of its own.                                                                                                   |
| `src/components/OnboardingScreen.tsx` (new) | Presentational. Centred logo + headline + sub-line + "Get started" button. Owns its motion variants. Calls `useSetupWizard().openSetupWizard()` from the button's `onClick`. |

### App.tsx restructure

The `<AuthGate>` continues to wrap the route tree. A new
`<AnimatePresence mode="wait">` + keyed `<motion.div>` wraps the
`<Switch>` inside it. A new `<Route path="/welcome" component={WelcomeRoute} />`
is added to the `<Switch>`.

```jsx
const pageWrapperVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { when: 'beforeChildren', duration: 0.4 },
  },
  exit: { opacity: 0, transition: { duration: 0.4 } },
};

function App() {
  const [location] = useLocation();
  return (
    <AppProviders>
      <ThemedRegion theme="interview" className="isolate">
        {isElectron && <div aria-hidden className="app-drag fixed inset-x-0 top-0 z-50 h-8" />}
        <motion.div className="fixed inset-0 -z-10 blur-[10rem]" {...blobFadeIn}>
          <BackgroundBlobs ... />
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

The nested `<Switch>` inside `<AppShell>` also takes `location={location}`
so it sees the same location wouter is tracking — defensive, since the
outer key change is what drives the animation.

### AuthGate changes

Before:

```jsx
useEffect(() => {
  if (kind !== 'unconfigured' || openedRef.current) return;
  openedRef.current = true;
  void openSetupWizard().finally(() => {
    openedRef.current = false;
  });
}, [kind, openSetupWizard]);

if (kind === 'loading') return <Spinner... />;
if (kind === 'unconfigured') return <div className="min-h-dvh" aria-hidden />;
if (kind === 'locked') return <LockScreen />;
return <>{children}</>;
```

After:

```jsx
const [location, navigate] = useLocation();

useEffect(() => {
  if (kind === 'unconfigured' && location !== '/welcome') {
    navigate('/welcome', { replace: true });
  } else if (kind === 'unlocked' && location === '/welcome') {
    navigate('/', { replace: true });
  }
}, [kind, location, navigate]);

if (kind === 'loading') return <Spinner... />;
if (kind === 'locked') return <LockScreen />;
return <>{children}</>;
```

`useSetupWizard` and its `openedRef` are no longer used here; the
import goes too. The wizard is opened from `OnboardingScreen` via the
"Get started" button.

For `kind === 'unconfigured'`, `AuthGate` now returns `children` (the
route tree), allowing `/welcome` to render. The redirect effect runs
on every render where `kind`/`location` change; if the user is on
`/welcome` while unconfigured, no redirect fires.

### OnboardingScreen

Single full-viewport container, centred contents:

```jsx
const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      when: 'beforeChildren',
      staggerChildren: 0.18,
      delayChildren: 0.05,
    },
  },
  exit: { transition: { staggerChildren: 0.05, when: 'afterChildren' } },
};

const logoVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: -180,
    scale: 0.96,
    transition: { duration: 0.7, ease: [0.32, 0, 0.67, 0] },
  },
};

const headlineVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  exit: { opacity: 0, y: -40, transition: { duration: 0.55 } },
};

const sublineVariants = headlineVariants; // same shape

const buttonVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: 40, transition: { duration: 0.5 } },
};

function OnboardingScreen() {
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
      <motion.div variants={headlineVariants}>
        <Heading level="h1" margin="none" className="font-black tracking-tight">
          Welcome to Network Canvas Interviewer
        </Heading>
      </motion.div>
      <motion.p variants={sublineVariants} className="text-base">
        Let's set up this device.
      </motion.p>
      <motion.div variants={buttonVariants} className="mt-2">
        <Button variant="primary" onClick={handleStart}>
          Get started
        </Button>
      </motion.div>
    </motion.div>
  );
}
```

Variants inherit through the motion tree, so each child only needs to
declare its own keyframes — the parent's `animate="visible"` /
`exit="exit"` state propagates down. The container's `staggerChildren`
sequences logo → headline → sub → button on entrance with 0.18s
spacing, and a tight 0.05s spacing on exit so the lift-and-disperse
feels like a single coordinated motion.

`when: 'beforeChildren'` on visible: page wrapper opacity completes →
container's children stagger in. `when: 'afterChildren'` on exit:
children play lift-and-disperse → container settles → outer page
wrapper opacity fades.

### Welcome route

Trivial wrapper:

```jsx
// src/routes/Welcome.tsx
import { OnboardingScreen } from '~/components/OnboardingScreen';

export function WelcomeRoute() {
  return <OnboardingScreen />;
}
```

A `WelcomeRoute` component (rather than passing `OnboardingScreen`
directly to `<Route component={...}>`) keeps the import graph mirrored
to the other routes in `src/routes/` and gives us a natural place to
add data-fetching later if needed.

### Hand-off behaviour

1. App cold-starts. `AuthGate.kind === 'loading'`, spinner shown.
2. Auth resolves to `'unconfigured'`. `AuthGate`'s redirect effect
   fires `navigate('/welcome', { replace: true })`. AuthGate now
   returns `children`. The page wrapper mounts with `key="/welcome"`,
   plays its entrance (wrapper opacity in → container's stagger in).
3. User clicks "Get started". `openSetupWizard()` opens the wizard
   over the welcome screen (which stays visible behind the dialog).
4. Wizard completes (or is skipped — both paths call `refresh()`).
   `kind` flips to `'unlocked'`.
5. `AuthGate`'s redirect effect fires `navigate('/', { replace: true })`.
6. Page wrapper sees the key change. `mode="wait"` runs `/welcome`'s
   exit: children lift-and-disperse → wrapper fades. Then `/`
   mounts: wrapper fades in → `HomeRoute` renders, its existing
   entrance animations play.

### LockScreen backdrop

`LockScreen` currently uses fresco-ui's `Dialog` with `dismissible={false}`.
Today, `AuthGate` returns only `<LockScreen />` when `kind === 'locked'`,
which hides any underlying route. With this change, `kind === 'locked'`
still short-circuits to `<LockScreen />` and never renders `children`,
so behaviour is unchanged. No backdrop work needed.

## Edge cases

1. **Re-clicking "Get started"**. Guarded by `openedRef` inside
   `OnboardingScreen` (same pattern as the current `AuthGate`).

2. **Wizard "Skip" path**. `useSetupWizard` already handles this by
   calling `enrolWithoutLock()` and `refresh()`. `kind` flips to
   `'unlocked'`, redirect runs, transition plays — identical to the
   success path.

3. **Direct navigation to `/welcome` after setup**. If a configured
   user lands on `/welcome` (manual URL, deep link), the redirect
   effect bounces them to `/`. A brief render of the welcome screen
   may flash. Mitigation: if the flash is noticeable in practice,
   switch the redirect effect to `useLayoutEffect`. To be decided
   during implementation.

4. **Cold start with auth configured**. `kind` goes
   `'loading'` → `'unlocked'` (or `'locked'`). No redirect (location
   isn't `/welcome`). Normal home/lock flow.

5. **Existing route entrance animations**. `BrandHeader`,
   `ResumePill`, `StatusRow`, etc. keep their current `initial`/
   `animate` props (not variants). They animate on mount, after the
   page wrapper finishes its opacity fade-in. Not coordinated with
   the wrapper, but visually fine because the wrapper duration (0.4s)
   is shorter than most of their delays.

## Files

New:

- `apps/interviewer-v7/src/routes/Welcome.tsx`
- `apps/interviewer-v7/src/components/OnboardingScreen.tsx`

Modified:

- `apps/interviewer-v7/src/App.tsx`
- `apps/interviewer-v7/src/components/AuthGate.tsx`

## Verification

Manual:

- Cold-start the web build with a fresh storage profile. Confirm
  the welcome screen plays its entrance, the button opens the wizard,
  and on wizard completion the lift-and-disperse + home entrance
  plays.
- Repeat for skip path.
- Confirm route changes within the app (e.g. home → protocols)
  crossfade via the new page wrapper.
- Cold-start with already-configured auth. Confirm home loads
  directly without flash.
- Open the lock screen (set short idle timeout, wait it out).
  Confirm lock behaviour unchanged.

Automated:

- `pnpm typecheck` clean.
- `pnpm lint` clean.
- No existing tests cover `AuthGate` route transitions; not adding
  new tests for the animation itself (timing is visual, not asserted).
