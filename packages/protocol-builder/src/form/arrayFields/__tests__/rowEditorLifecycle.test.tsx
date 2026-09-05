import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  type ProtocolBuilderAccess,
  type ProtocolBuilderSession,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
} from '../../../session.ts';
import { DialogFormField } from '../../DialogForm.tsx';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import DialogArrayField from '../DialogArrayField.tsx';

/**
 * The row editor's whole lifecycle, against a model of what it owes the
 * researcher.
 *
 * Open, edit, an arrival from elsewhere, save, a refusal, a retry, a
 * cancellation, the row being removed underneath, the lease going and coming
 * back — each of those has been fixed on its own, and each fix has been undone
 * by the next interleaving. So the rule is stated once, declaratively, and
 * random interleavings are run against it:
 *
 * - the dialog is open exactly when the model says a session is open;
 * - the draft on screen is what the researcher last typed, whatever arrived
 *   meanwhile;
 * - a save writes the leaves the researcher DECIDED (the ones whose value
 *   differs from the row the dialog opened on) over the row as the document
 *   holds it NOW, and nothing else — so an arrival to an untouched leaf,
 *   nested or not, survives;
 * - a save that committed nothing keeps the dialog open with a message, and
 *   never reports itself as a save;
 * - closing over a draft the researcher would lose asks first.
 *
 * The model is deliberately NOT the production algorithm restated: it names
 * the outcome (live row + decided leaves) where the implementation composes a
 * merge of the opened-on row with a re-seat onto the current one.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type PromptRow = {
  id: string;
  text: string;
  /** `null` is a shape stored protocol data holds; nothing may throw on it. */
  helpText: string | null;
  /** A nested key the editor renders ONE leaf of. */
  sort: { property: string; direction: string };
  /** A key the editor never renders at all. */
  tags: string[];
};

const INITIAL_ROWS: readonly PromptRow[] = Object.freeze([
  {
    id: 'a',
    text: 'Alpha',
    helpText: 'Help A',
    sort: { property: 'name', direction: 'asc' },
    tags: ['one'],
  },
  {
    id: 'b',
    text: 'Bravo',
    helpText: 'Help B',
    sort: { property: 'age', direction: 'desc' },
    tags: ['two'],
  },
]);

/** The leaves the editor renders — the only ones a researcher can decide. */
const RENDERED_LEAVES = ['text', 'helpText', 'sortProperty'] as const;
type RenderedLeaf = (typeof RENDERED_LEAVES)[number];

const LEAF_LABEL: Readonly<Record<RenderedLeaf, string>> = Object.freeze({
  text: 'Prompt text',
  helpText: 'Help text',
  sortProperty: 'Sort property',
});

type Draft = Record<RenderedLeaf, string>;

/** What the row holds at each leaf the editor renders. */
const renderedOf = (row: PromptRow): Record<RenderedLeaf, unknown> => ({
  text: row.text,
  helpText: row.helpText,
  sortProperty: row.sort.property,
});

/** The draft a dialog opens with: the row's leaves, as controls hold them. */
const draftOf = (row: PromptRow): Draft => ({
  text: row.text,
  helpText: typeof row.helpText === 'string' ? row.helpText : '',
  sortProperty: row.sort.property,
});

const writeLeaf = (row: PromptRow, leaf: RenderedLeaf, value: string) => {
  if (leaf === 'sortProperty') {
    row.sort = { ...row.sort, property: value };
    return;
  }
  row[leaf] = value;
};

type OpenDialog = {
  id: string;
  /** The row this session OPENED on — what a submitted value is judged against. */
  base: PromptRow;
  /** The row as the dialog last saw it; what its fields' initial values track. */
  live: PromptRow;
  draft: Draft;
  /** Whether a refusal this editor is showing is holding it open. */
  refused: boolean;
  /**
   * Whether the LIST has stopped editing this row while the editor stayed open
   * — a commit the session refused, a row removed from under a draft the
   * researcher chose to keep. The dialog is then the only thing that still
   * knows which row it belongs to, and it stops being told what reaches that
   * row: what its fields opened against is the row as it was last seen.
   */
  detached: boolean;
};

