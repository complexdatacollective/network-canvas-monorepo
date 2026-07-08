# Interviewer: defer app-lock entirely to the inactivity timeout

**Date:** 2026-07-08
**App:** `apps/interviewer`

## Problem

The interviewer app locks (clears the in-memory session DEK) via two independent
triggers:

1. The user-configured **idle timeout** ("Auto-lock after", 1–60 min, default 15).
2. A separate **30-second blur/tab-hide lock** (`BLUR_LOCK_DELAY_MS`), which fires
   whenever the window blurs or the tab becomes hidden.

Trigger 2 means simply tabbing away from the app and back re-locks the session
after 30s. This is too aggressive. We want locking to be governed **solely** by
the inactivity timeout the user configures.

## Goal

Remove the 30-second blur/tab-hide lock. Locking is governed only by the
configured idle timeout. Time spent tabbed-away still counts as inactivity: on
returning to the tab, the app locks if — and only if — the user has been inactive
longer than their configured timeout.

## Why not just delete the blur handling

The idle timer is a `window.setTimeout`. Browsers throttle — and mobile browsers
freeze — timers in hidden/background tabs, so a backgrounded session's timer
cannot be trusted to fire on schedule. Relying on the running `setTimeout` alone
would let a session left in a frozen background tab stay unlocked indefinitely.

So instead of resetting the idle clock on return (today's `handleFocus` behaviour),
we recompute against real elapsed wall-clock time when the tab becomes visible.

## Design

### `src/lib/auth/idle.ts` — `useIdleTimer`

- Remove the `lockOnBlurMs` option, the `blurTimer`, and `handleBlur`.
- Track `lastActivityAt` (a `Date.now()` timestamp), stamped inside `resetIdle()` —
  i.e. on every activity event and on mount.
- Keep the activity listeners (`mousedown`, `mousemove`, `keydown`, `touchstart`,
  `wheel`) resetting the idle timer exactly as today.
- Replace the `blur` / `focus` / `visibilitychange` handlers with a single
  `visibilitychange` handler that acts only when the tab becomes **visible**:
  - `elapsed = Date.now() - lastActivityAt`
  - if `elapsed >= timeoutMs` → fire `onIdle` (lock) immediately
  - else → re-arm the idle timer for the **remaining** time (`timeoutMs - elapsed`),
    not a fresh full timeout
- Becoming hidden needs no special handling: the running timer keeps counting (and
  if the browser lets it fire while hidden, that is a correct lock); the
  visible-recompute is the safety net for throttled/frozen tabs.

`Date.now()` (wall-clock) is deliberate over `performance.now()`: a closed laptop
or slept device should count its elapsed time as inactivity.

### `src/lib/auth/AuthContext.tsx`

- Delete the `BLUR_LOCK_DELAY_MS` constant and its comment.
- Drop `lockOnBlurMs` from the `useIdleTimer({...})` call. Everything else stays:
  `enabled: state.kind === 'unlocked' && state.mode !== 'none'` already disables
  auto-lock when no security mode is enrolled.

### Unchanged

- The "Auto-lock after" setting and its copy stay — still accurate.
- The cross-tab vault-change force-lock (`storage` listener in `AuthContext`) is
  unrelated and untouched.
- `StatusRow`'s `focus`/`visibilitychange` listener (storage-durability re-read) is
  unrelated and untouched.

## Testing

Unit tests for `useIdleTimer` (fake timers + jsdom):

1. Fires `onIdle` after `timeoutMs` of inactivity.
2. An activity event resets the countdown.
3. Tab hidden then visible **after** the timeout has elapsed → locks on return.
4. Tab hidden then visible **before** the timeout → re-arms for the remaining time,
   does **not** lock, and does **not** grant a fresh full window (locks at the
   original deadline, not `timeoutMs` after return).

## Out of scope

- Any change to the settings UI, timeout options, or persisted schema.
- Any change to lock/unlock/DEK mechanics in `api.ts`.
