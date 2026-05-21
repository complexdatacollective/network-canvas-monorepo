# Sample protocol ghost card + ghost-import pattern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Install sample protocol" affordance to the home screen via a ghost deck card, and generalise the same ghost-card pattern to all imports (file, drag, URL): the import dialog closes the moment an import starts, a ghost card in the deck shows progress, and the ghost transitions into the final `DeckCard` on success (or vanishes on failure).

**Architecture:** `DeckEntry` gains two kinds — `sample` and `pending` — alongside the existing `protocol` and `import`. `HomeRoute` owns the lifecycle: a `pendingImports[]` slice plus a `startImport(request)` helper. `ImportDialog` collapses to a source picker that calls `onSubmit(request)` and closes. `importProtocolFromFile` / `importProtocolFromUrl` gain an additive `onProgress` callback; the URL path streams via `response.body.getReader()` for determinate fetch progress. `StoredSettings.sampleProtocolDismissed: boolean` controls the sample card; a Settings toggle restores it, and a successful sample install auto-dismisses.

**Tech Stack:** React 19, motion/react, swiper (carousel), wouter (routing), `@codaco/fresco-ui` (Dialog/Button/Toast/ToggleField/ProgressBar), `@codaco/art` (Pattern), Vite + Biome (tabs, 120 cols, double quotes).

**Spec:** `apps/interviewer-v7/docs/superpowers/specs/2026-05-21-sample-protocol-ghost-card-design.md`

**Verification model:** The renderer has no component tests — every existing `.test.ts` lives under `src/lib/auth/__tests__/`. Per-task gates are `pnpm typecheck` (from `apps/interviewer-v7`) and `pnpm lint:fix` (from the repo root). The final task is end-to-end visual verification in a real browser. Do not add a component-test stack just for this work. The one task that adds a _logic_ test is Task 3 (importProtocol progress callback), which is testable in isolation.

---

## File map

| File                                                                    | Action         | Responsibility                                                                                          |
| ----------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/interviewer-v7/src/lib/db/types.ts`                               | Modify (light) | Add `sampleProtocolDismissed: boolean` to `StoredSettings` + `DEFAULT_SETTINGS`.                        |
| `apps/interviewer-v7/src/lib/protocol/sampleProtocol.ts`                | Create         | `SAMPLE_PROTOCOL` constant (url + name + description).                                                  |
| `apps/interviewer-v7/src/lib/protocol/importProtocol.ts`                | Modify (heavy) | Add `OnProgress` callback; switch URL path to streaming reader; emit phase events.                      |
| `apps/interviewer-v7/src/lib/protocol/__tests__/importProtocol.test.ts` | Create         | Unit test for the URL path's progress events.                                                           |
| `apps/interviewer-v7/src/components/ProtocolCarousel/DeckCard.tsx`      | Modify (heavy) | Add `PendingImport` type + extend `DeckEntry`; add `sample` and `pending` card variants.                |
| `apps/interviewer-v7/src/components/ProtocolCarousel/ProtocolDeck.tsx`  | Modify (light) | Accept `showSampleCard` + `pendingImports` + handlers; build the new deck order; render new kinds.      |
| `apps/interviewer-v7/src/components/ImportDialog.tsx`                   | Modify (heavy) | Drop progress/success modes; new `onSubmit(request)` prop; close on submit.                             |
| `apps/interviewer-v7/src/routes/Home.tsx`                               | Modify (heavy) | Own `pendingImports` state + `startImport()`; thread sample/pending into the deck; auto-dismiss sample. |
| `apps/interviewer-v7/src/components/SettingsDialog.tsx`                 | Modify (light) | New "Show sample protocol on home screen" toggle in the About section.                                  |

No new dependencies. No barrel files. No re-exports for convenience (existing imports continue to come from the same source modules).

---

### Task 1: Add `sampleProtocolDismissed` to `StoredSettings`

Foundational type change. Both Dexie and Electron settings stores already round-trip the full `StoredSettings` object, so no per-backend migration is needed — the default is picked up automatically.

**Files:**

- Modify: `apps/interviewer-v7/src/lib/db/types.ts`

- [ ] **Step 1: Add the field to `StoredSettings` and `DEFAULT_SETTINGS`**

In `types.ts`, locate the `StoredSettings` type (currently around line 105) and `DEFAULT_SETTINGS` (currently around line 124). Apply both edits.

```ts
export type StoredSettings = {
  id: 'device';
  exportGraphML: boolean;
  exportCSV: boolean;
  useScreenLayoutCoordinates: boolean;
  screenLayoutHeight: number;
  screenLayoutWidth: number;
  dismissedUpdates: string[];
  lastActiveProtocolHash?: string;
  lastActiveSessionId?: string;
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnResume: boolean;
  requireUnlockOnExport: boolean;
  sampleProtocolDismissed: boolean;
};

export const DEFAULT_SETTINGS: StoredSettings = {
  id: 'device',
  exportGraphML: true,
  exportCSV: true,
  useScreenLayoutCoordinates: false,
  screenLayoutHeight: 1080,
  screenLayoutWidth: 1920,
  dismissedUpdates: [],
  idleTimeoutMinutes: 15,
  requireUnlockOnResume: true,
  requireUnlockOnExport: false,
  sampleProtocolDismissed: false,
};
```

- [ ] **Step 2: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: passes. No call site currently references `sampleProtocolDismissed`, so adding it is purely additive.

- [ ] **Step 3: Lint + commit**

Run from the repo root:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/lib/db/types.ts
git commit -m "feat(interviewer-v7): add sampleProtocolDismissed setting"
```

---

### Task 2: Create the `SAMPLE_PROTOCOL` constant