type Model = {
  rows: PromptRow[];
  dialog: OpenDialog | null;
  /** The host refuses the next structural write without telling the form. */
  refusing: boolean;
  readOnly: boolean;
  /**
   * The list is rendering a row the document does not hold — a refused commit
   * left `ArrayField`'s own optimistic copy standing. It is corrected by the
   * next change to the list's value, and until then a row cannot be addressed
   * by position on screen.
   */
  staleList: boolean;
};

const isDirty = (dialog: OpenDialog): boolean => {
  const live = renderedOf(dialog.live);
  return RENDERED_LEAVES.some((leaf) => dialog.draft[leaf] !== live[leaf]);
};

const decidedLeaves = (dialog: OpenDialog): RenderedLeaf[] => {
  const base = renderedOf(dialog.base);
  return RENDERED_LEAVES.filter((leaf) => dialog.draft[leaf] !== base[leaf]);
};

// ─── The editor under test ──────────────────────────────────────────────────

function PromptPreview({ text }: Record<string, unknown>) {
  return <span>{typeof text === 'string' ? text : ''}</span>;
}

/**
 * Three controls over three shapes: a plain key, a key an arrival can set to
 * `null`, and ONE leaf of a nested object whose sibling leaf no control here
 * ever renders. The nested pair is the shape `reseatEditedRow` is written for
 * — `edges.create` edited while `edges.display` arrives from elsewhere.
 */
function LifecycleFields({ item }: Record<string, unknown>) {
  const row = isRecord(item) ? item : {};
  const sort = isRecord(row.sort) ? row.sort : {};

  return (
    <>
      <DialogFormField name="text" label="Prompt text" component={InputField} />
      <DialogFormField
        name="helpText"
        label="Help text"
        component={InputField}
      />
      {/*
        A nested name is not a key of `initialValues`, which is keyed by field
        name, so the row states this one itself — the contract `DialogForm`
        names for exactly this case.
      */}
      <DialogFormField
        name="sort.property"
        label="Sort property"
        component={InputField}
        initialValue={
          typeof sort.property === 'string' ? sort.property : undefined
        }
      />
    </>
  );
}

function createStore(rows: readonly PromptRow[]) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields: { prompts: structuredClone(rows) } as SectionDoc,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Row editor lifecycle',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

/**
 * A session whose writes can be refused mid-dispatch while its snapshot still
 * says the stage is editable — the lease taken back between the render a
 * handler was built in and the dispatch that runs it. `setAccess` cannot stand
 * in for it: it re-renders, so the editor's own read-only check answers first
 * and the dispatch is never reached.
 */
function withRefusableDispatch(store: ProtocolBuilderSessionStore) {
  let refusing = false;
  const session: ProtocolBuilderSession = {
    subscribe: (listener) => store.subscribe(listener),
    getSnapshot: () => store.getSnapshot(),
    getServerSnapshot: () => store.getServerSnapshot(),
    dispatch: (commands) => {
      if (refusing) throw new SessionReadOnlyError();
      store.dispatch(commands);
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
    validate: () => store.validate(),
    requestCompoundEdit: (request) => store.requestCompoundEdit(request),
    finish: () => store.finish(),
    cancel: () => store.cancel(),
    getResourceGateway: () => store.getResourceGateway(),
  };

  return {
    session,
    setRefusing: (value: boolean) => {
      refusing = value;
    },
    /**
     * A write from somewhere other than this editor. It goes straight to the
     * store: the refusal above describes what happens to the FORM's own
     * writes, and a collaborator does not lose their lease because this one
     * did.
     */
    dispatchElsewhere: (commands: Parameters<typeof store.dispatch>[0]) => {
      act(() => {
        store.dispatch(commands);
      });
    },
    setAccess: (access: ProtocolBuilderAccess) => {
      act(() => {
        store.setAccess(access);
      });
    },
    rows: (): unknown => store.getSnapshot().editedSection.fields.prompts,
  };
}

function renderLifecycleList(session: ProtocolBuilderSession) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell controller={controller}>
        <BuilderSection title="Prompts">
          <ProtocolArrayField
            name="prompts"
            label="Prompts"
            component={DialogArrayField}
            addButtonLabel="Create new prompt"
            editorTitle="Edit prompt"
            addTitle="Add prompt"
            itemLabel="prompt"
            previewComponent={PromptPreview}
            editorFieldsComponent={LifecycleFields}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return render(
    <DialogProvider>
      <Host />
    </DialogProvider>,
  );
}

// ─── Reading the screen ─────────────────────────────────────────────────────

