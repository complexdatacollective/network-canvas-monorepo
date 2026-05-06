# `@codaco/interview`

The Network Canvas interview engine — packaged so any React host can embed
the survey UI a participant interacts with. Owns the Redux store, stage
navigation, all 17 interface implementations (NameGenerator, Sociogram,
CategoricalBin, Geospatial, …), the dialog system, the toast system, and
the design tokens. The host owns the network calls (sync, finish, asset
URL resolution) and where the participant currently is in the protocol.

The intended hosts are Fresco (Next.js) and the new Architect preview
mode (Vite) — but the package has no awareness of either.

---

## Install

```sh
pnpm add @codaco/interview
```

**Peer dependencies** (you most likely already have these):

```jsonc
{
  "@codaco/fresco-ui": "^2.5.4",
  "@codaco/protocol-validation": "^11.5.0",
  "@codaco/shared-consts": "5.0.0",
  "@codaco/tailwind-config": "^1.0.0-alpha.11",
  "immer": "^11.1.4",
  "motion": "^12.38.0",
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "tailwindcss": "^4.2.4",
}
```

### Tailwind

The package assumes the host has a Tailwind v4 build plugin wired up
(`@tailwindcss/vite` for Vite, `@tailwindcss/postcss` for Next.js / any
PostCSS pipeline). Each CSS file in the chain owns one concern, and
consumers import them in order:

```css
/* styles/globals.css */
@import "@codaco/tailwind-config/fresco.css"; /* Tailwind v4 + theme + plugins + fonts */
@import "@codaco/fresco-ui/styles.css";       /* @source for fresco-ui's dist */
@import "@codaco/interview/styles.css";       /* @source for interview's dist */
```

**Do not also `@import "tailwindcss"` yourself.** That import lives
inside `@codaco/tailwind-config/fresco.css`; adding it again loads
Tailwind's runtime twice and produces duplicate / conflicting
utilities.

Each of `@codaco/fresco-ui/styles.css` and `@codaco/interview/styles.css`
is a tiny file containing only a `@source "./**/*.{js,ts,tsx}"`
directive scoped to that package's compiled JS in `dist/`. With both
imported, Tailwind's class scanner walks both packages' output and
emits every utility class the components reference. Hosts no longer
need to write `@source '../node_modules/...'` lines themselves.

`@codaco/tailwind-config/fresco.css` bundles both the default and
interview theme variants. The interview theme only activates while
`Shell` is mounted (Shell sets `data-theme-interview` on `<html>` via a
`useLayoutEffect`), so your host UI is unaffected at all other times.

### Vitest / jsdom

Node has no CSS loader, so any vitest test that imports from
`@codaco/interview` (even just the schemas) needs Vite to process
the package, otherwise you get
*"TypeError: Unknown file extension `.css`"*. Inline the package on
every project that uses jsdom:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    server: {
      deps: { inline: ['@codaco/interview'] },
    },
  },
});
```

---

## The Shell component

```tsx
import {
  Shell,
  InterviewToastViewport,
  interviewToastManager,
  type InterviewPayload,
} from '@codaco/interview';
```

A complete minimal host (TypeScript / Next.js App Router style — the
shape is identical for any other React framework):

```tsx
'use client';

