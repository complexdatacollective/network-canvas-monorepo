# ProtocolDeck Motion-Native Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Swiper-based ProtocolDeck carousel with a motion-native deck so one animation system owns every transform, deleting the exit-choreography state machine and the `onActivate` index-dispatch pattern.

**Architecture:** A deck-level motion value `position` (a float in slide-index space) plus one spring motion value per slide tracking its own index; every visual property of a slide is a pure function of `offset = slideIndex − position`. AnimatePresence owns slide enter/exit. Slot merging moves to a pure module; per-kind card props move to a dedicated component so the in-place sample → installing → protocol morph survives.

**Tech Stack:** React 19, motion 12 (`motion/react`), Tailwind, Vitest (jsdom unit project + Storybook browser project), Storybook 10.

**Spec:** `docs/superpowers/specs/2026-06-10-protocol-deck-motion-rewrite-design.md`

**Working directory:** all commands run from `apps/interviewer-v7` unless noted.

**Reference — the file being replaced:** `apps/interviewer-v7/src/components/ProtocolCarousel/ProtocolDeck.tsx` (848 lines on branch `deckcard-newsession-dialog` at commit `d526a417`). Read it before starting: every constant and behavior below is derived from it.

**Public contract that must not change:** `ProtocolDeck`'s props (`ProtocolDeckProps`) are unchanged, and `~/routes/Home.tsx` is not touched.

**One deliberate behavior fix:** today the pending (installing) card never shows its progress footer because its `DeckCardProps` omit `isActive` and `DeckCard` only renders footers when `isActive` — the new `DeckSlotCard` passes `isActive` through so progress is visible when the pending card is centred.

---

### Task 1: `slidePose` — the fan geometry as a pure function

The math currently split across Swiper's `creativeEffectConfig`, the imperative `applyOpacityCurve` callback, and the `SLOT_TRANSLATE_PCT`/`FAN_*` constants becomes one tested function.

**Files:**

- Create: `src/components/ProtocolCarousel/slidePose.ts`
- Create: `src/components/ProtocolCarousel/__tests__/slidePose.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/ProtocolCarousel/__tests__/slidePose.test.ts
import { describe, expect, it } from 'vitest';

import { slidePose } from '../slidePose';

const CARD_W = 400;
const CARD_H = 500;

describe('slidePose', () => {
  it('centres the active slide with no transform and full opacity', () => {
    const pose = slidePose(0, CARD_W, CARD_H);
    expect(pose.x).toBeCloseTo(0);
    expect(pose.y).toBeCloseTo(0);
    expect(pose.z).toBeCloseTo(0);
    expect(pose.rotateZ).toBeCloseTo(0);
    expect(pose.opacity).toBe(1);
  });

  it('strides 0.7 card widths per offset step', () => {
    expect(slidePose(1, CARD_W, CARD_H).x).toBeCloseTo(280);
    expect(slidePose(-2, CARD_W, CARD_H).x).toBeCloseTo(-560);
  });

  it('drops, recedes, and rotates proportionally to offset', () => {
    const pose = slidePose(2, CARD_W, CARD_H);
    expect(pose.y).toBeCloseTo(0.04 * 2 * CARD_H);
    expect(pose.z).toBeCloseTo(-800);
    expect(pose.rotateZ).toBeCloseTo(6);
  });

  it('mirrors x and rotation for negative offsets but keeps y/z falling away', () => {
    const left = slidePose(-1.5, CARD_W, CARD_H);
    const right = slidePose(1.5, CARD_W, CARD_H);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.rotateZ).toBeCloseTo(-right.rotateZ);
    expect(left.y).toBeCloseTo(right.y);
    expect(left.z).toBeCloseTo(right.z);
  });

  it('plateaus opacity at 1 through |offset| 2, fades to 0 by 4', () => {
    expect(slidePose(2, CARD_W, CARD_H).opacity).toBe(1);
    expect(slidePose(3, CARD_W, CARD_H).opacity).toBeCloseTo(0.5);
    expect(slidePose(-3.5, CARD_W, CARD_H).opacity).toBeCloseTo(0.25);
    expect(slidePose(4, CARD_W, CARD_H).opacity).toBe(0);
    expect(slidePose(7, CARD_W, CARD_H).opacity).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/slidePose.test.ts`
Expected: FAIL — cannot resolve `../slidePose`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/ProtocolCarousel/slidePose.ts

// Visual proportions of the fanned deck — tuned together. Changing one
// without re-checking the others desyncs the drag stride from the painted
// fan.
//
// Slot stride as a fraction of card width: adjacent cards sit 0.7 card
// widths apart, reproducing the original 30% overlap.
export const SLOT_TO_CARD_RATIO = 0.7;
// With perspective 1800px, translateZ(-400) projects a card to
// (1800/2200) ≈ 82% of its size — cards further from active naturally
// appear behind via real 3D depth, not z-index.
export const DECK_PERSPECTIVE_PX = 1800;
const FAN_Z_STEP = 400;
const FAN_ROTATE_DEG = 3;
const FAN_DROP_RATIO = 0.04;

export type SlidePose = {
  x: number;
  y: number;
  z: number;
  rotateZ: number;
  opacity: number;
};

// Every visual property of a slide is a pure function of its offset from
// the deck position (offset = slideIndex − position, in slide-index units).
// Opacity plateaus at 1 for slides ≤ 2 away and fades to 0 by 4, so distant
// cards keep their full fan transform and the opacity does the hiding.
export function slidePose(
  offset: number,
  cardWidth: number,
  cardHeight: number,
): SlidePose {
  const abs = Math.abs(offset);
  return {
    x: offset * SLOT_TO_CARD_RATIO * cardWidth,
    y: abs * FAN_DROP_RATIO * cardHeight,
    z: -abs * FAN_Z_STEP,
    rotateZ: offset * FAN_ROTATE_DEG,
    opacity: abs <= 2 ? 1 : abs >= 4 ? 0 : 1 - (abs - 2) / 2,
  };
}
```

Note: `FAN_Z_STEP`, `FAN_ROTATE_DEG`, `FAN_DROP_RATIO` are NOT exported — nothing else needs them (repo rule: only export what other modules use). `SLOT_TO_CARD_RATIO` and `DECK_PERSPECTIVE_PX` are exported for `DeckCarousel` (Task 5).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/slidePose.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtocolCarousel/slidePose.ts src/components/ProtocolCarousel/__tests__/slidePose.test.ts
git commit -m "feat(interviewer-v7): add slidePose module for deck fan geometry"
```

---

### Task 2: `deckEntries` — slot merging as a pure module

Extracts `DeckEntry`, the slot-key function, and the priority merge from `ProtocolDeck.tsx` (lines 48–80 and 201–229 of the current file). Two cleanups versus the original: keys are namespaced with `slot:` so the import entry needs no high-codepoint sentinel, and the import card no longer participates in the merge at all — it is appended after sorting.