// Everything here is read as the researcher would see it, so "open" means the
// editor is on screen and reachable — not merely still mounted while it
// animates away, and not sitting behind a confirmation that has taken the rest
// of the page out of the accessibility tree. Every assertion below is made
// once no confirmation is open, so the two never overlap.
const leafControl = (leaf: RenderedLeaf) =>
  screen.queryByRole('textbox', { name: LEAF_LABEL[leaf] });

const editorIsOpen = () => leafControl('text') !== null;

const editButtons = () =>
  screen.queryAllByRole('button', { name: 'Edit prompt' });

const REFUSAL_PATTERNS = [
  /This stage is read-only, so this prompt was not saved/,
  /This prompt was removed while your changes were being saved/,
  /This list is not accepting changes at the moment/,
] as const;

const refusalShown = () =>
  REFUSAL_PATTERNS.some((pattern) => screen.queryAllByText(pattern).length > 0);

// ─── Steps ──────────────────────────────────────────────────────────────────

const STEPS = [
  'open the first row',
  'open the second row',
  'type into the prompt text',
  'type into the help text',
  'type into the sort property',
  'a rendered leaf of the edited row arrives',
  'a nested leaf the editor does not render arrives',
  'a key the editor does not render arrives',
  'the edited row loses its help text',
  'another row changes',
  'the edited row is removed elsewhere',
  'the host starts refusing writes',
  'the host accepts writes again',
  'the lease is lost',
  'editing is taken back',
  'save',
  'cancel',
] as const;

type Step = (typeof STEPS)[number];

const opensARow = (step: Step) =>
  step === 'open the first row' || step === 'open the second row';

/** Whether a step can be taken at all, given what the model says is on screen. */
const applicable = (model: Model, step: Step): boolean => {
  const { dialog } = model;
  if (opensARow(step)) {
    const index = step === 'open the first row' ? 0 : 1;
    const row = model.rows[index];
    return (
      dialog === null &&
      !model.readOnly &&
      !model.staleList &&
      row !== undefined &&
      // A control opening on `null` holds nothing, and the researcher's draft
      // and the row would then agree by accident. Those rows are opened by the
      // dedicated tests below, not by an interleaving that has to predict it.
      typeof row.helpText === 'string'
    );
  }

  switch (step) {
    case 'type into the prompt text':
    case 'type into the help text':
    case 'type into the sort property':
      return dialog !== null;
    case 'a rendered leaf of the edited row arrives':
    case 'a nested leaf the editor does not render arrives':
    case 'a key the editor does not render arrives':
    case 'the edited row loses its help text':
    case 'the edited row is removed elsewhere':
      return (
        dialog !== null &&
        !model.readOnly &&
        model.rows.some((row) => row.id === dialog.id)
      );
    case 'another row changes':
      return (
        !model.readOnly &&
        model.rows.some((row) => row.id !== (dialog?.id ?? ''))
      );
    case 'the host starts refusing writes':
      return !model.refusing;
    case 'the host accepts writes again':
      return model.refusing;
    case 'the lease is lost':
      return !model.readOnly;
    case 'editing is taken back':
      return model.readOnly;
    case 'save':
      return dialog !== null;
    case 'cancel':
      return dialog !== null;
    default:
      return false;
  }
};

type Harness = ReturnType<typeof withRefusableDispatch>;
type User = ReturnType<typeof userEvent.setup>;

/** Replaces the whole list, the way an authoritative write reaches it. */
const arrive = (harness: Harness, model: Model, rows: PromptRow[]) => {
  harness.dispatchElsewhere([
    { op: 'set', key: 'prompts', value: structuredClone(rows) },
  ]);
  model.rows = rows;
  // Any change to the list's value brings `ArrayField`'s own copy of it back
  // in step with the document.
  model.staleList = false;
  const { dialog } = model;
  if (dialog !== null && !dialog.detached) {
    const live = rows.find((row) => row.id === dialog.id);
    if (live !== undefined) dialog.live = structuredClone(live);
  }
};

/**
 * Answers the discard question when the model says the editor is holding work.
 * "Keep editing" rather than "Discard changes", because a draft that survives
 * is the thing every later step in the sequence can still go wrong about.
 */