import {
  Shell,
  InterviewToastViewport,
  interviewToastManager,
  type AssetRequestHandler,
  type FinishHandler,
  type InterviewPayload,
  type SyncHandler,
} from '@codaco/interview';
import { Toast } from '@base-ui/react/toast';
import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function InterviewClient({
  payload,
  resolveAssetUrl,
}: {
  payload: InterviewPayload;
  resolveAssetUrl: (assetId: string) => Promise<string>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  // currentStep is HOST state — the package never owns it. Keep it in
  // useState, nuqs, a context, the URL, wherever fits the host. The
  // package re-renders when the prop changes.
  const [currentStep, setCurrentStep] = useState<number>(() =>
    Number(params.get('step') ?? payload.session.currentStep),
  );

  const onStepChange = useCallback(
    (step: number) => {
      setCurrentStep(step);
      const next = new URLSearchParams(params.toString());
      next.set('step', String(step));
      router.replace(`?${next.toString()}`);
    },
    [params, router],
  );

  // Persist state on every reducer commit. Receives the full session
  // payload — POST it to your server, write to IndexedDB, anything.
  const onSync: SyncHandler = useCallback(
    async (interviewId, session) => {
      await fetch(`/interview/${interviewId}/sync`, {
        method: 'POST',
        body: JSON.stringify(session),
      });
    },
    [],
  );

  // Called when the participant clicks Finish on the FinishSession
  // stage. Receives an AbortSignal so you can cancel any in-flight work
  // if the user backs out.
  const onFinish: FinishHandler = useCallback(
    async (interviewId, signal) => {
      await fetch(`/interview/${interviewId}/finish`, { method: 'POST', signal });
      router.push(`/interview/${interviewId}/complete`);
    },
    [router],
  );

  // Stages reference protocol assets by ID. The package calls this
  // exactly when a stage needs a URL — return a same-origin URL,
  // pre-signed S3 URL, blob: URL, whatever your storage uses.
  const onRequestAsset: AssetRequestHandler = useCallback(
    (assetId) => resolveAssetUrl(assetId),
    [resolveAssetUrl],
  );

  return (
    <Toast.Provider toastManager={interviewToastManager}>
      <Shell
        payload={payload}
        currentStep={currentStep}
        onStepChange={onStepChange}
        onSync={onSync}
        onFinish={onFinish}
        onRequestAsset={onRequestAsset}
      />
      <InterviewToastViewport />
    </Toast.Provider>
  );
}
```

### Why is `currentStep` host state?

So the host can drive it however it likes — `nuqs` URL params, browser
history, a stepper UI, deep links from email, server-rendered initial
position. The package reads `currentStep` and emits `onStepChange` for
every navigation; it does not maintain its own copy.

This is also what allows the host to mount `Shell` once but render
different stages without re-creating the Redux store: only the
`currentStep` prop changes between renders.

### Shell props

| Prop              | Type                        | Required | Notes |
| ----------------- | --------------------------- | -------- | ----- |
| `payload`         | `InterviewPayload`          | yes      | `{ session, protocol }` — see the type for shape. The store is created once per `payload.session.id`; pass a stable reference. |
| `currentStep`     | `number`                    | yes      | The stage index the participant is on. Owned by the host. |
| `onStepChange`    | `(step: number) => void`    | yes      | Fired whenever the participant navigates. The host should mirror `step` into its own state. |
| `onSync`          | `(id, session) => Promise`  | yes      | Called after every Redux commit. Persist the session however you like. |
| `onFinish`        | `(id, AbortSignal) => Promise` | yes   | Called from the FinishSession stage. The signal aborts if the user navigates away mid-flight. |
| `onRequestAsset`  | `(assetId) => Promise<url>` | yes      | Resolve a protocol asset to a URL. Called lazily as stages mount. |
| `analytics`       | `InterviewAnalyticsMetadata`| yes      | Host metadata attached as super-properties on every event: `installationId` (anonymous host UUID), `hostApp` (e.g. `"Fresco"`), `hostVersion?`. |
| `posthogClient`   | `PostHog` (from posthog-js) | no       | Pre-initialised PostHog client. When provided, the package emits events through it without modifying its config. When absent, the package lazy-initialises its own named instance against `ph-relay.networkcanvas.com`. |
| `disableAnalytics`| `boolean`                   | no       | When `true`, all event emission is suppressed (no `posthog-js` import). Default `false`. Use for E2E and synthetic-interview runs. |
| `flags`           | `{ isE2E?, isDevelopment? }`| no       | `isE2E: true` exposes `window.__interviewStore` for Playwright fixtures. `isDevelopment: true` enables redux-logger. |

The package replaces a previous `onError` callback with internal `posthog.captureException` calls; render errors and asset-load failures are reported via the resolved analytics client (or suppressed when `disableAnalytics` is `true`). The host does not need to wire its own error sink.

#### Analytics

The interview package emits PostHog events directly — there is no `onError`-style host bridge. Three operating modes:

1. **Host-supplied client** — pass `posthogClient`; the package emits via the host's instance, with `distinct_id` overridden per event to the interview id. Host instance config (autocapture, identify, session recording) is the host's responsibility.
2. **Own instance** — omit `posthogClient`; the package lazy-imports `posthog-js` and inits a named instance (`'@codaco/interview'`) against `https://ph-relay.networkcanvas.com`.
3. **Disabled** — pass `disableAnalytics={true}`; no events emitted, no posthog-js import.

PII contract: events never include protocol-network data, protocol-author content (stage labels, prompt text, codebook labels, asset names), or participant input (form values, free-text, alter labels, search queries, passphrases). Events include only structural identifiers (stage type/index, prompt index, random node/edge UUIDs), codebook **internal ids** (e.g. `"person"`, `"friend"`), counts, durations, and package-defined discriminators.

The full event taxonomy lives at [`docs/superpowers/specs/2026-05-05-interview-analytics-design.md`](../../docs/superpowers/specs/2026-05-05-interview-analytics-design.md).

### Toast viewport

The package routes toasts through a Base UI `Toast.Provider` you mount.
Render exactly one `<InterviewToastViewport />` somewhere inside that
provider — it controls position, animation, and z-index for all toasts
the package emits (validation errors, save indicators, etc.).

```tsx
<Toast.Provider toastManager={interviewToastManager}>
  <Shell {...props} />
  <InterviewToastViewport />
</Toast.Provider>
```

You can also enqueue your own toasts against `interviewToastManager`
from anywhere in the host tree — useful for surfacing app-level
errors inside the same viewport.

---

## Building an `InterviewPayload` server-side

The package never reaches into the host's database. Your server hands
over a fully resolved `{ session, protocol }` object, with all
`asset://` URLs already mapped to the IDs `onRequestAsset` will be
called with.

```ts
import {
  type InterviewPayload,
  type ProtocolPayload,
  isValidAssetType,
} from '@codaco/interview';
import { hashProtocol } from '@codaco/protocol-validation';

export async function loadInterviewPayload(interviewId: string): Promise<InterviewPayload> {
  const interview = await db.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: { protocol: true },
  });

  // protocol assets come from your DB / object store — flatten to the
  // shape the package consumes
  const assets = interview.protocol.assets
    .filter((a) => isValidAssetType(a.type))
    .map((a) => ({
      assetId: a.id,
      name: a.name,
      type: a.type,
      ...(a.value ? { value: a.value } : {}), // apikey assets only
    }));

  const protocol: ProtocolPayload = {
    ...interview.protocol,
    // Content hash of { codebook, stages }. Computed at protocol-import time
    // by `hashProtocol` from @codaco/protocol-validation; forwarded here as a
    // super-property on every analytics event.
    hash: interview.protocol.hash ?? hashProtocol(interview.protocol),
    importedAt: interview.protocol.importedAt.toISOString(),
    assets,
  };

  return {
    session: {
      id: interview.id,
      // … the rest of SessionPayload — see the type for the full shape
      network: interview.network ?? createInitialNetwork(),
      currentStep: interview.currentStep ?? 0,
      stageMetadata: interview.stageMetadata,
      // …
    },
    protocol,
  };
}
```

`createInitialNetwork()` returns the canonical empty network with an ego
node already initialised — call it once when you create a new interview
record so subsequent loads pass schema validation.

---

## Public API reference

Everything below is exported from `'@codaco/interview'`. There are no
sub-path exports — host code never reaches into the package's internals.

### Components

- `Shell` — the runtime
- `InterviewToastViewport` — Base UI toast viewport mounted next to `Shell`

### Singletons

- `interviewToastManager` — the toast manager passed into `Toast.Provider`

### Schemas + helpers

- `StageMetadataSchema` — Zod schema for `session.stageMetadata`. Use it
  to validate state restored from your database before passing it back
  into a payload.
- `createInitialNetwork()` — empty network with ego seeded. Call once
  per new interview.
- `isValidAssetType(type)` — type predicate for `ResolvedAsset.type`.
- `getNodeLabelAttribute(variables, attributes)` — pick the variable
  whose value should be displayed as a node's label. Used by sibling
  packages (e.g. `@codaco/network-exporters`) so exports use the same
  labelling logic the UI does.

### Synthetic data

- `generateNetwork(codebook, stages, seed?, options?)` — deterministic
  network generator that walks a protocol's stages and produces nodes,
  edges, ego attributes, and stage metadata. Use it for storybook
  fixtures, load tests, and the synthetic preview mode.
- `GenerateNetworkOptions`, `GenerateNetworkResult` — companion types.

### Public types

```ts
type InterviewPayload = { session: SessionPayload; protocol: ProtocolPayload };

type SessionPayload = SessionState; // the Redux session shape
type ProtocolPayload = Omit<CurrentProtocol, 'assetManifest'> & {
  id: string;
  importedAt: string; // ISO
  assets: ResolvedAsset[];
};

type ResolvedAsset = {
  assetId: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'network' | 'geojson' | 'apikey';
  value?: string; // apikey only
};

type SyncHandler         = (interviewId: string, session: SessionPayload) => Promise<void>;
type FinishHandler       = (interviewId: string, signal: AbortSignal)      => Promise<void>;
type AssetRequestHandler = (assetId: string)                               => Promise<string>;
type ErrorHandler        = (error: Error, ctx?: Record<string, unknown>)   => void;
type StepChangeHandler   = (step: number)                                  => void;

type InterviewerFlags = {
  isE2E?: boolean;
  isDevelopment?: boolean;
};
```

---

## Theming & DOM scope

`Shell` renders a single `<main data-theme-interview>` element AND
mirrors the same attribute onto `<html>` via a `useLayoutEffect` so
the interview theme's `:root[data-theme-interview]` selectors match.
That puts the responsive `font-size` scale (16/18/20px at tablet /
desktop) on the document root, so `1rem` updates document-wide while
Shell is mounted and every text-* / spacing utility scales together.
The attribute is removed on unmount, restoring the host's typography.

---

## Testing the integration

### Unit / component tests (Vitest + jsdom)

See the *Vitest / jsdom* note above — inline `@codaco/interview` in
your config so the CSS side effect resolves cleanly.

### End-to-end (Playwright)

For e2e you usually want a deterministic stand-in for the host's data
layer. The package supports this through the `isE2E` flag, which
exposes the live Redux store as `window.__interviewStore` so fixtures
can read network state without hitting your database:

```ts
<Shell {...props} flags={{ isE2E: true }} />
```

The package's own e2e suite (in this repo) uses a Vite host that
implements `window.__test` hooks for `installProtocol` / `createInterview` /
`reset`, runs in the official `mcr.microsoft.com/playwright` image for
font-rendering determinism, and asserts against per-stage screenshots in
`e2e/visual-snapshots/{chromium,firefox,webkit}/`. Use it as a
reference for wiring your own e2e setup — see `packages/interview/e2e/`.

---

## What lives in this package, what doesn't

In:
- the Redux store + every reducer / selector / thunk
- all 17 stage interfaces and the navigation chrome
- the dialog system, toast system, and stage error boundary
- the synthetic network generator
- the contract types and the schemas the host serialises against

Out:
- everything that touches a database, a session cookie, or the network
- protocol parsing and validation (use `@codaco/protocol-validation`)
- export to GraphML / CSV (use `@codaco/network-exporters`)
- network filtering / query DSL (use `@codaco/network-query`)

When in doubt: if it would still make sense to ship it embedded inside a
non-Fresco host (Architect's preview mode, a CLI, an Electron app), it
belongs here. If it talks to Fresco's Postgres or its auth layer, it
doesn't.

---

## License

MIT — see the repository root.
