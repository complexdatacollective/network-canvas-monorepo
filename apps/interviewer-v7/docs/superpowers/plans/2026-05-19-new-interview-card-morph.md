# New-interview card-morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Morph the active protocol card into the new-session dialog using motion's shared-layout animation, with the dialog redesigned to preserve the card's visual identity (Pattern banner, name, meta, description) and replace the "Start new interview" button with a Case ID field + Cancel / Start interview buttons.

**Architecture:** `@codaco/fresco-ui`'s `Dialog`/`ModalPopup` already supports a `layoutId` prop that switches `ModalPopup` to motion's shared-element animation. We (1) reshape `NewSessionDialog` to take a `ProtocolWithCounts` directly so it can render the card's content during the morph, (2) replace fresco-ui's opinionated `Dialog` with raw `Modal` + `ModalPopup` so the popup can mirror the card's layout, (3) wrap the inner protocol card in `motion.div` with `layoutId={`protocol-card-${hash}`}`, and (4) thread the active hash from `Home` to `ProtocolDeck` → `DeckCard` so the source card disappears (without reflowing the deck) while the morph runs.

**Tech Stack:** React 18, motion/react (shared layout), wouter (routing), @codaco/fresco-ui (Modal/ModalPopup/Form/Button), @codaco/art (Pattern). Vite + Biome.

**Spec:** `docs/superpowers/specs/2026-05-19-new-interview-card-morph-design.md`

**Verification model:** This codebase has no component tests for the renderer (see `src/components/`). Each task's gates are: `pnpm typecheck` (from `apps/interviewer-v7`) and `pnpm lint:fix` (from repo root) must succeed. The final task does end-to-end visual verification in a real browser. Don't add a component test stack just for this work.

---

## File map

| File                                                      | Action         | Responsibility                                                                                                                  |
| --------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/interviewer-v7/src/components/NewSessionDialog.tsx` | Modify (heavy) | Hosts the morph target; renders Pattern banner + form.                                                                          |
| `apps/interviewer-v7/src/components/DeckCard.tsx`         | Modify (light) | Inner card root becomes `motion.div` with `layoutId`; hides when `isExpanding`.                                                 |
| `apps/interviewer-v7/src/components/ProtocolDeck.tsx`     | Modify (light) | Forwards `expandingProtocolHash` to the right card.                                                                             |
| `apps/interviewer-v7/src/routes/Home.tsx`                 | Modify (light) | Resolves `pendingProtocolHash` → `ProtocolWithCounts`, passes `layoutId` to the dialog and `expandingProtocolHash` to the deck. |
| `apps/interviewer-v7/src/routes/Protocols.tsx`            | Modify (light) | Adapts call site to the new `protocol` prop. No `layoutId` (no morph here).                                                     |

No new files, no new exports, no new dependencies.

---

### Task 1: Reshape `NewSessionDialog` prop surface (no visual change yet)

Pull the prop refactor out of the visual redesign so any breakage shows up here, not mixed in with the morph layout.

**Files:**

- Modify: `apps/interviewer-v7/src/components/NewSessionDialog.tsx`
- Modify: `apps/interviewer-v7/src/routes/Home.tsx`
- Modify: `apps/interviewer-v7/src/routes/Protocols.tsx`

- [ ] **Step 1: Update `NewSessionDialog` to take `protocol: ProtocolWithCounts` and an optional `layoutId`**

Replace the current props + the `protocolName` fetch with the protocol passed directly. The visual shell stays as the fresco-ui `Dialog` for this task; only the data flow changes.

```tsx
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { useToast } from '@codaco/fresco-ui/Toast';
import { createInitialNetwork } from '@codaco/interview';
import { createSession } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

type NewSessionDialogProps = {
  open: boolean;
  protocol: ProtocolWithCounts;
  onClose: () => void;
  onCreated: (session: StoredSession) => void;
  layoutId?: string;
};

const FORM_ID = 'new-session-form';