**Files:**

- Create: `src/components/ProtocolCarousel/deckEntries.ts`
- Create: `src/components/ProtocolCarousel/__tests__/deckEntries.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/ProtocolCarousel/__tests__/deckEntries.test.ts
import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { buildDeck, entryKey } from '../deckEntries';

function makeProtocol(name: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `test-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 8,
    importedAt: '2026-05-20T10:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

function makePending(label: string): PendingImport {
  return { id: `pending-${label}`, label, source: 'file', phase: 'extracting' };
}

describe('entryKey', () => {
  it('namespaces slot keys so the import entry can never collide with a protocol name', () => {
    expect(entryKey({ kind: 'import' })).toBe('import');
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('import') }),
    ).toBe('slot:import');
  });

  it('gives sample, pending, and protocol entries name-based keys so they share slots', () => {
    expect(entryKey({ kind: 'sample' })).toBe('slot:Sample Protocol');
    expect(
      entryKey({ kind: 'pending', pending: makePending('Sample Protocol') }),
    ).toBe('slot:Sample Protocol');
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('Sample Protocol') }),
    ).toBe('slot:Sample Protocol');
  });
});

describe('buildDeck', () => {
  it('returns only the import card for empty input', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: false,
      pendingImports: [],
    });
    expect(deck).toEqual([{ kind: 'import' }]);
  });

  it('sorts protocols case-insensitively and always puts the import card last', () => {
    const deck = buildDeck({
      protocols: [
        makeProtocol('zeta'),
        makeProtocol('Alpha'),
        makeProtocol('beta'),
      ],
      showSampleCard: true,
      pendingImports: [],
    });
    expect(deck.map((e) => entryKey(e))).toEqual([
      'slot:Alpha',
      'slot:beta',
      'slot:Sample Protocol',
      'slot:zeta',
      'import',
    ]);
  });

  it('lets a pending import shadow the sample card in the same slot', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: true,
      pendingImports: [makePending('Sample Protocol')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });

  it('lets a pending import shadow an installed protocol with the same name', () => {
    const deck = buildDeck({
      protocols: [makeProtocol('Study A')],
      showSampleCard: false,
      pendingImports: [makePending('Study A')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });

  it('lets the sample card shadow a protocol named Sample Protocol', () => {
    const deck = buildDeck({
      protocols: [makeProtocol('Sample Protocol')],
      showSampleCard: true,
      pendingImports: [],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('sample');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/deckEntries.test.ts`
Expected: FAIL — cannot resolve `../deckEntries`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/ProtocolCarousel/deckEntries.ts
import type { ProtocolWithCounts } from '~/lib/db/types';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

// Union shape that determines which card renders in a carousel slot.
export type DeckEntry =
  | { kind: 'protocol'; protocol: ProtocolWithCounts }
  | { kind: 'sample' }
  | { kind: 'pending'; pending: PendingImport }
  | { kind: 'import' };

// Name-based slot identity: entries whose names collide share a slot so the
// card morphs in place (sample → installing → installed protocol). The
// `slot:` namespace guarantees the import entry's key can never collide
// with a protocol name.
export function entryKey(entry: DeckEntry): string {
  switch (entry.kind) {
    case 'protocol':
      return `slot:${entry.protocol.name}`;
    case 'sample':
      return `slot:${SAMPLE_PROTOCOL.name}`;
    case 'pending':
      return `slot:${entry.pending.label}`;
    case 'import':
      return 'import';
  }
}

// Pending wins over sample wins over protocol when two entries collide on
// the same slot key (e.g. a sample-source pending and the sample card, or a
// freshly-imported protocol overlapping its just-cleared pending entry).
const KIND_PRIORITY = {
  pending: 3,
  sample: 2,
  protocol: 1,
  import: 0,
} as const;

type BuildDeckArgs = {
  protocols: ProtocolWithCounts[];
  showSampleCard: boolean;
  pendingImports: PendingImport[];
};

// Merge protocols, the sample teaser, and in-flight imports into slot-keyed
// entries sorted by name; the import trigger is always the last card and
// never participates in slot merging.
export function buildDeck({
  protocols,
  showSampleCard,
  pendingImports,
}: BuildDeckArgs): DeckEntry[] {
  const candidates: DeckEntry[] = protocols.map((protocol) => ({
    kind: 'protocol',
    protocol,
  }));
  if (showSampleCard) candidates.push({ kind: 'sample' });
  for (const pending of pendingImports) {
    candidates.push({ kind: 'pending', pending });
  }

  const bySlot = new Map<string, DeckEntry>();
  for (const candidate of candidates) {
    const key = entryKey(candidate);
    const existing = bySlot.get(key);
    if (
      !existing ||
      KIND_PRIORITY[candidate.kind] > KIND_PRIORITY[existing.kind]
    ) {
      bySlot.set(key, candidate);
    }
  }

  const sorted = Array.from(bySlot.entries())
    .toSorted(([a], [b]) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
    .map(([, entry]) => entry);

  return [...sorted, { kind: 'import' }];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/deckEntries.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtocolCarousel/deckEntries.ts src/components/ProtocolCarousel/__tests__/deckEntries.test.ts
git commit -m "feat(interviewer-v7): extract deck entry merging into deckEntries module"
```

---

### Task 3: `useDeckKeyboard` — window-level arrows + Enter

Replaces Swiper's Keyboard module and the inline window Enter handler (current `ProtocolDeck.tsx` lines 481–504). Same semantics: works without focus; Enter skips editable and interactive targets; arrows skip only editable targets.

**Files:**

- Create: `src/components/ProtocolCarousel/useDeckKeyboard.ts`
- Create: `src/components/ProtocolCarousel/__tests__/useDeckKeyboard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/ProtocolCarousel/__tests__/useDeckKeyboard.test.ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDeckKeyboard } from '../useDeckKeyboard';

function pressOnWindow(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('useDeckKeyboard', () => {
  it('steps on arrow keys and activates on Enter', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: true, onStep, onActivate }));

    pressOnWindow('ArrowLeft');
    expect(onStep).toHaveBeenCalledWith(-1);
    pressOnWindow('ArrowRight');
    expect(onStep).toHaveBeenCalledWith(1);
    pressOnWindow('Enter');
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: false, onStep, onActivate }));

    pressOnWindow('ArrowRight');
    pressOnWindow('Enter');
    expect(onStep).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores keys originating from editable targets', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: true, onStep, onActivate }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    input.remove();

    expect(onStep).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores Enter from interactive targets but still steps arrows', () => {
    const onStep = vi.fn();
    const onActivate = vi.fn();
    renderHook(() => useDeckKeyboard({ enabled: true, onStep, onActivate }));

    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    button.remove();

    expect(onActivate).not.toHaveBeenCalled();
    expect(onStep).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/useDeckKeyboard.test.ts`
Expected: FAIL — cannot resolve `../useDeckKeyboard`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/ProtocolCarousel/useDeckKeyboard.ts
import { useEffect } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

// Enter must additionally skip focused buttons/links (they handle Enter
// themselves); arrows still work there so a focused chevron doesn't trap
// deck navigation.
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'BUTTON' || target.tagName === 'A') return true;
  return target.closest('button, a, [role="button"], [role="link"]') !== null;
}

type DeckKeyboardOptions = {
  enabled: boolean;
  onStep: (direction: -1 | 1) => void;
  onActivate: () => void;
};

// Window-level so the deck responds without holding focus (matching the
// old Swiper keyboard module with onlyInViewport: false).
export function useDeckKeyboard({
  enabled,
  onStep,
  onActivate,
}: DeckKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (isEditableTarget(event.target)) return;
        onStep(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (event.key === 'Enter') {
        if (isEditableTarget(event.target) || isInteractiveTarget(event.target))
          return;
        event.preventDefault();
        onActivate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onStep, onActivate]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/useDeckKeyboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtocolCarousel/useDeckKeyboard.ts src/components/ProtocolCarousel/__tests__/useDeckKeyboard.test.ts
git commit -m "feat(interviewer-v7): add useDeckKeyboard hook for deck navigation"
```

---

### Task 4: `DeckSlotCard` — entry kind → DeckCard props

The 90-line `cardProps` IIFE from `ProtocolDeck.tsx` (lines 655–744) becomes a named component. Every slot kind renders through this ONE component so the `DeckCard` element — and with it the `LayoutGroup` driving in-card `layout` animations — survives kind changes within a slot (the sacred morph).

**Files:**

- Create: `src/components/ProtocolCarousel/DeckSlotCard.tsx`
- Create: `src/components/ProtocolCarousel/__tests__/DeckSlotCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ProtocolCarousel/__tests__/DeckSlotCard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { DeckSlotCard } from '../DeckSlotCard';

function makeProtocol(name: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description: 'A description.',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `test-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 8,
    importedAt: '2026-05-20T10:00:00.000Z',
    description: 'A description.',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

const noop = () => {};

const baseProps = {
  isActive: true,
  activate: noop,
  sessionCount: 0,
  onDeleteProtocol: noop,
  onDismissSample: noop,
  onInstallSample: noop,
};

describe('DeckSlotCard', () => {
  it('renders an active protocol card with a start button and delete control', async () => {
    const activate = vi.fn();
    const onDeleteProtocol = vi.fn();
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'protocol', protocol: makeProtocol('Friendship Ties') }}
        activate={activate}
        onDeleteProtocol={onDeleteProtocol}
      />,
    );

    expect(screen.getByText('Friendship Ties')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Start new interview' }),
    );
    expect(activate).toHaveBeenCalledTimes(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Protocol' }),
    );
    expect(onDeleteProtocol).toHaveBeenCalledWith('hash-Friendship Ties');
  });

  it('renders the sample card with an install button when active', async () => {
    const onInstallSample = vi.fn();
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{ kind: 'sample' }}
        onInstallSample={onInstallSample}
      />,
    );

    expect(screen.getByText('Sample Protocol')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Install sample protocol' }),
    );
    expect(onInstallSample).toHaveBeenCalledTimes(1);
  });

  it('renders the pending card with the phase label', () => {
    render(
      <DeckSlotCard
        {...baseProps}
        entry={{
          kind: 'pending',
          pending: {
            id: 'p1',
            label: 'Incoming Study',
            source: 'file',
            phase: 'extracting',
          },
        }}
      />,
    );

    expect(screen.getByText('Incoming Study')).toBeInTheDocument();
    expect(screen.getByText('Extracting…')).toBeInTheDocument();
  });
});
```

Note: `@testing-library/user-event` — check it is in devDependencies; if not, the catalog entry exists for other packages, add `"@testing-library/user-event": "catalog:"` to devDependencies and run `pnpm install` (root). If the catalog has no entry, use `fireEvent.click` from `@testing-library/react` instead and drop the dependency.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/DeckSlotCard.test.tsx`
Expected: FAIL — cannot resolve `../DeckSlotCard`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ProtocolCarousel/DeckSlotCard.tsx
import { Download } from 'lucide-react';

import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';
import type { ImportPhase } from '~/lib/protocol/importProtocol';
import { SAMPLE_PROTOCOL } from '~/lib/protocol/sampleProtocol';

import { NewSessionForm } from '../NewSessionForm';
import {
  DeckCard,
  DeckCardFooter,
  DeckCardFooterButton,
  type DeckCardProps,
  DeckCardProgressFooter,
} from './DeckCard';
import type { DeckEntry } from './deckEntries';

// Status line shown on the loading card for each import phase.
const PHASE_LABEL: Record<ImportPhase, string> = {
  fetching: 'Fetching…',
  extracting: 'Extracting…',
  saving: 'Saving…',
};

// A Geospatial stage renders an online map (tile server), so a protocol
// that contains one can't be administered while offline.
function protocolRequiresInternet(protocol: ProtocolWithCounts): boolean {
  return protocol.protocol.stages.some((stage) => stage.type === 'Geospatial');
}

type DeckSlotCardProps = {
  entry: Exclude<DeckEntry, { kind: 'import' }>;
  isActive: boolean;
  // Unified activation from the carousel: navigates to this slot when it is
  // not active, runs the entry's primary action when it is.
  activate: () => void;
  sessionCount: number;
  onDeleteProtocol: (hash: string) => void;
  onDismissSample: () => void;
  onInstallSample: () => void;
  // When set, the case-ID form replaces the protocol card's footer.
  newSession?: {
    onCancel: () => void;
    onCreated: (session: StoredSession) => void;
  };
};

function slotCardProps({
  entry,
  isActive,
  activate,
  sessionCount,
  onDeleteProtocol,
  onDismissSample,
  onInstallSample,
  newSession,
}: DeckSlotCardProps): DeckCardProps {
  if (entry.kind === 'protocol') {
    return {
      protocol: entry.protocol,
      isActive,
      sessionCount,
      requiresInternetConnection: protocolRequiresInternet(entry.protocol),
      onActivate: activate,
      // The delete control clears out with the rest of the card chrome
      // while the case-ID form is open.
      onDelete: newSession
        ? undefined
        : () => onDeleteProtocol(entry.protocol.hash),
      footer: newSession ? (
        <DeckCardFooter key="new-session">
          <NewSessionForm
            protocol={entry.protocol}
            onCancel={newSession.onCancel}
            onCreated={newSession.onCreated}
          />
        </DeckCardFooter>
      ) : isActive ? (
        <DeckCardFooter key="start-interview">
          <DeckCardFooterButton onClick={activate}>
            Start new interview
          </DeckCardFooterButton>
        </DeckCardFooter>
      ) : undefined,
    };
  }
  if (entry.kind === 'sample') {
    return {
      loading: true,
      protocol: {
        name: SAMPLE_PROTOCOL.name,
        description: SAMPLE_PROTOCOL.description,
      },
      isActive,
      hideMetadata: true,
      onActivate: activate,
      onDelete: onDismissSample,
      deleteLabel: 'Dismiss the sample protocol',
      footer: isActive ? (
        <DeckCardFooter key="install-sample">
          <DeckCardFooterButton
            color="primary"
            icon={
              <Download
                aria-hidden
                className="size-[max(14px,3.5cqi)] shrink-0"
              />
            }
            onClick={onInstallSample}
          >
            Install sample protocol
          </DeckCardFooterButton>
        </DeckCardFooter>
      ) : undefined,
    };
  }
  return {
    loading: true,
    protocol: {
      name: entry.pending.label || undefined,
      description: undefined,
    },
    isActive,
    footer: (
      <DeckCardFooter key="import-progress">
        <DeckCardProgressFooter
          progress={entry.pending.progress}
          message={PHASE_LABEL[entry.pending.phase]}
        />
      </DeckCardFooter>
    ),
  };
}

// Every slot kind renders through this ONE component so the DeckCard
// element — and with it the LayoutGroup driving in-card `layout`
// animations — survives kind changes within a slot (sample → installing →
// installed protocol). Separate per-kind components would remount the card
// and snap its content into place.
export function DeckSlotCard(props: DeckSlotCardProps) {
  return <DeckCard {...slotCardProps(props)} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run --project=unit src/components/ProtocolCarousel/__tests__/DeckSlotCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ProtocolCarousel/DeckSlotCard.tsx src/components/ProtocolCarousel/__tests__/DeckSlotCard.test.tsx
git commit -m "feat(interviewer-v7): add DeckSlotCard mapping deck entries to card props"
```

---

### Task 5: `DeckCarousel` — the motion-native carousel

The replacement for Swiper. Owns the `position` motion value, drag/wheel gestures, snap, per-slide pose transforms, and AnimatePresence enter/exit. Verified by typecheck here and by Storybook browser tests in Task 8 (gesture/animation code is not meaningfully testable in jsdom — don't try).

**Key mechanics (read before writing):**

- `position` is a plain motion value; travel uses `animate(position, target, spring)`. `settleTarget` ref tracks the index the deck is travelling toward (`null` while dragging) so the controlled-`activeIndex` effect doesn't restart an in-flight spring toward the same target (which would discard flick velocity).
- Each slide holds `useSpring(index)` with the SAME spring config as the deck travel. When a removal shifts a slide's index and ProtocolDeck simultaneously shifts `activeIndex` to follow the same slot, the two springs retarget in the same frame and cancel — the active card stays visually centred with no equivalent of the old `indexFixRef`.
- The container has `perspective` + `transform-style: preserve-3d` so the browser depth-sorts the translateZ'd slides exactly as Swiper's `swiper-3d` class did. No z-index management.
- `AnimatePresence initial={false}` reproduces the old `committedKeysRef` semantics for free: slides in the first commit mount settled, later additions play the drop-in pose, removals play the exit pose on the nested lifecycle div (motion waits for descendant exits).

**Files:**

- Create: `src/components/ProtocolCarousel/DeckCarousel.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
// src/components/ProtocolCarousel/DeckCarousel.tsx
import {
  AnimatePresence,
  animate,
  motion,
  type MotionValue,
  type PanInfo,
  useIsPresent,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import {
  DECK_PERSPECTIVE_PX,
  SLOT_TO_CARD_RATIO,
  slidePose,
} from './slidePose';

// One spring for both the deck position and each slide's slot index: when a
// removal shifts both by the same amount in the same frame the two springs
// cancel, so the active card stays visually centred while its neighbours
// close the gap.
const DECK_SPRING = { stiffness: 300, damping: 34, mass: 1 } as const;

// Seconds of velocity projection when picking the snap target after a
// flick — tune by feel on real hardware.
const FLICK_PROJECTION_S = 0.18;

// Wheel: accumulated delta needed to step one card (matching the old
// Swiper thresholdDelta), and a cooldown so trackpad momentum doesn't keep
// stepping after the gesture.
const WHEEL_THRESHOLD = 30;
const WHEEL_COOLDOWN_MS = 250;

// Drag resistance past the first/last card.
const OVERSCROLL_RESIST = 0.25;

// Slide lifecycle poses. A slide animates in once when its slot is added
// and out once when its slot is removed; content changes within a slot
// (sample → installing → protocol) swap without any animation.
const SLIDE_ENTER = { y: -48, opacity: 0, scale: 0.9 };
const SLIDE_REST = { y: 0, opacity: 1, scale: 1 };
const SLIDE_ENTER_SPRING = {
  type: 'spring',
  stiffness: 140,
  damping: 12,
  mass: 1.1,
} as const;
const SLIDE_EXIT = {
  y: 0,
  opacity: 0,
  scale: 0,
  transition: { duration: 0.3, ease: 'easeIn' },
} as const;

export type DeckCarouselSlide = {
  key: string;
  // Primary action when the slide is tapped (or Enter-activated) while
  // active. Undefined = inert (the pending/installing card).
  onActivate?: () => void;
  // Frosted-glass look for the import trigger. The blur must sit on the
  // slide's lifecycle wrapper: applied inside the card it would be scoped
  // by the pose wrapper's stacking context to an empty rect; on the
  // (itself transformed) wrapper it reads through to the blob backdrop.
  backdropBlur?: boolean;
  render: (isActive: boolean, activate: () => void) => ReactNode;
};

export type DeckCarouselHandle = {
  // Snap the deck to an index with no animation (initial deep-link).
  jumpTo: (index: number) => void;
};

type DeckCarouselProps = {
  slides: readonly DeckCarouselSlide[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  disabled: boolean;
  cardWidth: number;
  cardHeight: number;
  ref?: Ref<DeckCarouselHandle>;
};

function clampIndex(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, value));
}

function rubberBand(raw: number, count: number): number {
  const max = count - 1;
  if (raw < 0) return raw * OVERSCROLL_RESIST;
  if (raw > max) return max + (raw - max) * OVERSCROLL_RESIST;
  return raw;
}

export function DeckCarousel({
  slides,
  activeIndex,
  onActiveIndexChange,
  disabled,
  cardWidth,
  cardHeight,
  ref,
}: DeckCarouselProps) {
  const position = useMotionValue(activeIndex);
  const settleAnimation = useRef<ReturnType<typeof animate> | null>(null);
  // The index the deck is travelling toward; null while a drag is live.
  const settleTarget = useRef<number | null>(activeIndex);
  const dragOrigin = useRef(0);
  const [dragging, setDragging] = useState(false);
  const wheelAccum = useRef(0);
  const wheelLastStep = useRef(0);
  const stride = SLOT_TO_CARD_RATIO * cardWidth;

  const settleTo = useCallback(
    (target: number, velocity = 0) => {
      settleTarget.current = target;
      settleAnimation.current?.stop();
      settleAnimation.current = animate(position, target, {
        type: 'spring',
        ...DECK_SPRING,
        velocity,
      });
    },
    [position],
  );

  useImperativeHandle(
    ref,
    () => ({
      jumpTo: (index: number) => {
        settleAnimation.current?.stop();
        settleTarget.current = index;
        position.jump(index);
      },
    }),
    [position],
  );

  // Travel when the controlled activeIndex departs from the current target
  // (chevrons, dots, keyboard, or slot relocation after a removal).
  useEffect(() => {
    if (dragging) return;
    if (settleTarget.current === activeIndex) return;
    settleTo(activeIndex);
  }, [activeIndex, dragging, settleTo]);

  const handlePanStart = () => {
    if (disabled) return;
    settleAnimation.current?.stop();
    settleTarget.current = null;
    dragOrigin.current = position.get();
    setDragging(true);
  };

  // settleTarget === null is the "drag is live" guard: pan events from a
  // gesture that started while disabled (or before a re-render) are
  // ignored.
  const handlePan = (_event: PointerEvent, info: PanInfo) => {
    if (disabled || settleTarget.current !== null) return;
    const raw = dragOrigin.current - info.offset.x / stride;
    position.set(rubberBand(raw, slides.length));
  };

  const handlePanEnd = (_event: PointerEvent, info: PanInfo) => {
    if (disabled || settleTarget.current !== null) return;
    setDragging(false);
    // Velocity in index units/s; project a little ahead so flicks advance
    // past the halfway point feel right.
    const velocity = -info.velocity.x / stride;
    const projected = position.get() + velocity * FLICK_PROJECTION_S;
    const target = clampIndex(Math.round(projected), slides.length);
    settleTo(target, velocity);
    if (target !== activeIndex) onActiveIndexChange(target);
  };

  // Both axes step the deck (the old config used forceToAxis: false so a
  // plain vertical mouse wheel works); the cooldown suppresses trackpad
  // momentum tails.
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (disabled || dragging) return;
    const now = performance.now();
    if (now - wheelLastStep.current < WHEEL_COOLDOWN_MS) {
      wheelAccum.current = 0;
      return;
    }
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    wheelAccum.current += delta;
    if (Math.abs(wheelAccum.current) < WHEEL_THRESHOLD) return;
    const direction = wheelAccum.current > 0 ? 1 : -1;
    wheelAccum.current = 0;
    wheelLastStep.current = now;
    const next = clampIndex(activeIndex + direction, slides.length);
    if (next !== activeIndex) onActiveIndexChange(next);
  };

  return (
    <motion.div
      onPanStart={handlePanStart}
      onPan={handlePan}
      onPanEnd={handlePanEnd}
      onWheel={handleWheel}
      style={{
        height: cardHeight,
        perspective: DECK_PERSPECTIVE_PX,
        transformStyle: 'preserve-3d',
      }}
      // touch-pan-y: vertical touch gestures stay with the browser;
      // horizontal ones drive the deck.
      className={`relative w-full touch-pan-y ${
        disabled ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <AnimatePresence initial={false}>
        {slides.map((slide, index) => (
          <DeckSlide
            key={slide.key}
            slide={slide}
            index={index}
            activeIndex={activeIndex}
            position={position}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            disabled={disabled}
            onSelect={onActiveIndexChange}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

type DeckSlideProps = {
  slide: DeckCarouselSlide;
  index: number;
  activeIndex: number;
  position: MotionValue<number>;
  cardWidth: number;
  cardHeight: number;
  disabled: boolean;
  onSelect: (index: number) => void;
};

function DeckSlide({
  slide,
  index,
  activeIndex,
  position,
  cardWidth,
  cardHeight,
  disabled,
  onSelect,
}: DeckSlideProps) {
  const isPresent = useIsPresent();

  // The slide's own slot index, springed so reindexing after a removal
  // animates in lockstep with the deck position spring (same config).
  const slotIndex = useSpring(index, DECK_SPRING);
  useEffect(() => {
    slotIndex.set(index);
  }, [index, slotIndex]);

  const x = useTransform(
    () => slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight).x,
  );
  const y = useTransform(
    () => slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight).y,
  );
  const z = useTransform(
    () => slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight).z,
  );
  const rotateZ = useTransform(
    () =>
      slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight)
        .rotateZ,
  );
  const opacity = useTransform(
    () =>
      slidePose(slotIndex.get() - position.get(), cardWidth, cardHeight)
        .opacity,
  );

  const isActive = index === activeIndex;
  // Matches the pose's opacity-0 plateau: fully invisible slides must not
  // be reachable by assistive tech or the tab order. Exiting slides
  // likewise.
  const hidden = Math.abs(index - activeIndex) >= 4 || !isPresent;

  const activate = () => {
    if (disabled || !isPresent) return;
    if (!isActive) {
      onSelect(index);
      return;
    }
    slide.onActivate?.();
  };

  const handleTap = (event: PointerEvent | MouseEvent | TouchEvent) => {
    const target = event.target;
    // Interactive descendants (delete button, footer button, links, the
    // case-ID form) own their own activation.
    if (
      target instanceof Element &&
      target.closest(
        'button, a, input, textarea, select, [role="button"], [role="link"]',
      ) !== null
    ) {
      return;
    }
    activate();
  };

  return (
    <motion.div
      style={{
        x,
        y,
        z,
        rotateZ,
        opacity,
        width: cardWidth,
        height: cardHeight,
      }}
      onTap={handleTap}
      aria-hidden={hidden || undefined}
      inert={hidden}
      className="absolute inset-0 m-auto origin-[center_bottom] will-change-transform"
    >
      <motion.div
        initial={SLIDE_ENTER}
        animate={SLIDE_REST}
        exit={SLIDE_EXIT}
        transition={SLIDE_ENTER_SPRING}
        className={`h-full w-full ${slide.backdropBlur ? 'backdrop-blur-md' : ''} ${
          isPresent ? '' : 'pointer-events-none'
        }`}
      >
        {slide.render(isActive, activate)}
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @codaco/interviewer-v7 typecheck`
Expected: PASS. Likely friction points if it fails: motion's `useTransform(() => …)` function form requires no deps argument (correct as written); `inert` is a plain boolean prop on React 19; if `transition: { ease: 'easeIn' }` inside `SLIDE_EXIT` is rejected by the `as const` narrowing, type the constant explicitly as `TargetAndTransition` from `motion/react` instead of using `as const`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProtocolCarousel/DeckCarousel.tsx
git commit -m "feat(interviewer-v7): add motion-native DeckCarousel"
```

---

### Task 6: Rewrite `ProtocolDeck` as the orchestrator

Replace the entire file. Props are UNCHANGED. Everything Swiper-related, the exit state machine (`exiting` map, `suppressActiveSyncRef`, `indexFixRef`, `renderDeckRef`, `committedKeysRef`, `handleScaleOutComplete`), `applyOpacityCurve`, `handleActivate`, and the inline Enter handler are deleted; what remains is entry building, sizing, active-index management, and the nav row.

**Files:**

- Modify: `src/components/ProtocolCarousel/ProtocolDeck.tsx` (full replacement)

- [ ] **Step 1: Replace the file contents**

```tsx
// src/components/ProtocolCarousel/ProtocolDeck.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import type {
  ProtocolWithCounts,
  StoredSession,
  StoredSessionLite,
} from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { GLASS_PILL } from '../TopActionBar';
import {
  DeckCarousel,
  type DeckCarouselHandle,
  type DeckCarouselSlide,
} from './DeckCarousel';
import { buildDeck, type DeckEntry, entryKey } from './deckEntries';
import { DeckSlotCard } from './DeckSlotCard';
import { ImportTriggerCard } from './ImportTriggerCard';
import { useDeckKeyboard } from './useDeckKeyboard';

// Cards are square; height is measured from the section, width follows.
const CARD_ASPECT = 1 / 1;
// Top/bottom inset so the deck sits below the header instead of hugging it,
// and so the card's drop shadow has room to render. Scaled with section
// height: short viewports (Electron default 1280×800 leaves ~470px) get a
// smaller padding so the card itself doesn't shrink below readability;
// tall viewports get the original 100px breathing room.
const SECTION_PADDING_RATIO = 0.12;
const MIN_SECTION_PADDING = 24;
const MAX_SECTION_PADDING = 100;

function computeSectionPadding(sectionHeight: number): number {
  return Math.min(
    MAX_SECTION_PADDING,
    Math.max(MIN_SECTION_PADDING, sectionHeight * SECTION_PADDING_RATIO),
  );
}

type ProtocolDeckProps = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSessionLite[];
  initialProtocolHash?: string;
  showSampleCard?: boolean;
  pendingImports?: PendingImport[];
  onImport: () => void;
  onStartInterview: (protocolHash: string) => void;
  onDeleteProtocol: (hash: string) => void;
  onInstallSample?: () => void;
  onDismissSample?: () => void;
  // When set, the matching card is rendered in its "new session" state: the
  // case-ID form replaces the description, metadata, and Start button in the
  // card footer, and swipe/keyboard navigation is locked.
  newSessionProtocolHash?: string | null;
  onCancelNewSession?: () => void;
  onSessionCreated?: (session: StoredSession) => void;
};

// Explicit exit transitions so `AnimatePresence mode="wait"` doesn't
// stall on motion's default unbounded spring before the data view can
// enter. Enter keeps the default spring for the existing feel.
const sectionVariants = {
  hidden: { opacity: 0, y: '10%' },
  visible: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: '10%',
    transition: { duration: 0.3, ease: 'easeIn' },
  },
} as const;

// Chevron row needs both a view-transition cascade (hidden/visible/exit)
// and a "fade out while the new-session form is open" toggle. We model
// the toggle as a `muted` variant and drive `animate` explicitly when it
// applies — outside of `muted`, `animate="visible"` lines up with the
// state that the parent cascade is propagating anyway.
const chevronRowVariants = {
  hidden: { opacity: 0, y: '10%' },
  visible: { opacity: 1, y: 0 },
  muted: { opacity: 0, y: 0 },
  exit: {
    opacity: 0,
    y: '10%',
    transition: { duration: 0.2, ease: 'easeIn' },
  },
} as const;

type DeckSlide = DeckCarouselSlide & { entry: DeckEntry };

export function ProtocolDeck({
  protocols,
  sessions,
  initialProtocolHash,
  showSampleCard = false,
  pendingImports = [],
  onImport,
  onStartInterview,
  onDeleteProtocol,
  onInstallSample = () => {},
  onDismissSample = () => {},
  newSessionProtocolHash,
  onCancelNewSession,
  onSessionCreated,
}: ProtocolDeckProps) {
  const newSessionActive = Boolean(newSessionProtocolHash);
  const sectionRef = useRef<HTMLElement | null>(null);
  const carouselRef = useRef<DeckCarouselHandle | null>(null);
  const didInitialScroll = useRef(false);
  const [sectionHeight, setSectionHeight] = useState(0);

  const deck = useMemo(
    () => buildDeck({ protocols, showSampleCard, pendingImports }),
    [protocols, showSampleCard, pendingImports],
  );

  // Per-protocol session count, hoisted here so DeckCard doesn't take the
  // whole sessions array (which would break memo when other sessions
  // change).
  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      counts.set(s.protocolHash, (counts.get(s.protocolHash) ?? 0) + 1);
    }
    return counts;
  }, [sessions]);

  const slides = useMemo<DeckSlide[]>(
    () =>
      deck.map((entry) => {
        if (entry.kind === 'import') {
          return {
            key: entryKey(entry),
            entry,
            backdropBlur: true,
            onActivate: onImport,
            render: (_isActive: boolean, activate: () => void) => (
              <ImportTriggerCard onActivate={activate} />
            ),
          };
        }
        const newSession =
          entry.kind === 'protocol' &&
          newSessionProtocolHash != null &&
          entry.protocol.hash === newSessionProtocolHash &&
          onCancelNewSession &&
          onSessionCreated
            ? { onCancel: onCancelNewSession, onCreated: onSessionCreated }
            : undefined;
        return {
          key: entryKey(entry),
          entry,
          onActivate:
            entry.kind === 'protocol'
              ? () => onStartInterview(entry.protocol.hash)
              : entry.kind === 'sample'
                ? onInstallSample
                : undefined,
          render: (isActive: boolean, activate: () => void) => (
            <DeckSlotCard
              entry={entry}
              isActive={isActive}
              activate={activate}
              sessionCount={
                entry.kind === 'protocol'
                  ? (sessionCounts.get(entry.protocol.hash) ?? 0)
                  : 0
              }
              onDeleteProtocol={onDeleteProtocol}
              onDismissSample={onDismissSample}
              onInstallSample={onInstallSample}
              newSession={newSession}
            />
          ),
        };
      }),
    [
      deck,
      sessionCounts,
      newSessionProtocolHash,
      onImport,
      onStartInterview,
      onInstallSample,
      onDismissSample,
      onDeleteProtocol,
      onCancelNewSession,
      onSessionCreated,
    ],
  );

  const [activeIndex, setActiveIndexState] = useState(0);
  // The slot key the user last chose, so the active card stays the same
  // card (not the same index) when entries are added/removed and indexes
  // shift.
  const activeSlotKeyRef = useRef<string | null>(null);

  // All user navigation flows through here so activeSlotKeyRef tracks the
  // user's choice.
  const setActiveIndex = useCallback(
    (index: number) => {
      setActiveIndexState(index);
      activeSlotKeyRef.current = slides[index]?.key ?? null;
    },
    [slides],
  );

  useEffect(() => {
    // One-time deep link once the requested protocol is in the deck
    // (protocols load async). jumpTo is a no-op before the carousel mounts;
    // in that case the carousel initialises its position at activeIndex.
    if (!didInitialScroll.current && initialProtocolHash) {
      const idx = slides.findIndex(
        (s) =>
          s.entry.kind === 'protocol' &&
          s.entry.protocol.hash === initialProtocolHash,
      );
      if (idx >= 0) {
        didInitialScroll.current = true;
        carouselRef.current?.jumpTo(idx);
        setActiveIndexState(idx);
        activeSlotKeyRef.current = slides[idx]?.key ?? null;
        return;
      }
    }
    // Keep the active card stable across slot changes; if the active slot
    // itself vanished, the right neighbour inherits its index (clamped for
    // removal of the last slot). The travel animates via the carousel's
    // position spring, in lockstep with the slides' index springs.
    setActiveIndexState((current) => {
      const key = activeSlotKeyRef.current;
      const located =
        key === null ? -1 : slides.findIndex((s) => s.key === key);
      const next =
        located >= 0
          ? located
          : Math.max(0, Math.min(current, slides.length - 1));
      activeSlotKeyRef.current = slides[next]?.key ?? null;
      return next;
    });
  }, [slides, initialProtocolHash]);

  // Observe the section (not the outer container) so cardHeight tracks the
  // space actually available to the carousel. The outer container also
  // holds the chevron+dots row. Read borderBoxSize; contentRect excludes
  // our own padding and would feed back into the calculation.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const height = box?.blockSize ?? entry.target.clientHeight;
      setSectionHeight(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { cardWidth, cardHeight } = useMemo(() => {
    const padding = computeSectionPadding(sectionHeight);
    const innerHeight = Math.max(0, sectionHeight - padding * 2);
    const ch = Math.round(innerHeight);
    const cw = Math.round(ch * CARD_ASPECT);
    return { cardHeight: ch, cardWidth: cw };
  }, [sectionHeight]);

  useDeckKeyboard({
    enabled: !newSessionActive,
    onStep: useCallback(
      (direction: -1 | 1) => {
        setActiveIndex(
          Math.max(0, Math.min(slides.length - 1, activeIndex + direction)),
        );
      },
      [activeIndex, slides.length, setActiveIndex],
    ),
    onActivate: useCallback(() => {
      slides[activeIndex]?.onActivate?.();
    }, [slides, activeIndex]),
  });

  // Esc cancels the new-session form. Listen at the window so it works
  // regardless of which form control currently has focus.
  useEffect(() => {
    if (!newSessionActive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelNewSession?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newSessionActive, onCancelNewSession]);

  const atStart = activeIndex === 0;
  const atEnd = activeIndex === slides.length - 1;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
      <motion.section
        ref={sectionRef}
        variants={sectionVariants}
        aria-label="Protocol deck"
        className="flex max-h-[45rem] min-h-0 w-full flex-1 items-center justify-center"
      >
        {cardHeight > 0 ? (
          <DeckCarousel
            ref={carouselRef}
            slides={slides}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
            disabled={newSessionActive}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />
        ) : null}
      </motion.section>

      {slides.length > 1 && (
        <motion.div
          variants={chevronRowVariants}
          initial="hidden"
          animate={newSessionActive ? 'muted' : 'visible'}
          exit="exit"
          // Hide the row from assistive tech and pointer/keyboard events
          // while the form is open so it can't be tabbed into behind the
          // backdrop.
          aria-hidden={newSessionActive || undefined}
          inert={newSessionActive}
          className="z-6 flex shrink-0 items-center justify-center gap-7"
        >
          <IconButton
            size="xl"
            variant="text"
            icon={<ChevronLeft strokeWidth={2.8} aria-hidden />}
            aria-label="Previous protocol"
            onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
            disabled={atStart}
            className={GLASS_PILL}
          />
          <div className="flex items-center gap-2.5">
            {slides.map((slide, i) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Go to card ${i + 1}`}
                aria-current={i === activeIndex ? 'true' : undefined}
                className={`h-3 cursor-pointer rounded-full border-0 p-0 transition-all duration-200 ${
                  i === activeIndex ? 'bg-sea-green w-9' : 'bg-outline w-3'
                }`}
              />
            ))}
          </div>
          <IconButton
            size="xl"
            variant="text"
            icon={<ChevronRight strokeWidth={2.8} aria-hidden />}
            aria-label="Next protocol"
            onClick={() =>
              setActiveIndex(Math.min(slides.length - 1, activeIndex + 1))
            }
            disabled={atEnd}
            className={GLASS_PILL}
          />
        </motion.div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and run all ProtocolCarousel unit tests**

Run: `pnpm --filter @codaco/interviewer-v7 typecheck && pnpm vitest run --project=unit src/components/ProtocolCarousel`
Expected: both PASS. The stories file still compiles because the props contract is unchanged.

- [ ] **Step 3: Smoke-check in Storybook**

Run: `pnpm storybook` (from `apps/interviewer-v7`), open `Components/ProtocolDeck → Playground`, and verify by hand:

1. Deck renders fanned cards; active card is centred, full opacity.
2. Drag left/right follows the pointer and snaps; flick advances.
3. Mouse wheel steps one card with a pause between steps.
4. Arrow keys step; Enter on the import card adds a protocol (drop-in animation plays, deck doesn't jump).
5. Delete a protocol: card scales out in place, neighbours close the gap, the centred card doesn't jump.
6. Install sample: sample card morphs to installing (progress) to installed protocol **in place, without remounting** — title and chrome cross-fade via the card's internal layout animations.
7. Chevrons and dots navigate; chevrons disable at the ends.

Kill Storybook when done. If anything misbehaves, fix it now — the most likely candidates are spring constants (feel) and the wheel cooldown (tune `WHEEL_THRESHOLD` / `WHEEL_COOLDOWN_MS` / `FLICK_PROJECTION_S` / `DECK_SPRING` in `DeckCarousel.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/components/ProtocolCarousel/ProtocolDeck.tsx
git commit -m "feat(interviewer-v7): rewrite ProtocolDeck on motion-native DeckCarousel"
```

---

### Task 7: Remove the Swiper dependency

**Files:**

- Modify: `apps/interviewer-v7/package.json` (remove the `"swiper": "^12.2.0"` line from dependencies)
- Modify: `src/components/ProtocolCarousel/cardStyles.ts` (stale comment)
- Modify: `pnpm-lock.yaml` (via install)

- [ ] **Step 1: Verify nothing else imports swiper**

Run: `grep -rn "from 'swiper" apps/interviewer-v7/src` and `grep -rn "swiper/css" apps/interviewer-v7/src`
Expected: no matches (Task 6 removed the only importer).

- [ ] **Step 2: Remove the dependency and update the stale comment**

In `apps/interviewer-v7/package.json`, delete the line `"swiper": "^12.2.0",`.

In `src/components/ProtocolCarousel/cardStyles.ts`, replace the comment above `importCardClass`:

```ts
// backdrop-blur is intentionally NOT here — backdrop-filter doesn't propagate
// through ancestor stacking contexts created by transform/perspective, and the
// deck carousel applies both. DeckCarousel puts the blur on the slide's
// lifecycle wrapper instead (the wrapper is itself transformed, but
// backdrop-filter on a transformed element reads from outside it, which works).
```

- [ ] **Step 3: Reinstall and verify the build**

Run (from repo root): `pnpm install`
Expected: lockfile updated, swiper removed.

Run (from repo root): `pnpm --filter @codaco/interviewer-v7 build`
Expected: build succeeds with no swiper imports.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/package.json apps/interviewer-v7/src/components/ProtocolCarousel/cardStyles.ts pnpm-lock.yaml
git commit -m "chore(interviewer-v7): remove swiper dependency"
```

---

### Task 8: Storybook interaction stories

The existing `ProtocolDeck.stories.tsx` harness (`DeckHarness`) keeps working unchanged. Add play-function stories that exercise the carousel in real Chromium via the `storybook` vitest project. Initial deck order in the harness (sorted, import last): `Friendship Ties` (0), `Sample Protocol` (1), `Social Support Networks` (2), import (3) — 4 dots.

**Files:**

- Modify: `src/components/ProtocolCarousel/ProtocolDeck.stories.tsx`

- [ ] **Step 1: Add the interaction stories**

Add to the imports at the top of the file:

```tsx
import { expect, userEvent, waitFor, within } from 'storybook/test';
```

Append these stories after `Playground`:

```tsx
// Chevrons and dots are plain buttons driving the controlled activeIndex.
export const ChevronAndDotNavigation: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);
    await expect(dots[0]).toHaveAttribute('aria-current', 'true');

    await userEvent.click(canvas.getByLabelText('Next protocol'));
    await waitFor(() =>
      expect(dots[1]).toHaveAttribute('aria-current', 'true'),
    );

    await userEvent.click(dots[3] as HTMLElement);
    await waitFor(() =>
      expect(dots[3]).toHaveAttribute('aria-current', 'true'),
    );
    await expect(canvas.getByLabelText('Next protocol')).toBeDisabled();

    await userEvent.click(canvas.getByLabelText('Previous protocol'));
    await waitFor(() =>
      expect(dots[2]).toHaveAttribute('aria-current', 'true'),
    );
  },
};

// Window-level arrows step the deck; Enter activates the active card (the
// import card's primary action adds a protocol in this harness).
export const KeyboardNavigation: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await waitFor(() =>
      expect(dots[3]).toHaveAttribute('aria-current', 'true'),
    );

    await userEvent.keyboard('{Enter}');
    await waitFor(async () => {
      const updated = await canvas.findAllByLabelText(/Go to card/);
      expect(updated).toHaveLength(5);
    });

    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(async () => {
      const updated = await canvas.findAllByLabelText(/Go to card/);
      // After insertion the import card is index 4; ArrowLeft moves to 3.
      expect(updated[3]).toHaveAttribute('aria-current', 'true');
    });
  },
};

// Tapping a non-active card navigates to it instead of activating it.
export const ClickToNavigate: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots[0]).toHaveAttribute('aria-current', 'true');

    await userEvent.click(canvas.getByText('Social Support Networks'));
    await waitFor(() =>
      expect(dots[2]).toHaveAttribute('aria-current', 'true'),
    );
  },
};

// Removal: the card exits in place and neighbours close the gap; the
// active slot follows the clamp (right neighbour inherits the index).
export const DeleteActiveProtocol: Story = {
  render: () => <DeckHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dots = await canvas.findAllByLabelText(/Go to card/);
    await expect(dots).toHaveLength(4);

    // The active card is Friendship Ties; its delete button is the first.
    const deleteButtons = canvas.getAllByLabelText('Delete Protocol');
    await userEvent.click(deleteButtons[0] as HTMLElement);

    await waitFor(
      async () => {
        const updated = await canvas.findAllByLabelText(/Go to card/);
        expect(updated).toHaveLength(3);
        expect(updated[0]).toHaveAttribute('aria-current', 'true');
      },
      { timeout: 3000 },
    );
  },
};
```

- [ ] **Step 2: Run the Storybook test project**

Run: `pnpm test:storybook`
Expected: all ProtocolDeck stories PASS (plus existing stories unaffected). If `KeyboardNavigation`'s Enter step is flaky because focus sits on an interactive element after the arrow presses, click the canvas body first (`await userEvent.click(canvasElement)` — the deck section is not interactive, so the Enter guard allows it).

- [ ] **Step 3: Commit**

```bash
git add src/components/ProtocolCarousel/ProtocolDeck.stories.tsx
git commit -m "test(interviewer-v7): add ProtocolDeck interaction stories"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the complete check suite**

From the repo root:

```bash
pnpm --filter @codaco/interviewer-v7 typecheck
pnpm lint:fix
pnpm knip
```

From `apps/interviewer-v7`:

```bash
pnpm test
pnpm test:storybook
```

Expected: all PASS. `pnpm knip` must not report swiper (removed) or any unused export in the new modules — if it flags an export, remove the export rather than ignoring it.

- [ ] **Step 2: App smoke test**

Run `pnpm dev` (from `apps/interviewer-v7`, port 5180 — kill any existing dev server first) and verify the Home route end-to-end: import a protocol (pending card appears with progress, morphs to the installed card), start a new session (form locks the deck: no drag, no wheel, no arrows; Esc cancels), delete a protocol, and confirm the deep-link behavior (set a last-used protocol, reload, deck opens on it without animation).

- [ ] **Step 3: Record the remaining manual item**

Drag feel on iPad/Android (snap stiffness, flick projection, overscroll resistance) needs a hands-on pass on real hardware before merge — the constants to tune are at the top of `DeckCarousel.tsx`. Flag this in the PR description.

- [ ] **Step 4: Commit any verification fixes**

```bash
git add -A
git commit -m "fix(interviewer-v7): address verification findings for deck rewrite"
```

(Skip if there were no findings.)