const keepEditing = async (user: User) => {
  const keep = await screen.findByRole('button', { name: 'Keep editing' });
  await user.click(keep);
  await waitFor(() =>
    expect(screen.queryByText('Discard your changes?')).toBeNull(),
  );
};

async function runStep(
  user: User,
  harness: Harness,
  model: Model,
  step: Step,
  typed: () => string,
): Promise<void> {
  const { dialog } = model;

  if (opensARow(step)) {
    const index = step === 'open the first row' ? 0 : 1;
    const row = model.rows[index]!;
    await user.click(editButtons()[index]!);
    await screen.findByRole('textbox', { name: 'Prompt text' });
    model.dialog = {
      id: row.id,
      base: structuredClone(row),
      live: structuredClone(row),
      draft: draftOf(row),
      refused: false,
      detached: false,
    };
    return;
  }

  switch (step) {
    case 'type into the prompt text':
    case 'type into the help text':
    case 'type into the sort property': {
      const leaf: RenderedLeaf =
        step === 'type into the prompt text'
          ? 'text'
          : step === 'type into the help text'
            ? 'helpText'
            : 'sortProperty';
      const value = typed();
      const control = leafControl(leaf)!;
      await user.clear(control);
      await user.type(control, value);
      dialog!.draft[leaf] = value;
      return;
    }

    case 'a rendered leaf of the edited row arrives': {
      const rows = model.rows.map((row) =>
        row.id === dialog!.id ? { ...row, helpText: typed() } : row,
      );
      arrive(harness, model, rows);
      return;
    }

    case 'a nested leaf the editor does not render arrives': {
      const rows = model.rows.map((row) =>
        row.id === dialog!.id
          ? { ...row, sort: { ...row.sort, direction: typed() } }
          : row,
      );
      arrive(harness, model, rows);
      return;
    }

    case 'a key the editor does not render arrives': {
      const rows = model.rows.map((row) =>
        row.id === dialog!.id ? { ...row, tags: [typed()] } : row,
      );
      arrive(harness, model, rows);
      return;
    }

    case 'the edited row loses its help text': {
      const rows = model.rows.map((row) =>
        row.id === dialog!.id ? { ...row, helpText: null } : row,
      );
      arrive(harness, model, rows);
      return;
    }

    case 'another row changes': {
      const rows = model.rows.map((row) =>
        row.id === dialog?.id ? row : { ...row, text: typed() },
      );
      arrive(harness, model, rows);
      return;
    }

    case 'the edited row is removed elsewhere': {
      const index = model.rows.findIndex((row) => row.id === dialog!.id);
      harness.dispatchElsewhere([{ op: 'removeItem', key: 'prompts', index }]);
      model.rows = model.rows.filter((row) => row.id !== dialog!.id);
      model.staleList = false;
      const wasDirty = isDirty(dialog!);
      // The list has no row to edit any more, whatever becomes of the dialog.
      dialog!.detached = true;
      // A refusal already owns the editor: the researcher has an answer on
      // screen they have not read yet, and the row leaving is what that answer
      // is about.
      if (dialog!.refused) return;
      if (wasDirty) {
        await keepEditing(user);
        return;
      }
      model.dialog = null;
      return;
    }

    case 'the host starts refusing writes':
      harness.setRefusing(true);
      model.refusing = true;
      return;

    case 'the host accepts writes again':
      harness.setRefusing(false);
      model.refusing = false;
      return;

    case 'the lease is lost': {
      harness.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
      // Every local write is rolled back with the lease, so the document is
      // the one the session was opened on.
      model.rows = structuredClone(INITIAL_ROWS) as PromptRow[];
      model.readOnly = true;
      model.staleList = false;
      const rolledBack = model.rows.find((row) => row.id === dialog?.id);
      if (dialog !== null && !dialog.detached && rolledBack !== undefined) {
        dialog.live = structuredClone(rolledBack);
      }
      return;
    }

    case 'editing is taken back':
      harness.setAccess({
        mode: 'editable',
        leaseOwner: 'tab-1',
        leaseEpoch: 2n,
      });
      model.readOnly = false;
      return;

    case 'save': {
      await user.click(screen.getByRole('button', { name: 'Save' }));
      const target = model.rows.findIndex((row) => row.id === dialog!.id);
      // Nothing is committed on any of these, so the editor keeps the draft
      // and says why: a read-only stage refuses before it reaches the list at
      // all, a removed row has nothing left to be saved to, and a host that
      // declines the write does so as the commit dispatches — by which point
      // the list has already handed the row over, which is what leaves the
      // editor detached and its own copy of the list a revision ahead.
      if (model.readOnly || target === -1) {
        dialog!.refused = true;
        return;
      }
      if (model.refusing) {
        dialog!.refused = true;
        if (!dialog!.detached) {
          dialog!.detached = true;
          model.staleList = true;
        }
        return;
      }
      const committed = structuredClone(model.rows[target]!);
      for (const leaf of decidedLeaves(dialog!)) {
        writeLeaf(committed, leaf, dialog!.draft[leaf]);
      }
      model.rows = model.rows.map((row, index) =>
        index === target ? committed : row,
      );
      model.dialog = null;
      model.staleList = false;
      return;
    }

    case 'cancel': {
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      if (isDirty(dialog!)) {
        await user.click(
          await screen.findByRole('button', { name: 'Discard changes' }),
        );
      }
      model.dialog = null;
      return;
    }
  }
}