export function NewSessionDialog({
  open,
  protocol,
  onClose,
  onCreated,
  layoutId,
}: NewSessionDialogProps) {
  const toast = useToast();

  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={onClose}
        layoutId={layoutId}
        title="Start a new interview"
        description={`Using ${protocol.name}`}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton form={FORM_ID}>Start interview</SubmitButton>
          </>
        }
      >
        <FormWithoutProvider
          id={FORM_ID}
          onSubmit={async (values) => {
            const caseId = String(values.caseId ?? '').trim();
            if (!caseId) {
              return {
                success: false,
                fieldErrors: { caseId: ['Case ID is required'] },
              };
            }
            const session = await createSession({
              protocolHash: protocol.hash,
              protocolName: protocol.name,
              caseId,
              initialNetwork: createInitialNetwork(),
            });
            onCreated(session);
            return { success: true };
          }}
        >
          <Field
            name="caseId"
            label="Case ID"
            hint="A label used to identify this interview in exports."
            component={InputField}
            required="Case ID is required"
            minLength={1}
            validateOnChange
          />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}
```

Note: this drops `useState`, `useEffect`, and the `getProtocolByHash` import that fetched the name — they are no longer used.

- [ ] **Step 2: Update `Home.tsx` call site to pass the resolved `ProtocolWithCounts`**

Find the existing block at `apps/interviewer-v7/src/routes/Home.tsx:102-112` and replace with a version that looks up the protocol from existing state:

```tsx
{
  pendingProtocolHash
    ? (() => {
        const pendingProtocol = protocols.find(
          (p) => p.hash === pendingProtocolHash,
        );
        if (!pendingProtocol) return null;
        return (
          <NewSessionDialog
            open
            protocol={pendingProtocol}
            onClose={() => setPendingProtocolHash(null)}
            onCreated={(session) => {
              setPendingProtocolHash(null);
              navigate(`/interview/${session.id}`, { state: { fresh: true } });
            }}
          />
        );
      })()
    : null;
}
```

Don't add `layoutId` yet — that wires up in Task 5.

- [ ] **Step 3: Update `Protocols.tsx` call site (`apps/interviewer-v7/src/routes/Protocols.tsx:179-189`)**

```tsx
{
  newSessionProtocolHash
    ? (() => {
        const protocol = protocols.find(
          (p) => p.hash === newSessionProtocolHash,
        );
        if (!protocol) return null;
        return (
          <NewSessionDialog
            open
            protocol={protocol}
            onClose={() => setNewSessionProtocolHash(null)}
            onCreated={(session) => {
              setNewSessionProtocolHash(null);
              navigate(`/interview/${session.id}`, { state: { fresh: true } });
            }}
          />
        );
      })()
    : null;
}
```

- [ ] **Step 4: Type-check and lint**

```bash
cd apps/interviewer-v7 && pnpm typecheck
cd ../.. && pnpm lint:fix
```

Expected: both pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/interviewer-v7/src/components/NewSessionDialog.tsx apps/interviewer-v7/src/routes/Home.tsx apps/interviewer-v7/src/routes/Protocols.tsx
git -c commit.gpgsign=false commit -m "refactor(interviewer-v7): NewSessionDialog takes ProtocolWithCounts directly"
```

---

### Task 2: Replace `Dialog` with `Modal` + `ModalPopup` and the expanded-card layout

Now do the visual redesign in one step — the popup mirrors the card's structure so the morph (wired in later tasks) reads as the card growing.

**Files:**

- Modify: `apps/interviewer-v7/src/components/NewSessionDialog.tsx`

- [ ] **Step 1: Rewrite `NewSessionDialog.tsx`**

Full file contents:

```tsx
import { useId } from 'react';

import { Pattern } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { createInitialNetwork } from '@codaco/interview';
import { createSession } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

type NewSessionDialogProps = {
  open: boolean;
  protocol: ProtocolWithCounts;
  onClose: () => void;
  onCreated: (session: StoredSession) => void;
  layoutId?: string;
};

export function NewSessionDialog({
  open,
  protocol,
  onClose,
  onCreated,
  layoutId,
}: NewSessionDialogProps) {
  const toast = useToast();
  const formId = useId();

  const popupProps = layoutId ? { layoutId } : {};
  const interviewLabel =
    protocol.sessionCount === 1 ? 'interview' : 'interviews';

  return (
    <FormStoreProvider>
      <Modal
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        <ModalPopup
          {...popupProps}
          className="tablet-portrait:w-auto fixed top-1/2 left-1/2 flex w-[calc(100%-var(--spacing-base)*8)] max-w-2xl -translate-1/2 flex-col overflow-hidden bg-surface-1 shadow-2xl"
        >
          <div className="relative min-h-[200px] w-full overflow-hidden p-6 pb-8">
            <Pattern
              seed={protocol.name}
              className="absolute inset-0 size-full"
            />
            <div className="relative">
              <Heading
                level="h2"
                margin="none"
                className="max-w-[90%] leading-[0.98] font-black tracking-tight text-white"
              >
                {protocol.name}
              </Heading>
              <div className="font-monospace mt-2.5 text-xs text-white/85">
                Schema v{protocol.schemaVersion}
              </div>
            </div>
          </div>

          <div className="font-monospace flex items-center justify-between px-6 pt-4 text-xs">
            <span className="text-text/60">
              Imported <TimeAgo date={protocol.importedAt} />
            </span>
            <span className="text-text/60">
              {protocol.sessionCount} {interviewLabel}
            </span>
          </div>

          {protocol.description ? (
            <p className="text-text/80 px-6 pt-3.5 text-sm leading-[1.45]">
              {protocol.description}
            </p>
          ) : null}

          <FormWithoutProvider
            id={formId}
            onSubmit={async (values) => {
              const caseId = String(values.caseId ?? '').trim();
              if (!caseId) {
                return {
                  success: false,
                  fieldErrors: { caseId: ['Case ID is required'] },
                };
              }
              const session = await createSession({
                protocolHash: protocol.hash,
                protocolName: protocol.name,
                caseId,
                initialNetwork: createInitialNetwork(),
              });
              onCreated(session);
              return { success: true };
            }}
          >
            <div className="px-6 pt-5">
              <Field
                name="caseId"
                label="Case ID"
                hint="A label used to identify this interview in exports."
                component={InputField}
                required="Case ID is required"
                minLength={1}
                validateOnChange
              />
            </div>
          </FormWithoutProvider>

          <footer className="phone-landscape:flex-row phone-landscape:justify-end mt-6 flex flex-col gap-2 px-6 pb-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton form={formId}>Start interview</SubmitButton>
          </footer>
        </ModalPopup>
      </Modal>
    </FormStoreProvider>
  );
}
```

Key implementation notes (do not skip these — they are easy to get wrong):