Single source of truth for the sample protocol's URL and display metadata. Used by `HomeRoute` (to construct the install request) and `DeckCard`'s `sample` variant (to render heading + tagline).

**Files:**

- Create: `apps/interviewer-v7/src/lib/protocol/sampleProtocol.ts`

- [ ] **Step 1: Create the file**

```ts
export const SAMPLE_PROTOCOL = {
  url: 'https://documentation.networkcanvas.com/protocols/Sample%20Protocol%20v4.netcanvas',
  name: 'Sample Protocol',
  description:
    'A complete reference protocol from the Network Canvas team — useful for exploring how stages, prompts, and codebooks fit together.',
} as const;
```

(File uses tabs and double quotes per the interviewer-v7 Biome config.)

- [ ] **Step 2: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: passes. New module, no callers yet.

- [ ] **Step 3: Lint + commit**

Run from the repo root:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/lib/protocol/sampleProtocol.ts
git commit -m "feat(interviewer-v7): add SAMPLE_PROTOCOL constant"
```

---

### Task 3: Add `onProgress` to `importProtocol*` and stream URL downloads

Additive callback so callers that don't pass one (any existing call site) keep working unchanged. The URL path becomes streaming so the ghost card can show a determinate progress bar; the file path emits phase transitions only.

**Files:**

- Modify: `apps/interviewer-v7/src/lib/protocol/importProtocol.ts`
- Create: `apps/interviewer-v7/src/lib/protocol/__tests__/importProtocol.test.ts`

- [ ] **Step 1: Write the failing test first**

Create the test file with one focused case: `importProtocolFromUrl` emits a `fetching` event with `progress` for each chunk when `Content-Length` is present, and an `extracting` event after the body is buffered.

```ts
import { describe, expect, it, vi } from 'vitest';

import { type ImportPhase, importProtocolFromUrl } from '../importProtocol';

function streamingResponse(
  chunks: Uint8Array[],
  contentLength: number,
): Response {
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i] as Uint8Array);
        i += 1;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-length': String(contentLength) },
  });
}