async function assertModel(harness: Harness, model: Model): Promise<void> {
  await waitFor(() => expect(editorIsOpen()).toBe(model.dialog !== null));

  const { dialog } = model;
  if (dialog !== null) {
    for (const leaf of RENDERED_LEAVES) {
      expect(leafControl(leaf)).toHaveValue(dialog.draft[leaf]);
    }
    if (dialog.refused) expect(refusalShown()).toBe(true);
  }

  // Compared as text, so a failing sequence reports the row that differs
  // rather than a truncated structural diff buried under the whole editor.
  const expected = JSON.stringify(model.rows);
  await waitFor(() => {
    const actual = JSON.stringify(harness.rows());
    if (actual !== expected) {
      throw new Error(`the list holds\n  ${actual}\nand not\n  ${expected}`);
    }
  });
}

/** Deterministic, so a failing sequence is named by its seed and replayable. */
const randomFrom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * The next step, weighted towards ones this sequence has not taken yet.
 *
 * Uniform sampling spends most of a short sequence repeating a step it has
 * already made, and the defects this test is for live in COMBINATIONS — an
 * edit to one leaf of a nested key AND an arrival on its sibling AND a save,
 * in that order. Novelty is what makes a sequence of eight steps explore
 * eight different things rather than three.
 */
const pick = (
  random: () => number,
  available: readonly Step[],
  taken: readonly Step[],
): Step => {
  const weightOf = (step: Step) => (taken.includes(step) ? 1 : 4);
  const total = available.reduce((sum, step) => sum + weightOf(step), 0);
  let ticket = random() * total;
  for (const step of available) {
    ticket -= weightOf(step);
    if (ticket <= 0) return step;
  }
  return available.at(-1)!;
};

const SEQUENCES = 200;
const STEPS_PER_SEQUENCE = 8;

describe('the row editor, over random lifecycles', () => {
  it('keeps the dialog, the draft and the committed row where the model says', async () => {
    for (let seed = 1; seed <= SEQUENCES; seed += 1) {
      const random = randomFrom(seed);
      const harness = withRefusableDispatch(createStore(INITIAL_ROWS));
      const user = userEvent.setup();
      renderLifecycleList(harness.session);

      const model: Model = {
        rows: structuredClone(INITIAL_ROWS) as PromptRow[],
        dialog: null,
        refusing: false,
        readOnly: false,
        staleList: false,
      };
      const taken: Step[] = [];
      let counter = 0;
      const typed = () => {
        counter += 1;
        return `v${seed}-${counter}`;
      };

      try {
        await screen.findByRole('button', { name: 'Create new prompt' });
        for (let index = 0; index < STEPS_PER_SEQUENCE; index += 1) {
          const available = STEPS.filter((step) => applicable(model, step));
          const step = pick(random, available, taken);
          taken.push(step);
          await runStep(user, harness, model, step, typed);
          await assertModel(harness, model);
        }
      } catch (failure) {
        const reason =
          failure instanceof Error ? failure.message : String(failure);
        // The seed and the steps are what makes a failure reproducible; the
        // original is kept as the cause so its own detail is not lost.
        throw new Error(
          `seed ${seed}, after [${taken.join(' → ')}]:\n${reason}`,
          {
            cause: failure,
          },
        );
      } finally {
        cleanup();
      }
    }
  }, 300_000);
});