- **`popupProps` spread**: `ModalPopup`'s discriminated-union type rejects passing `layoutId={undefined}` directly (it's typed as `{ layoutId: string; initial?: never; ... }`). Build the spread object so undefined cases pass no `layoutId` key at all.
- **`useId()` for form id**: avoids a collision if the dialog ever co-mounts with another instance (Home and Protocols won't, but `useId` is the idiomatic fix and costs nothing).
- **No `Dialog.Title` / `Dialog.Description`**: we're using `Modal` directly, not `Dialog`. Base UI's accessibility model still kicks in via `Dialog.Root` inside `Modal`, but we own all the visible structure inside the popup.
- **Backdrop**: handled automatically by `Modal` (it renders `ModalBackdrop` via `AnimatePresence`).
- **`Pattern` className**: keep the `absolute inset-0 size-full` overlay pattern from the card so the banner renders identically.

- [ ] **Step 2: Type-check and lint**

```bash
cd apps/interviewer-v7 && pnpm typecheck
cd ../.. && pnpm lint:fix
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/interviewer-v7/src/components/NewSessionDialog.tsx
git -c commit.gpgsign=false commit -m "feat(interviewer-v7): NewSessionDialog mirrors protocol-card layout"
```

---

### Task 3: Make the protocol card a morph source (`DeckCard.tsx`)

**Files:**

- Modify: `apps/interviewer-v7/src/components/DeckCard.tsx`

- [ ] **Step 1: Add `motion` import and `isExpanding` prop**

At the top of the file, add `motion` to the existing imports — there is no motion import yet, so add a new one near the other `react`/`forwardRef` imports:

```tsx
import { motion } from 'motion/react';
```

Add `isExpanding: boolean;` to `DeckCardProps` (`apps/interviewer-v7/src/components/DeckCard.tsx:112-123`):

```tsx
type DeckCardProps = {
  entry: DeckEntry;
  index: number;
  totalCards: number;
  sectionRef: RefObject<HTMLElement | null>;
  slotWidth: number;
  cardWidth: number;
  cardHeight: number;
  isActive: boolean;
  isExpanding: boolean;
  sessionCount: number;
  onActivate: (idx: number) => void;
};
```

Destructure `isExpanding` in `DeckCardInner` alongside the other props (`apps/interviewer-v7/src/components/DeckCard.tsx:126-139`).

- [ ] **Step 2: Wrap the protocol-card root in `motion.div` with `layoutId` + opacity**

Replace the protocol-card branch's root `<div>` (currently at `apps/interviewer-v7/src/components/DeckCard.tsx:210-280`) so the inner `cardRef` element is a `motion.div`:

```tsx
return (
  <div ref={slotRef} className={SLOT_CLASS} style={{ width: slotWidth }}>
    <motion.div
      layoutId={`protocol-card-${protocol.hash}`}
      ref={(el) => {
        cardRef.current = el;
      }}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={onCardKeyDown}
      style={{
        width: cardWidth,
        height: cardHeight,
        boxShadow,
        opacity: isExpanding ? 0 : 1,
      }}
      className={`${cardBase()} ${protocolCardClass()} will-change-transform`}
      aria-label={`${protocol.name}${isActive ? ' (active)' : ''}`}
    >
      {/* unchanged: Cover, Meta row, Description, CTA */}
    </motion.div>
  </div>
);
```

Important constraints:

- **Keep the `cardRef` callback as the motion element's ref**. The ScrollTimeline `useEffect` reads from `cardRef.current` and calls `Element.animate(...)` on it — that still works on a motion-managed element because motion writes inline `transform` only when a layout animation runs, and WAAPI animations override inline styles. The card is invisible during the morph anyway, so any visual conflict during that window doesn't matter.
- **Do not** add `layout` (without `Id`) — that opts into auto-layout animation on every render, which would fight scroll-snap.
- **Do not** wrap the `<motion.div>` in `<AnimatePresence>` here. The motion morph reconciler matches against the popup's `layoutId` directly.
- **Only the protocol-card branch changes.** The import-card branch (`entry.kind === 'import'`) stays a plain `<button>` with no layoutId.

- [ ] **Step 3: Type-check and lint**

```bash
cd apps/interviewer-v7 && pnpm typecheck
cd ../.. && pnpm lint:fix
```

Note: this task introduces a required `isExpanding` prop. `ProtocolDeck` doesn't pass it yet, so **typecheck will fail at this step**. That's expected; Task 4 closes the gap.

- [ ] **Step 4: Don't commit yet**

Hold the commit until Task 4 fixes the typecheck. (Splitting in two keeps each change clearly scoped without leaving an unbuildable commit in history.)

---

### Task 4: Thread `expandingProtocolHash` through `ProtocolDeck.tsx`

**Files:**

- Modify: `apps/interviewer-v7/src/components/ProtocolDeck.tsx`

- [ ] **Step 1: Add `expandingProtocolHash` to props**

Update `ProtocolDeckProps` (`apps/interviewer-v7/src/components/ProtocolDeck.tsx:24-30`):

```tsx
type ProtocolDeckProps = {
  protocols: ProtocolWithCounts[];
  sessions: StoredSession[];
  initialProtocolHash?: string;
  expandingProtocolHash?: string;
  onImport: () => void;
  onStartInterview: (protocolHash: string) => void;
};
```

Destructure it in the function signature (`apps/interviewer-v7/src/components/ProtocolDeck.tsx:32-38`):

```tsx
export function ProtocolDeck({
  protocols,
  sessions,
  initialProtocolHash,
  expandingProtocolHash,
  onImport,
  onStartInterview,
}: ProtocolDeckProps) {
```

- [ ] **Step 2: Forward `isExpanding` to each `DeckCard`**

Inside the `deck.map((entry, i) => (` block (`apps/interviewer-v7/src/components/ProtocolDeck.tsx:314-335`), add the prop:

```tsx
<DeckCard
  key={entry.kind === 'import' ? 'import' : entry.protocol.hash}
  ref={(el) => {
    cardRefs.current[i] = el;
  }}
  entry={entry}
  index={i}
  totalCards={deck.length}
  sectionRef={sectionRef}
  slotWidth={slotWidth}
  cardWidth={cardWidth}
  cardHeight={cardHeight}
  isActive={i === activeIdx}
  isExpanding={
    entry.kind === 'protocol' && entry.protocol.hash === expandingProtocolHash
  }
  sessionCount={
    entry.kind === 'protocol'
      ? (sessionCounts.get(entry.protocol.hash) ?? 0)
      : 0
  }
  onActivate={handleActivate}
/>
```

- [ ] **Step 3: Type-check and lint**

```bash
cd apps/interviewer-v7 && pnpm typecheck
cd ../.. && pnpm lint:fix
```

Expected: both pass (the prop introduced in Task 3 is now satisfied; Home still passes no `expandingProtocolHash`, which is allowed since it's optional).

- [ ] **Step 4: Commit Tasks 3 + 4 together**

```bash
git add apps/interviewer-v7/src/components/DeckCard.tsx apps/interviewer-v7/src/components/ProtocolDeck.tsx
git -c commit.gpgsign=false commit -m "feat(interviewer-v7): protocol cards become shared-layout morph sources"
```

---

### Task 5: Wire the morph in `Home.tsx`

**Files:**

- Modify: `apps/interviewer-v7/src/routes/Home.tsx`

- [ ] **Step 1: Pass `expandingProtocolHash` to `ProtocolDeck`**

Update the `<ProtocolDeck …/>` call at `apps/interviewer-v7/src/routes/Home.tsx:72-78`:

```tsx
<ProtocolDeck
  protocols={protocols}
  sessions={sessions}
  initialProtocolHash={settings?.lastActiveProtocolHash}
  expandingProtocolHash={pendingProtocolHash ?? undefined}
  onImport={() => setOpenDialog('import')}
  onStartInterview={setPendingProtocolHash}
/>
```

- [ ] **Step 2: Pass `layoutId` to `NewSessionDialog`**

Update the `NewSessionDialog` block (the one rewritten in Task 1, Step 2):

```tsx
{
  pendingProtocolHash
    ? (() => {
        const pendingProtocol = protocols.find(
          (p) => p.hash === pendingProtocolHash,
        );
        if (!pendingProtocol) return null;
        return (
          <NewSessionDialog
            open
            protocol={pendingProtocol}
            layoutId={`protocol-card-${pendingProtocolHash}`}
            onClose={() => setPendingProtocolHash(null)}
            onCreated={(session) => {
              setPendingProtocolHash(null);
              navigate(`/interview/${session.id}`, { state: { fresh: true } });
            }}
          />
        );
      })()
    : null;
}
```

The `Protocols.tsx` call site stays without `layoutId` — that route has no card to morph from and gets the default popup animation, as designed.

- [ ] **Step 3: Type-check and lint**

```bash
cd apps/interviewer-v7 && pnpm typecheck
cd ../.. && pnpm lint:fix
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add apps/interviewer-v7/src/routes/Home.tsx
git -c commit.gpgsign=false commit -m "feat(interviewer-v7): morph protocol card into new-session dialog on Home"
```

---

### Task 6: Visual verification in the browser

This is the only end-to-end check. Type/lint passing doesn't tell us the morph reads correctly.

**Files:** none

- [ ] **Step 1: Start the dev server**

From `apps/interviewer-v7`:

```bash
pnpm dev
```

Vite will print a local URL (usually `http://localhost:5173`). Open it.

- [ ] **Step 2: Reach Home with at least one protocol imported**

If no protocols exist, use the import flow first (import a `.netcanvas` from `packages/development-protocol/protocol.json` packaging or any test file you already have).

- [ ] **Step 3: Verify forward morph**

Click the active card's "Start new interview" button (or press Enter while focus is on the card).

Expected visuals:

- The card grows from its slot position to a centered popup, with the Pattern banner, protocol name, and schema version visible throughout the morph (no flicker, no color flash).
- A backdrop fades in behind it.
- The other cards in the deck stay in place — no slot reflow, no shift.
- Below the description, the Case ID input field and Cancel / Start interview buttons appear.

- [ ] **Step 4: Verify reverse morph on cancel**

Click `Cancel` (or press `Esc`, or click the backdrop).

Expected: the popup shrinks back into the card slot, the backdrop fades out, and the original card returns to its position with no visual artifact.

- [ ] **Step 5: Verify successful submit**

Re-open the dialog, type a Case ID, press `Start interview`.

Expected: the route transitions to `/interview/{id}`. No reverse morph plays — the morphed dialog persists visually until the route swap, then the Interview screen takes over.

- [ ] **Step 6: Verify Protocols route unchanged**

Navigate to `/protocols`. Click `Start interview` on any row.

Expected: the standard fresco-ui `Modal` popup animation (scale + fade) plays — no morph. Submitting still navigates correctly.

- [ ] **Step 7: Verify deck interactions during dialog are gated**

With the dialog open on Home, try pressing Arrow keys. Expected: the deck does not scroll (focus is in the Case ID input → `ProtocolDeck`'s key handler short-circuits on editable targets).

- [ ] **Step 8: Stop the dev server and report**

If all checks pass, report task complete. If anything looks wrong, capture which step and what you observed — those are the bugs to fix before declaring done.

This task does not produce a commit.