describe('importProtocolFromUrl progress events', () => {
  it('emits fetching events with determinate progress, then extracting', async () => {
    const chunks = [new Uint8Array(40), new Uint8Array(60)];
    const total = 100;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(streamingResponse(chunks, total));
    vi.stubGlobal('fetch', fetchMock);

    const phases: { phase: ImportPhase; progress?: number }[] = [];
    const result = await importProtocolFromUrl(
      'https://example.test/protocol.netcanvas',
      (event) => {
        phases.push({ phase: event.phase, progress: event.progress });
      },
    );

    vi.unstubAllGlobals();

    // Extraction fails (the body is zero bytes, not a valid zip), but progress events still fire.
    expect(result.success).toBe(false);
    const fetching = phases.filter((p) => p.phase === 'fetching');
    expect(fetching.length).toBe(2);
    expect(fetching[0]?.progress).toBeCloseTo(0.4);
    expect(fetching[1]?.progress).toBeCloseTo(1);
    expect(phases.some((p) => p.phase === 'extracting')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — it must fail**

Run from `apps/interviewer-v7`:

```bash
pnpm vitest run src/lib/protocol/__tests__/importProtocol.test.ts
```

Expected: FAIL. `ImportPhase` is not exported and `importProtocolFromUrl` doesn't accept an `onProgress` argument.

- [ ] **Step 3: Refactor `importProtocol.ts` to support `onProgress` and streaming URL downloads**

Replace the file contents in `apps/interviewer-v7/src/lib/protocol/importProtocol.ts` with:

```ts
import JSZip from 'jszip';

import {
  type CurrentProtocol,
  detectSchemaVersion,
  type ExtractedAsset,
  getMigrationInfo,
  hashProtocol,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { saveProtocol } from '../db/api';

const APP_SCHEMA_VERSION = 8;

export type ImportPhase = 'fetching' | 'extracting' | 'saving';

export type ImportProgressEvent = {
  phase: ImportPhase;
  progress?: number;
};

export type OnImportProgress = (event: ImportProgressEvent) => void;

export type ImportProtocolSuccess = {
  success: true;
  protocol: CurrentProtocol;
  hash: string;
  migrated: boolean;
};

export type ImportProtocolFailure = {
  success: false;
  error:
    | 'fetch-failed'
    | 'extract-failed'
    | 'unsupported-version'
    | 'validation-failed'
    | 'save-failed';
  message: string;
  issues?: { path: string; message: string }[];
};

export type ImportProtocolResult =
  | ImportProtocolSuccess
  | ImportProtocolFailure;

async function extractZip(
  buffer: Uint8Array,
): Promise<{ protocol: unknown; assets: ExtractedAsset[] }> {
  const zip = await JSZip.loadAsync(buffer);
  const protocolJson = await zip.file('protocol.json')?.async('string');
  if (!protocolJson) {
    throw new Error('protocol.json not found in archive');
  }
  const protocol = JSON.parse(protocolJson) as Record<string, unknown>;
  const manifest =
    (protocol.assetManifest as Record<
      string,
      { type: string; name: string; source?: string; value?: string }
    >) ?? {};
  const assets: ExtractedAsset[] = [];
  for (const [assetId, def] of Object.entries(manifest)) {
    if (def.type === 'apikey') {
      assets.push({ id: assetId, name: def.name, data: def.value ?? '' });
      continue;
    }
    if (!def.source) continue;
    const fileData = await zip.file(`assets/${def.source}`)?.async('blob');
    if (!fileData) {
      throw new Error(`Asset file "${def.source}" not found for "${assetId}"`);
    }
    assets.push({ id: assetId, name: def.name, data: fileData });
  }
  return { protocol, assets };
}

async function importFromBuffer(
  buffer: Uint8Array,
  sourceName: string,
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  onProgress?.({ phase: 'extracting' });

  let extracted: { protocol: unknown; assets: ExtractedAsset[] };
  try {
    extracted = await extractZip(buffer);
  } catch (cause) {
    return {
      success: false,
      error: 'extract-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }

  const version = detectSchemaVersion(extracted.protocol);

  let migratedDocument: unknown = extracted.protocol;
  let didMigrate = false;
  if (version !== APP_SCHEMA_VERSION) {
    const info = getMigrationInfo(version, APP_SCHEMA_VERSION);
    if (!info.canMigrate) {
      return {
        success: false,
        error: 'unsupported-version',
        message: `Protocol schema version ${version} cannot be migrated to ${APP_SCHEMA_VERSION}.`,
      };
    }
    try {
      migratedDocument = migrateProtocol(
        extracted.protocol,
        APP_SCHEMA_VERSION,
        {
          name: sourceName.replace(/\.netcanvas$/i, ''),
        },
      );
      didMigrate = true;
    } catch (cause) {
      return {
        success: false,
        error: 'validation-failed',
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  const validation = await validateProtocol(
    migratedDocument as Parameters<typeof validateProtocol>[0],
  );
  if (!validation.success) {
    return {
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      issues: validation.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  const validated = validation.data as CurrentProtocol;
  const hash = hashProtocol(validated);

  onProgress?.({ phase: 'saving' });

  try {
    await saveProtocol(validated, hash, extracted.assets);
  } catch (cause) {
    return {
      success: false,
      error: 'save-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }

  return { success: true, protocol: validated, hash, migrated: didMigrate };
}

export async function importProtocolFromFile(
  file: File,
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  return importFromBuffer(buffer, file.name, onProgress);
}

export function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // fall through
  }
  return 'protocol.netcanvas';
}

async function readStreamedBuffer(
  response: Response,
  onProgress?: OnImportProgress,
): Promise<Uint8Array> {
  const body = response.body;
  if (!body) {
    onProgress?.({ phase: 'fetching' });
    return new Uint8Array(await response.arrayBuffer());
  }
  const reader = body.getReader();
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader
    ? Number.parseInt(contentLengthHeader, 10)
    : Number.NaN;
  const hasContentLength = Number.isFinite(contentLength) && contentLength > 0;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({
      phase: 'fetching',
      progress: hasContentLength ? received / contentLength : undefined,
    });
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

export async function importProtocolFromUrl(
  url: string,
  onProgress?: OnImportProgress,
): Promise<ImportProtocolResult> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'follow' });
  } catch (cause) {
    return {
      success: false,
      error: 'fetch-failed',
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
  if (!response.ok) {
    return {
      success: false,
      error: 'fetch-failed',
      message: `Server responded with ${response.status} ${response.statusText}`,
    };
  }
  const buffer = await readStreamedBuffer(response, onProgress);
  return importFromBuffer(buffer, deriveNameFromUrl(url), onProgress);
}
```

- [ ] **Step 4: Run the test — it must now pass**

Run from `apps/interviewer-v7`:

```bash
pnpm vitest run src/lib/protocol/__tests__/importProtocol.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: passes. Existing callers (`ImportDialog`) don't pass `onProgress`; the parameter is optional.

- [ ] **Step 6: Lint + commit**

Run from the repo root:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/lib/protocol/importProtocol.ts apps/interviewer-v7/src/lib/protocol/__tests__/importProtocol.test.ts
git commit -m "feat(interviewer-v7): emit phase + progress events from importProtocol"
```

---

### Task 4: Extend `DeckCard` with `sample` and `pending` variants

The render logic is the bulk of this task. The new types live alongside `DeckEntry`. Stays self-contained (no parent wiring yet) so the build stays green — these variants just aren't _created_ anywhere until Task 5.

**Files:**

- Modify: `apps/interviewer-v7/src/components/ProtocolCarousel/DeckCard.tsx`

- [ ] **Step 1: Add the new types alongside `DeckEntry`**

In `DeckCard.tsx`, replace the existing `DeckEntry` declaration (currently around line 64) with the extended union and the `PendingImport` type. Add a new `ImportPhase` import alongside the existing imports — `ProtocolWithCounts` is already imported, don't duplicate it.

Imports header (add the single new line; leave the existing `ProtocolWithCounts` import as-is):

```tsx
import type { ImportPhase } from '~/lib/protocol/importProtocol';
```

Types block:

```tsx
export type PendingImport = {
  id: string;
  label: string;
  source: 'file' | 'url' | 'sample';
  phase: ImportPhase;
  progress?: number;
};

export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'sample' }
  | { kind: 'pending'; pending: PendingImport }
  | { kind: 'import' };
```

- [ ] **Step 2: Extend `DeckCardProps` to thread sample handlers**

Update the existing `DeckCardProps` (currently around line 68) to optionally receive sample-specific callbacks. `onInstallSample` is fired when the sample card's body or "Install sample protocol" button is activated; `onDismissSample` is fired by the trash IconButton.

```tsx
type DeckCardProps = {
  entry: DeckEntry;
  cardWidth: number;
  cardHeight: number;
  isActive: boolean;
  sessionCount: number;
  onActivate: () => void;
  onDelete?: () => void;
  onInstallSample?: () => void;
  onDismissSample?: () => void;
};
```

- [ ] **Step 3: Render the `sample` variant**

Just after the existing `if (entry.kind === 'import')` block in `DeckCard`'s body, add the `sample` branch. Add `Download` to the existing `lucide-react` import.

Imports (modify the existing line):

```tsx
import { Download, Play, Plus, Trash2 } from 'lucide-react';
```

`sample` branch (insert after the `import` branch, before `const protocol = entry.protocol;`):

```tsx
if (entry.kind === 'sample') {
  const onSampleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onInstallSample?.();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onInstallSample?.()}
      onKeyDown={onSampleKeyDown}
      style={{
        width: cardWidth,
        height: cardHeight,
        boxShadow: INACTIVE_SHADOW,
        borderRadius: CARD_RADIUS_PX,
      }}
      className={`${cardBase()} ${importCardClass()} @container relative cursor-pointer`}
      aria-label="Install the sample protocol"
    >
      <div className="bg-surface text-sea-green inline-flex h-[84px] w-[84px] items-center justify-center rounded-full">
        <Download size={36} strokeWidth={2.5} aria-hidden />
      </div>
      <Heading level="h2" margin="none" className="text-text font-black">
        Sample Protocol
      </Heading>
      <div className="text-text/80 px-8 text-center text-sm">
        A complete reference protocol from the Network Canvas team — useful for
        exploring how stages, prompts, and codebooks fit together.
      </div>
      {isActive ? (
        <div className="mx-3 mb-3 flex items-center gap-2 @min-[320px]:mx-5 @min-[320px]:mb-5 @min-[380px]:mx-6 @min-[380px]:mb-6 @min-3xs:mx-4 @min-3xs:mb-4">
          <div className="@container h-9 min-w-0 flex-1 @min-[320px]:h-13 @min-[380px]:h-14 @min-3xs:h-11">
            <Button
              color="primary"
              icon={
                <Download
                  className="size-3 shrink-0 stroke-[3px]! @min-[240px]:size-4 @min-[300px]:size-5"
                  aria-hidden
                />
              }
              className="flex h-full w-full items-center justify-center gap-1.5 rounded-xl px-3 font-black tracking-[0.04em] uppercase @min-[240px]:gap-2 @min-[240px]:rounded-2xl @min-[240px]:px-4 @min-[240px]:tracking-[0.06em] @min-[300px]:gap-2.5 @min-[300px]:px-5 @min-[300px]:tracking-[0.07em] @min-[360px]:gap-3 @min-[360px]:px-6 @min-[360px]:tracking-[0.08em]"
              onClick={(e) => {
                e.stopPropagation();
                onInstallSample?.();
              }}
            >
              <span className="min-w-0 truncate text-[10px] @min-[240px]:text-xs @min-[300px]:text-sm @min-[360px]:text-base">
                Install sample protocol
              </span>
            </Button>
          </div>
          {onDismissSample ? (
            <IconButton
              variant="text"
              icon={
                <Trash2
                  className="size-3 @min-[320px]:size-5 @min-3xs:size-4"
                  aria-hidden
                />
              }
              aria-label="Dismiss the sample protocol"
              onClick={(e) => {
                e.stopPropagation();
                onDismissSample();
              }}
              className="hover:bg-destructive! hover:text-destructive-contrast! h-9 shrink-0 @min-[320px]:h-13 @min-[380px]:h-14 @min-3xs:h-11"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Render the `pending` variant**

Add the `pending` branch right after the `sample` branch. The card mirrors the real protocol card chrome (Pattern banner derived from `pending.label` so the seeded gradient is stable for the same source) and replaces the description + Start row with phase text + a progress bar.

```tsx
if (entry.kind === 'pending') {
  const { pending } = entry;
  const palette = seedToPatternPalette(pending.label);
  const phaseLabel =
    pending.phase === 'fetching'
      ? 'Fetching…'
      : pending.phase === 'extracting'
        ? 'Extracting…'
        : 'Saving…';
  const determinate =
    typeof pending.progress === 'number' && Number.isFinite(pending.progress);
  const pct = determinate
    ? Math.min(1, Math.max(0, pending.progress as number)) * 100
    : 0;
  return (
    <div
      style={{
        width: cardWidth,
        height: cardHeight,
        borderRadius: CARD_RADIUS_PX,
        boxShadow: INACTIVE_SHADOW,
      }}
      className={`${cardBase()} ${protocolCardClass()} @container`}
      aria-label={`Importing ${pending.label}`}
      aria-busy="true"
    >
      <div className="relative flex w-full flex-col justify-between gap-4 overflow-hidden p-4 @min-3xs:min-h-[40%] @min-2xs:p-6">
        <Pattern
          seed={pending.label}
          className="absolute inset-0 size-full opacity-60"
        />
        <Heading
          level="h2"
          margin="none"
          className="relative text-lg leading-tight font-black tracking-tighter text-balance @min-[320px]:text-2xl @min-[380px]:text-3xl @min-3xs:text-xl @min-2xs:mt-2"
        >
          {pending.label}
        </Heading>
        <div className="font-monospace relative hidden items-center justify-between gap-2 text-[12px] @min-3xs:flex @min-xs:text-xs @min-sm:text-sm">
          <span style={{ color: palette.backgroundTop }}>{phaseLabel}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 pt-2 @min-2xs:px-6 @min-2xs:pt-3.5">
        <span className="text-text/80 text-xs @min-2xs:text-sm @min-xs:text-base @min-md:text-lg">
          {phaseLabel}
        </span>
      </div>
      <div className="mx-3 mb-3 @min-[320px]:mx-5 @min-[320px]:mb-5 @min-[380px]:mx-6 @min-[380px]:mb-6 @min-3xs:mx-4 @min-3xs:mb-4">
        <div
          className="bg-surface-2 relative h-2 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={determinate ? Math.round(pct) : undefined}
          aria-label={`Importing ${pending.label}: ${phaseLabel}`}
        >
          {determinate ? (
            <div
              className="bg-sea-green h-full transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="bg-sea-green/70 absolute inset-y-0 left-0 h-full w-1/3 animate-[shimmer_1.2s_linear_infinite]" />
          )}
        </div>
      </div>
    </div>
  );
}
```

(The indeterminate fallback uses a `shimmer` keyframe — that animation already exists in the renderer's Tailwind config; no new keyframe is needed. If `pnpm typecheck` is fine but the animation doesn't visually move, that's a styling polish item out of scope here.)

- [ ] **Step 5: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: passes. No call site yet emits `sample` or `pending` entries; the new variants are inert.

- [ ] **Step 6: Lint + commit**

Run from the repo root:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/components/ProtocolCarousel/DeckCard.tsx
git commit -m "feat(interviewer-v7): add sample and pending variants to DeckCard"
```

---

### Task 5: Wire `ProtocolDeck` to emit the new entry kinds

Have the deck build the new order (real protocols → sample → pending entries → import) and forward sample-specific handlers. Pending entries appear immediately after the sample slot so they read as "the next thing arriving" without disturbing the order of real protocols.

**Files:**

- Modify: `apps/interviewer-v7/src/components/ProtocolCarousel/ProtocolDeck.tsx`

- [ ] **Step 1: Extend `ProtocolDeckProps` to accept sample + pending inputs**

The existing `./DeckCard` import (currently around line 20) already brings in `DeckCard` and `type DeckEntry`. Add `type PendingImport` to that same import line — don't introduce a duplicate import.

Existing line:

```tsx
import { DeckCard, type DeckEntry } from './DeckCard';
```

Update to:

```tsx
import { DeckCard, type DeckEntry, type PendingImport } from './DeckCard';
```

Then replace the existing `ProtocolDeckProps` type (currently around line 54):

```tsx
type ProtocolDeckProps = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSessionLite[];
  initialProtocolHash?: string;
  showSampleCard: boolean;
  pendingImports: PendingImport[];
  onImport: () => void;
  onStartInterview: (protocolHash: string) => void;
  onDeleteProtocol: (hash: string) => void;
  onInstallSample: () => void;
  onDismissSample: () => void;
  newSessionProtocolHash?: string | null;
  onCancelNewSession?: () => void;
  onSessionCreated?: (session: StoredSession) => void;
};
```

- [ ] **Step 2: Build the new deck order**

Replace the existing `deck` `useMemo` (currently around line 119) so the order is real protocols → sample (when shown) → pending entries → import:

```tsx
const deck = useMemo<DeckEntry[]>(() => {
  const entries: DeckEntry[] = protocols.map((p) => ({
    kind: 'protocol',
    protocol: p,
  }));
  if (showSampleCard) entries.push({ kind: 'sample' });
  for (const pending of pendingImports)
    entries.push({ kind: 'pending', pending });
  entries.push({ kind: 'import' });
  return entries;
}, [protocols, showSampleCard, pendingImports]);
```

- [ ] **Step 3: Thread sample handlers into `DeckCard` + use stable keys**

Update the `<SwiperSlide>` and `<DeckCard>` block inside the Swiper (currently around line 383) so the new entry kinds get stable React keys and the sample card receives its handlers. Replace the body of the `deck.map(...)` with:

```tsx
{
  deck.map((entry, i) => {
    const isMorphingOut =
      entry.kind === 'protocol' &&
      entry.protocol.hash === newSessionProtocolHash;
    const key =
      entry.kind === 'import'
        ? 'import'
        : entry.kind === 'sample'
          ? 'sample'
          : entry.kind === 'pending'
            ? `pending-${entry.pending.id}`
            : entry.protocol.hash;
    return (
      <SwiperSlide
        key={key}
        style={{ width: cardWidth, height: cardHeight }}
        className="!flex origin-[center_bottom] items-center justify-center !overflow-visible will-change-transform"
      >
        {!isMorphingOut && (
          <DeckCard
            entry={entry}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            isActive={i === activeIdx}
            sessionCount={
              entry.kind === 'protocol'
                ? (sessionCounts.get(entry.protocol.hash) ?? 0)
                : 0
            }
            onActivate={() => handleActivate(i)}
            onDelete={
              entry.kind === 'protocol'
                ? () => onDeleteProtocol(entry.protocol.hash)
                : undefined
            }
            onInstallSample={
              entry.kind === 'sample' ? onInstallSample : undefined
            }
            onDismissSample={
              entry.kind === 'sample' ? onDismissSample : undefined
            }
          />
        )}
      </SwiperSlide>
    );
  });
}
```

- [ ] **Step 4: Route sample activation through `handleActivate`**

`handleActivate` currently handles `import` and `protocol` kinds (around line 172). Extend it so activating the sample slot calls `onInstallSample` (matching the import card's "click the card body or hit Enter to activate" semantics):

```tsx
const handleActivate = useCallback(
  (idx: number) => {
    if (idx !== activeIdx) {
      swiperRef.current?.slideTo(idx);
      return;
    }
    const entry = deck[idx];
    if (!entry) return;
    if (entry.kind === 'import') {
      onImport();
      return;
    }
    if (entry.kind === 'sample') {
      onInstallSample();
      return;
    }
    if (entry.kind === 'pending') {
      return; // pending cards are non-interactive
    }
    onStartInterview(entry.protocol.hash);
  },
  [activeIdx, deck, onImport, onInstallSample, onStartInterview],
);
```

- [ ] **Step 5: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: FAILS. `HomeRoute` calls `<ProtocolDeck ... />` without `showSampleCard`, `pendingImports`, `onInstallSample`, or `onDismissSample`. That's the bridge to Task 7. Hold here without committing yet — the build will be temporarily broken until the next two tasks land.

> If the engineer needs to commit incrementally to keep CI green, default the new props in `ProtocolDeck`'s destructure (`showSampleCard = false`, `pendingImports = []`, and `onInstallSample = () => {}`, `onDismissSample = () => {}`) and then remove those defaults at the end of Task 7. Either way is fine — pick one and be consistent.

- [ ] **Step 6: Commit (with the bridging defaults applied if you took that route)**

If you took the bridging-defaults route, the file typechecks now. Lint + commit:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/components/ProtocolCarousel/ProtocolDeck.tsx
git commit -m "feat(interviewer-v7): teach ProtocolDeck about sample and pending cards"
```

If you went the broken-build route, skip the commit — Task 7 will commit the combined fix.

---

### Task 6: Collapse `ImportDialog` to a source picker with `onSubmit(request)`

Today `ImportDialog` owns `mode` (source/uploading/done), `imported`, the success modal with "Start an interview" CTA, and even runs the importers itself. After this task, the dialog only renders the source-picker UI and calls back with an `ImportRequest` describing what to import. `HomeRoute` will do the work.

**Files:**

- Modify: `apps/interviewer-v7/src/components/ImportDialog.tsx`

- [ ] **Step 1: Rewrite `ImportDialog.tsx`**

Replace the file's contents with:

```tsx
import { CloudDownload, Folder, Upload } from 'lucide-react';
import type { DragEvent } from 'react';
import { useCallback, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { HomeModal } from '~/components/HomeModal';
import { pickProtocolFile } from '~/lib/files/pickFile';
import { deriveNameFromUrl } from '~/lib/protocol/importProtocol';

export type ImportRequest =
  | { source: 'file'; file: File; label: string }
  | { source: 'url'; url: string; label: string };

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (request: ImportRequest) => void;
};

function isProbablyValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

const codeChipClass = 'rounded-md bg-surface-2 px-2 py-0.5';

export function ImportDialog({ open, onClose, onSubmit }: ImportDialogProps) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setUrl('');
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const submitFile = useCallback(
    (file: File) => {
      onSubmit({ source: 'file', file, label: file.name });
      handleClose();
    },
    [handleClose, onSubmit],
  );

  const handleChooseFile = useCallback(async () => {
    const picked = await pickProtocolFile();
    if (!picked) return;
    submitFile(picked.file);
  }, [submitFile]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      submitFile(file);
    },
    [submitFile],
  );

  const handleFetchUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!isProbablyValidUrl(trimmed)) {
      toast.add({
        title: 'Invalid URL',
        description:
          'URL must start with https:// (or http:// for local servers).',
        variant: 'destructive',
      });
      return;
    }
    onSubmit({
      source: 'url',
      url: trimmed,
      label: deriveNameFromUrl(trimmed),
    });
    handleClose();
  }, [handleClose, onSubmit, toast, url]);

  const dropZoneBorder = dragOver ? 'border-sea-green' : 'border-outline';
  const dropZoneBackground = dragOver
    ? 'bg-[color-mix(in_srgb,var(--color-sea-green)_10%,var(--surface))]'
    : 'bg-surface';

  return (
    <HomeModal open={open} onClose={handleClose} title="Import a protocol">
      <Paragraph>
        Protocol files end in{' '}
        <code className={`mono ${codeChipClass}`}>.netcanvas</code> and
        configure every stage of the interview.
      </Paragraph>

      <button
        type="button"
        onClick={() => void handleChooseFile()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`text-text mb-[22px] block w-full cursor-pointer rounded-lg border-2 border-dashed px-8 py-11 text-center font-[inherit] transition-all duration-180 ${dropZoneBorder} ${dropZoneBackground}`}
      >
        <span
          aria-hidden
          className="bg-surface-2 text-sea-green mb-3.5 inline-flex h-[78px] w-[78px] items-center justify-center rounded-full"
        >
          <Upload size={32} aria-hidden />
        </span>
        <span className="mb-1.5 block text-xl font-extrabold">
          Drop a <code className={codeChipClass}>.netcanvas</code> file
        </span>
        <span className="inline-flex items-center gap-2 text-sm">
          <Folder size={16} strokeWidth={2.5} aria-hidden /> or use the file
          picker
        </span>
      </button>

      <div className="mx-1 my-5 flex items-center gap-3.5">
        <span aria-hidden className="bg-outline h-px flex-1" />
        <span className="uppercase">or</span>
        <span aria-hidden className="bg-outline h-px flex-1" />
      </div>

      <Surface as="section" level={1} spacing="md" noContainer>
        <Heading level="h4">Import from URL</Heading>
        <Paragraph intent="smallText">
          Paste a link to a hosted protocol file.
        </Paragraph>
        <div className="flex gap-2.5">
          <InputField
            type="url"
            value={url}
            onChange={(value) => setUrl(value ?? '')}
            placeholder="https://..."
            aria-label="Protocol URL"
            className="flex-1"
          />
          <Button
            color="primary"
            icon={<CloudDownload size={16} strokeWidth={2.5} aria-hidden />}
            onClick={handleFetchUrl}
            disabled={url.trim().length === 0}
          >
            Fetch
          </Button>
        </div>
      </Surface>
    </HomeModal>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: FAILS. `HomeRoute` passes `onImported`, not `onSubmit`. Hold — the next task fixes the call site.

- [ ] **Step 3: Hold off on commit**

The build is broken until Task 7 wires `HomeRoute`. Don't commit yet — the next task includes a combined commit.

---

### Task 7: Wire `HomeRoute` to own `pendingImports`, the sample card, and `startImport`

This is the integration task. `HomeRoute` gains a `pendingImports` state slice, a `startImport(request)` helper that creates a `PendingImport`, runs the importer with an `onProgress` callback that mutates the matching entry, and on completion removes it (auto-dismissing the sample card if the source was the sample).

**Files:**

- Modify: `apps/interviewer-v7/src/routes/Home.tsx`

- [ ] **Step 1: Add the imports**

Append the new imports to `apps/interviewer-v7/src/routes/Home.tsx`:

```tsx
import type { ImportRequest } from '~/components/ImportDialog';
import type { PendingImport } from '~/components/ProtocolCarousel/DeckCard';
import { updateSettings } from '~/lib/db/api';
import {
  type ImportProgressEvent,
  importProtocolFromFile,
  importProtocolFromUrl,
} from '~/lib/protocol/importProtocol';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
```

(Adjust the existing `~/lib/db/api` import statement if `updateSettings` isn't already pulled in there — currently `Home.tsx` only imports `deleteProtocol`, `getSettings`, `listProtocols`, `listSessions`.)

- [ ] **Step 2: Add the `pendingImports` state and `startImport` helper**

Inside `HomeRoute`, just after the existing `useToast()` call (currently around line 78), add:

```tsx
const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);

const startImport = useCallback(
  (request: ImportRequest | { source: 'sample' }) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    const initial: PendingImport = (() => {
      if (request.source === 'file') {
        return {
          id,
          label: request.label,
          source: 'file',
          phase: 'extracting',
        };
      }
      if (request.source === 'url') {
        return { id, label: request.label, source: 'url', phase: 'fetching' };
      }
      return {
        id,
        label: SAMPLE_PROTOCOL.name,
        source: 'sample',
        phase: 'fetching',
      };
    })();
    setPendingImports((prev) => [...prev, initial]);

    const onProgress = (event: ImportProgressEvent) => {
      setPendingImports((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, phase: event.phase, progress: event.progress }
            : entry,
        ),
      );
    };

    const run = async () => {
      let result;
      if (request.source === 'file') {
        result = await importProtocolFromFile(request.file, onProgress);
      } else if (request.source === 'url') {
        result = await importProtocolFromUrl(request.url, onProgress);
      } else {
        result = await importProtocolFromUrl(SAMPLE_PROTOCOL.url, onProgress);
      }

      if (result.success) {
        if (request.source === 'sample') {
          await updateSettings({ sampleProtocolDismissed: true });
        }
        await reload();
        setPendingImports((prev) => prev.filter((entry) => entry.id !== id));
        toast.add({
          title: 'Protocol imported',
          description: result.migrated
            ? `${result.protocol.name} was migrated to the current schema.`
            : `${result.protocol.name} is ready to use.`,
          variant: 'success',
        });
      } else {
        setPendingImports((prev) => prev.filter((entry) => entry.id !== id));
        toast.add({
          title: 'Import failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    };

    void run();
  },
  [reload, toast],
);
```

- [ ] **Step 3: Replace `handleImported` with the new submit/install/dismiss handlers**

Delete the existing `handleImported` callback (currently around line 95) and the `pendingProtocolHash` / `setPendingProtocolHash` setter chain that today only fires on `handleImported`. The "Start an interview" CTA that used to forward the imported hash is gone — the user will see the new card in the deck and hit Start there.

Add three new callbacks just above the existing `handleSessionCreated`:

```tsx
const handleImportSubmit = useCallback(
  (request: ImportRequest) => {
    startImport(request);
  },
  [startImport],
);

const handleInstallSample = useCallback(() => {
  startImport({ source: 'sample' });
}, [startImport]);

const handleDismissSample = useCallback(async () => {
  await updateSettings({ sampleProtocolDismissed: true });
  await reload();
}, [reload]);
```

(Note: `pendingProtocolHash` / `setPendingProtocolHash` / `newSessionActive` / `closeNewSession` / `handleSessionCreated` stay exactly as they are — they handle the in-card new-session form, unrelated to imports.)

- [ ] **Step 4: Pass the new props to `<ProtocolDeck>` and `<ImportDialog>`**

Update the `<ProtocolDeck>` JSX to thread the sample-card flag, pending imports, and the new sample handlers:

```tsx
<ProtocolDeck
  protocols={protocols}
  sessions={sessions}
  initialProtocolHash={initialProtocolHash}
  showSampleCard={settings ? !settings.sampleProtocolDismissed : false}
  pendingImports={pendingImports}
  onImport={() => setOpenDialog('import')}
  onStartInterview={setPendingProtocolHash}
  onDeleteProtocol={handleDeleteProtocol}
  onInstallSample={handleInstallSample}
  onDismissSample={handleDismissSample}
  newSessionProtocolHash={pendingProtocolHash}
  onCancelNewSession={closeNewSession}
  onSessionCreated={handleSessionCreated}
/>
```

Update the `<ImportDialog>` JSX to use the new prop:

```tsx
<ImportDialog
  open={openDialog === 'import'}
  onClose={() => setOpenDialog(null)}
  onSubmit={handleImportSubmit}
/>
```

- [ ] **Step 5: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: PASSES. If you used the bridging-defaults route in Task 5, now is when you remove them — `showSampleCard`, `pendingImports`, `onInstallSample`, `onDismissSample` are all wired here and the defaults are no longer needed.

- [ ] **Step 6: Lint + commit**

Run from the repo root:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/routes/Home.tsx apps/interviewer-v7/src/components/ImportDialog.tsx apps/interviewer-v7/src/components/ProtocolCarousel/ProtocolDeck.tsx
git commit -m "feat(interviewer-v7): ghost-card import flow + sample protocol on home"
```

---

### Task 8: Add a "Show sample protocol on home screen" toggle to Settings

Lets the user bring the sample card back after dismissing it. Lives in the existing "About" section since it's a discovery/affordance toggle, not a data-export or security control.

**Files:**

- Modify: `apps/interviewer-v7/src/components/SettingsDialog.tsx`

- [ ] **Step 1: Add a `ToggleField` row to the About section**

In `SettingsDialog.tsx`, the About section ends with the "Installation ID" row (currently around line 311). Add a new toggle below it (inside the same `section === 'about'` branch). The toggle is bound to `!settings.sampleProtocolDismissed`, so flipping it on clears the dismissal:

```tsx
{
  section === 'about' && settings ? (
    <UnconnectedField
      name="showSampleProtocol"
      label="Show sample protocol on home screen"
      hint="Re-shows the one-click sample protocol card next to the Import card."
      inline
      component={ToggleField}
      value={!settings.sampleProtocolDismissed}
      onChange={(next: boolean | undefined) =>
        void persist({ sampleProtocolDismissed: next !== true })
      }
    />
  ) : null;
}
```

(`UnconnectedField` and `ToggleField` are already imported at the top of the file; no new imports needed.)

- [ ] **Step 2: Typecheck**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Expected: passes.

- [ ] **Step 3: Lint + commit**

Run from the repo root:

```bash
pnpm lint:fix
git add apps/interviewer-v7/src/components/SettingsDialog.tsx
git commit -m "feat(interviewer-v7): settings toggle to re-show the sample protocol card"
```

---

### Task 9: End-to-end visual verification

The codebase has no renderer component tests, so this task is the integration gate. Run the web build and walk through the scenarios below. Record any issues; only mark the plan complete once every step passes.

**Pre-flight:**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
pnpm build
pnpm dev
```

Then in a browser, open the URL Vite prints (typically `http://localhost:5180` or similar) and use the dev session. The app's first-launch wizard may need to be cleared (devtools → Application → IndexedDB → delete the app's database) before starting from a clean slate.

- [ ] **Scenario 1: Sample card appears on first launch**

Clear local storage + IndexedDB. Reload. The deck should show: no real protocols, the **Sample Protocol** ghost card, then the **Import a protocol** card. The sample card has the dashed border, the Download icon, the tagline, and (when active) an "Install sample protocol" button + trash IconButton.

- [ ] **Scenario 2: Click "Install sample protocol" → ghost shows progress → real card appears**

Click the install button. Expect:

1. The sample card is replaced (in roughly the same deck position) by a `pending` ghost card labelled "Sample Protocol" with a progress bar in the footer.
2. The phase text cycles through "Fetching…", "Extracting…", "Saving…". The progress bar fills during fetch.
3. On success, the pending card vanishes and a real **Sample Protocol** card appears (with its Pattern banner, description, Start button).
4. The sample ghost does **not** re-appear — `sampleProtocolDismissed` was set to `true`.
5. A "Protocol imported" success toast is visible.

- [ ] **Scenario 3: Settings toggle brings the sample card back**

Open Settings → About. Toggle "Show sample protocol on home screen" **on**. Close the dialog. The sample card is back in the deck (alongside the now-imported real Sample Protocol). Toggling it **off** removes it.

- [ ] **Scenario 4: Trash button on sample card dismisses it persistently**

With the sample card showing, click the trash IconButton (×). The card vanishes immediately. Reload the page — the card stays gone. The Settings toggle reflects the dismissal (off).

- [ ] **Scenario 5: File import via dialog → ghost card → real card**

Click the **Import a protocol** card. The `ImportDialog` opens. Choose a local `.netcanvas` file via the picker (or drag one in). Expect:

1. The dialog closes immediately on file submit.
2. A pending ghost card appears in the deck with the filename as the label, phase "Extracting…" then "Saving…". No determinate progress bar (file already in memory).
3. On success the pending card disappears and a new real protocol card joins the deck. Success toast surfaces.

- [ ] **Scenario 6: URL import via dialog → ghost card with determinate progress**

Open Import → URL section. Paste a valid `.netcanvas` URL (the sample's URL is fine if the sample is currently dismissed — use a different URL if the sample protocol is already installed, since duplicate-hash saves will succeed but produce no new card). Click Fetch. Expect:

1. The dialog closes immediately.
2. A pending ghost card appears, labelled with the URL filename. Phase cycles "Fetching…" → "Extracting…" → "Saving…". The progress bar advances visibly during fetch when the server returns `Content-Length`.
3. On success a real protocol card appears.

- [ ] **Scenario 7: Failed import — ghost vanishes + destructive toast**

Open Import → URL. Paste a URL that 404s (e.g. `https://example.com/nope.netcanvas`). Click Fetch. Expect:

1. The dialog closes.
2. A pending ghost briefly appears, then vanishes.
3. A red destructive toast surfaces the error message ("Server responded with 404 Not Found" or similar).

- [ ] **Scenario 8: Existing flows untouched**

Confirm the unrelated flows still work: starting a new interview from a real protocol card still morphs into the new-session form, the data view still loads, settings still persist, and the security/lock flow is unaffected.

- [ ] **Scenario 9: Final typecheck + lint pass**

Run from `apps/interviewer-v7`:

```bash
pnpm typecheck
```

Run from the repo root:

```bash
pnpm lint:fix
```

Expected: both clean. No uncommitted changes from the lint pass; if there are, commit them as a final polish commit:

```bash
git add -A
git commit -m "chore(interviewer-v7): post-implementation lint pass"
```

---

## Out-of-plan polish (per the spec)

These were explicitly punted in the spec — do **not** implement them in this plan:

- A `layoutId`-based morph for the pending → real card transition (Swiper's default mount/unmount yields a hard cut in v1; ship that and revisit only if it feels off in real use).
- A queue/throttle UI for concurrent imports.
- Telemetry on sample installs.
- Unifying `sampleProtocolDismissed` with `dismissedUpdates`.
