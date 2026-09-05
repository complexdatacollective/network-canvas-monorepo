import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState, type ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DialogModule from '@codaco/fresco-ui/dialogs/Dialog';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  type ProtocolBuilderSession,
  ProtocolBuilderSessionStore,
  SessionReadOnlyError,
} from '../../../session.ts';
import { DialogFormField } from '../../DialogForm.tsx';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import DialogArrayField, {
  type DialogArrayEditorValidate,
} from '../DialogArrayField.tsx';
import { useArrayFieldCommands } from '../useArrayFieldCommands.ts';

/**
 * `layoutId` is a Motion prop, so it leaves no trace in the DOM: what the row
 * editor has to prove is that the dialog RECEIVED the row's identity, which is
 * what this records. Fresco's own `Dialog` still renders — the mock is a
 * passthrough — so every test in this file exercises the real component.
 */
const dialogRenders = vi.hoisted(() =>
  vi.fn<(props: { layoutId?: string }) => void>(),
);

vi.mock('@codaco/fresco-ui/dialogs/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof DialogModule>();
  const RealDialog = actual.default;
  return {
    ...actual,
    default: (props: DialogModule.DialogProps) => {
      dialogRenders(props);
      return createElement(RealDialog, props);
    },
  };
});

beforeEach(() => {
  dialogRenders.mockClear();
});

type Prompt = { id: string; text: string };

function createSession(fields: SectionDoc) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Row editor test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
  });
}

const promptsOf = (session: ProtocolBuilderSession): Prompt[] =>
  (session.getSnapshot().editedSection.fields.prompts ?? []) as Prompt[];

/**
 * A session whose next write is refused, while the snapshot still says the
 * stage is editable — the lease taken back between the render a handler was
 * built in and the dispatch that runs it.
 *
 * `setAccess` cannot stand in for it: it re-renders, so the editor's own
 * read-only check answers first and the dispatch is never reached. This is the
 * only arrangement in which the refusal happens INSIDE the list's own save.
 */
function withRevocableDispatch(store: ProtocolBuilderSessionStore) {
  let revoked = false;
  const session: ProtocolBuilderSession = {
    subscribe: (listener) => store.subscribe(listener),
    getSnapshot: () => store.getSnapshot(),
    getServerSnapshot: () => store.getServerSnapshot(),
    dispatch: (commands) => {
      if (revoked) throw new SessionReadOnlyError();
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
    revoke: () => {
      revoked = true;
    },
    /** Editing taken BACK, which is what the refusal asks the researcher for. */
    restore: () => {
      revoked = false;
    },
  };
}

function PromptPreview({ text }: Record<string, unknown>) {
  return <span>{typeof text === 'string' ? text : ''}</span>;
}

/**
 * States no `initialValue` of its own: the row's value has to arrive through
 * the dialog, which is the seam the editor is wired on.
 */
function PromptFields() {
  return (
    <DialogFormField name="text" label="Prompt text" component={InputField} />
  );
}

/** The optional pane beside the fields, for the row the dialog opened on. */
function PromptEditorPreview({ text }: Record<string, unknown>) {
  return <span>Preview of {typeof text === 'string' ? text : ''}</span>;
}

/**
 * Two fields, so a change from elsewhere can reach a key this editor RENDERS
 * without reaching the one the researcher is typing in. One field cannot tell
 * "the dialog is holding a stale copy of this key" apart from "the researcher
 * decided this key", which is the whole question the interleavings below ask.
 */
function PromptFieldsWithHelp() {
  return (
    <>
      <DialogFormField name="text" label="Prompt text" component={InputField} />
      <DialogFormField
        name="helpText"
        label="Help text"
        component={InputField}
      />
    </>
  );
}

type Rule = { id: string; label: string };

const NEW_RULE: Rule = { id: 'rule-1', label: 'New rule' };

/**
 * A minimal stand-in for production's `MultiSelect`/`Options`: it calls
 * `useArrayFieldCommands` itself rather than being wrapped in its own
 * `ProtocolArrayField`, so it inherits whatever `ArrayFieldBindingContext` is
 * ambient at the point it renders. That is exactly how a real sort-rule list
 * reaches a prompt's row dialog (`DialogFormField` + `MultiSelect`, never
 * `ProtocolArrayField`), and exactly the route `DialogArrayField` has to bind
 * for itself instead of leaving to whatever wraps it.
 */
function RuleList({
  value,
  onChange,
}: {
  value?: Rule[];
  onChange?: (next: Rule[]) => void;
}) {
  const rows = Array.isArray(value) ? value : [];
  const { onOperation } = useArrayFieldCommands<Rule>(rows, onChange);

  return (
    <button
      type="button"
      onClick={() => {
        if (onOperation) {
          onOperation({ type: 'insert', index: rows.length, item: NEW_RULE });
        } else {
          onChange?.([...rows, NEW_RULE]);
        }
      }}
    >
      Add rule
    </button>
  );
}

/** The row editor for a prompt whose "rules" is a list reached by no
 * `ProtocolArrayField` of its own — matching `SortOrderRows`' real use of
 * `DialogFormField` + `MultiSelect`. */
function PromptFieldsWithRuleList() {
  return (
    <>
      <DialogFormField name="text" label="Prompt text" component={InputField} />
      <DialogFormField name="rules" label="Rules" component={RuleList} />
    </>
  );
}

function renderPromptList(
  session: ProtocolBuilderSession,
  extra?: Readonly<{
    withPreview?: boolean;
    onBeforeSave?: (value: unknown) => unknown;
    editorFieldsComponent?: ComponentType<Record<string, unknown>>;
    editorValidate?: DialogArrayEditorValidate;
  }>,
) {
  // How a test takes the list's own interactivity away mid-edit, the way a
  // section does when a prerequisite it depends on stops being chosen.
  const controls: { setDisabled: (value: boolean) => void } = {
    setDisabled: () => undefined,
  };

  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    const [disabled, setDisabled] = useState(false);
    controls.setDisabled = setDisabled;
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
            disabled={disabled}
            previewComponent={PromptPreview}
            editorFieldsComponent={extra?.editorFieldsComponent ?? PromptFields}
            {...(extra?.withPreview === true
              ? { editorPreviewComponent: PromptEditorPreview }
              : {})}
            {...(extra?.onBeforeSave === undefined
              ? {}
              : { onBeforeSave: extra.onBeforeSave })}
            {...(extra?.editorValidate === undefined
              ? {}
              : { editorValidate: extra.editorValidate })}
          />
        </BuilderSection>
      </StageEditorShell>
    );
  }

  return {
    ...render(
      <DialogProvider>
        <Host />
      </DialogProvider>,
    ),
    disableList: () => {
      act(() => {
        controls.setDisabled(true);
      });
    },
  };
}

/**
 * Adds a prompt through the list's own editor.
 *
 * Every test below that loses the lease or undoes needs a structural write
 * already standing: a rollback that restores the draft the form opened with
 * moves nothing, and would prove nothing about surviving one that does.
 */
async function addPrompt(
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) {
  await user.click(
    await screen.findByRole('button', { name: 'Create new prompt' }),
  );
  const field = await screen.findByRole('textbox', { name: 'Prompt text' });
  await user.type(field, text);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('textbox', { name: 'Prompt text' }),
    ).not.toBeInTheDocument(),
  );
}

const promptText = () => screen.getByRole('textbox', { name: 'Prompt text' });

/** Opens the editor for the row at `index` and waits for its field. */
async function editRow(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
) {
  await user.click(
    (await screen.findAllByRole('button', { name: 'Edit prompt' }))[index]!,
  );
  return await screen.findByRole('textbox', { name: 'Prompt text' });
}

describe('the row editor', () => {
  it('opens holding the values of the row it was opened on', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });
    renderPromptList(session);

    // The field names a key and nothing else; the row it belongs to is what
    // the dialog was opened with.
    await editRow(user, 1);
    await waitFor(() => expect(promptText()).toHaveValue('Bravo'));
  });

  it('asks before a dismissal throws an edited row away', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session);

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      await screen.findByText(
        'This editor holds changes that have not been saved. Closing it now discards them.',
      ),
    ).toBeInTheDocument();
    // The editor is still there, still holding the draft — the question was
    // asked instead of the work being thrown away. Queried as hidden because
    // the confirmation above it takes the rest of the page out of the
    // accessibility tree while it is open.
    expect(
      screen.getByRole('textbox', { name: 'Prompt text', hidden: true }),
    ).toHaveValue('Alpha edited');

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    // The row's own controls are hidden while its editor is open, so their
    // return is that editor closing.
    await screen.findByRole('button', { name: 'Edit prompt' });
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  it('closes an untouched row editor without asking', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session);

    const text = await editRow(user, 0);
    // Waited for, so that "untouched" is a draft that really did open on the
    // row's value rather than one that had not been seeded yet.
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await screen.findByRole('button', { name: 'Edit prompt' });
    expect(
      screen.queryByRole('button', { name: 'Discard changes' }),
    ).not.toBeInTheDocument();
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  it('refuses to save a row once the stage has become read-only', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session);

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    // The lease goes while the editor sits open — the one arrangement in which
    // the row's Edit button was reachable but the commit is not. Every commit
    // route below the dialog is silent about this: the list withholds its save
    // handler, and the structural commit reports that it wrote.
    act(() => {
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This stage is read-only, so this prompt was not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    // Nothing was written, and the draft is still on screen to be rescued.
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(promptText()).toHaveValue('Alpha edited');
    expect(
      screen.queryByRole('button', { name: 'Edit prompt' }),
    ).not.toBeInTheDocument();
  });

  it('morphs out of the row it was opened from', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });
    renderPromptList(session);

    await editRow(user, 1);

    // `ArrayField` gives each row the shared-element identity of the id the
    // list resolved it by, so naming the same id is what pairs the dialog with
    // the row it grew out of — and the inline radius is the geometry the two
    // edges interpolate on the way.
    await waitFor(() =>
      expect(dialogRenders).toHaveBeenCalledWith(
        expect.objectContaining({
          layoutId: 'b',
          style: { borderRadius: 'var(--radius)' },
        }),
      ),
    );
    expect(dialogRenders).not.toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: 'a' }),
    );
  });

  it('puts the editor preview beside the fields, outside the form', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });
    renderPromptList(session, { withPreview: true });

    await editRow(user, 1);

    // A preview can be interactive — a control that owns its own form
    // semantics — so it must not be nested inside the editor's `<form>`.
    const preview = await screen.findByText(/Preview of/);
    expect(preview).toHaveTextContent('Preview of Bravo');
    expect(preview.closest('form')).toBeNull();
    expect(promptText().closest('form')).not.toBeNull();
  });

  it('opens a new row with no row to morph out of', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session);

    await user.click(
      await screen.findByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('textbox', { name: 'Prompt text' });

    // A new row was never on screen, so there is no element for the dialog to
    // be the same thing as. Naming one anyway would pair it with whichever row
    // last held that id.
    expect(dialogRenders).not.toHaveBeenCalledWith(
      expect.objectContaining({ layoutId: expect.anything() as unknown }),
    );
  });

  it('gives a new row an id of its own', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [] });
    renderPromptList(session);

    await addPrompt(user, 'First prompt');

    // Every list operation is addressed by the row's own id — that is what
    // survives a reorder, an insertion from elsewhere, and a save that
    // outlives its dialog. A row created without one falls back to position,
    // which is the relabelling the whole seam exists to prevent.
    const [prompt] = promptsOf(session);
    expect(prompt?.text).toBe('First prompt');
    expect(prompt?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('a row editor open while the draft moves beneath it', () => {
  it('keeps the editor and its draft when the lease is lost', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session);

    // A structural write already standing, so losing the lease really does
    // roll the draft back under the form rather than leaving it where it was.
    await addPrompt(user, 'Bravo');

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    act(() => {
      session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
    });

    // The rollback is an authoritative change, and the editor is where the
    // researcher's unsaved work is. Rebuilding the form to take the new draft
    // would close this dialog and throw that work away without a word.
    expect(promptText()).toHaveValue('Alpha edited');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'This stage is read-only, so this prompt was not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    expect(promptText()).toHaveValue('Alpha edited');
    // The rollback landed: the row the lease loss took back is gone, and
    // nothing the editor did wrote over it.
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
    expect(session.getSnapshot().pendingCommands).toEqual([]);
  });

  it('keeps the editor and its draft when the host undoes a list change', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session);

    await addPrompt(user, 'Bravo');

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    act(() => {
      session.undo();
    });

    expect(promptText()).toHaveValue('Alpha edited');
    // The undo reached the list behind the dialog, which is the other half of
    // this: surviving the change must not mean ignoring it.
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  it('says so when the row being saved is removed underneath the editor', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });

    let release: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderPromptList(session, {
      onBeforeSave: async (value) => {
        await inFlight;
        return value;
      },
    });

    const text = await editRow(user, 1);
    await waitFor(() => expect(text).toHaveValue('Bravo'));
    await user.clear(text);
    await user.type(text, 'Bravo edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The row leaves the array while the save is still in flight. There is
    // nothing left to commit the edit to, and the alternative — writing it
    // onto whichever row now occupies that position — is the relabelling this
    // seam exists to prevent.
    act(() => {
      session.dispatch([{ op: 'removeItem', key: 'prompts', index: 1 }]);
    });

    await act(async () => {
      release();
      await inFlight;
    });

    expect(
      await screen.findByText(
        /This prompt was removed while your changes were being saved/,
      ),
    ).toBeInTheDocument();
    // Reporting a save that did not happen as a success is what silently
    // closes the dialog over a discarded edit, so the draft is still here to
    // be rescued.
    expect(promptText()).toHaveValue('Bravo edited');
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  /**
   * The other way a commit can reach nothing, and the one the list's own save
   * handler is silent about.
   *
   * A row that carries no id of its own is matched by its content, and only
   * while exactly one row matches: two rows the researcher cannot tell apart
   * are two rows this save describes identically, and writing to either would
   * be a guess. The list is also numbered differently from the document it
   * commits to — a document row no editor can draw is dropped from the form
   * value the moment anything is written, which is what makes the position
   * shortcut unavailable and sends the match to content in the first place.
   *
   * So the commit resolves to no commands at all, while `ArrayField` is still
   * editing this row and answers nothing about it. Nothing is written, and
   * what the write path says it did is the only thing between that and a
   * dialog closing over the researcher's draft.
   */
  it('says so when the row a save names cannot be told from the rows beside it', async () => {
    const user = userEvent.setup();
    // A row the editor cannot draw, and two rows nothing but their content
    // tells apart.
    const session = createSession({
      prompts: [null, { text: 'Same' }, { text: 'Same' }],
    });
    renderPromptList(session);

    // The list draws nothing at all for a value holding an entry that is not a
    // row, so its Add is the only way in. Committing it writes the rows the
    // researcher can SEE back to the form value, and the document keeps the
    // entry they cannot — from here the two are numbered differently.
    await addPrompt(user, 'Other');
    await waitFor(() =>
      expect(
        screen.queryAllByRole('button', { name: 'Edit prompt' }),
      ).toHaveLength(3),
    );

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Same'));
    await user.clear(text);
    await user.type(text, 'Same edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        /could not be matched to a row in it and nothing was saved/,
      ),
    ).toBeInTheDocument();
    // Reporting a commit that reached nothing as a save is what closes the
    // dialog over a discarded edit, so the draft is still here to be rescued.
    expect(promptText()).toHaveValue('Same edited');
    expect(promptsOf(session)).toEqual([
      null,
      { text: 'Same' },
      { text: 'Same' },
      { id: expect.any(String), text: 'Other' },
    ]);
  });

  it('keeps a change that reached the row while its save was in flight', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [{ id: 'a', text: 'Alpha', additionalAttributes: [] }],
    });

    let release: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderPromptList(session, {
      onBeforeSave: async (value) => {
        await inFlight;
        return value;
      },
    });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // A key this editor does not render moves on the same row while the save
    // is in flight. The values the save is built from were read before that,
    // and committing the whole row from them writes this straight back out.
    act(() => {
      session.dispatch([
        {
          op: 'set',
          key: 'prompts',
          value: [
            {
              id: 'a',
              text: 'Alpha',
              additionalAttributes: [{ variable: 'v1', value: true }],
            },
          ],
        },
      ]);
    });
    await waitFor(() =>
      expect(promptsOf(session)).toEqual([
        {
          id: 'a',
          text: 'Alpha',
          additionalAttributes: [{ variable: 'v1', value: true }],
        },
      ]),
    );

    await act(async () => {
      release();
      await inFlight;
    });

    // The edit lands on the row as it stands: the researcher's own change to
    // the key they edited, and the arrival on the key they did not.
    await waitFor(() =>
      expect(promptsOf(session)).toEqual([
        {
          id: 'a',
          text: 'Alpha edited',
          additionalAttributes: [{ variable: 'v1', value: true }],
        },
      ]),
    );
  });

  it('refuses a row save the list has stopped accepting', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    const { disableList } = renderPromptList(session);

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    // The list stops accepting changes while the editor sits open — something
    // it depends on stopped being chosen. `ArrayField` withdraws its own save
    // handler when that happens, so calling it commits nothing at all.
    disableList();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This list is not accepting changes at the moment, so this prompt was not saved. Copy anything you want to keep, then try again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    // Reporting a save that never happened as a success is what closes the
    // dialog over a discarded edit, so the draft is still here to be rescued.
    expect(promptText()).toHaveValue('Alpha edited');
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  /**
   * The third list that shares `useConfirmRowRemoval`, and the same window: a
   * confirm answered after `ArrayField` has withdrawn the row's delete
   * handler removes nothing and used to close as though it had.
   */
  it('removes no row when the list stops accepting changes mid-confirm', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });
    const { disableList } = renderPromptList(session);

    const removes = await screen.findAllByRole('button', {
      name: 'Remove prompt',
    });
    await user.click(removes[1]!);
    const dialog = await screen.findByRole('dialog');

    disableList();
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove prompt' }),
    );

    expect(
      await screen.findByText(
        'This list stopped accepting changes while you were confirming, so this prompt was not removed. Remove it again once the list can be edited.',
      ),
    ).toBeInTheDocument();
    expect(promptsOf(session)).toEqual([
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Bravo' },
    ]);
  });

  it('commits a row once when a second submit arrives while the first is running', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });

    let release: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onBeforeSave = vi.fn(async (value: unknown) => {
      await inFlight;
      return value;
    });
    renderPromptList(session, { onBeforeSave });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The footer's submit control is disabled while a save runs, but a submit
    // raised on the form element itself — a keyboard submit from inside a
    // field — still reaches the form's own handler.
    const form = promptText().closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await act(async () => {
      release();
      await inFlight;
    });

    await waitFor(() =>
      expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha edited' }]),
    );
    // One commit, not two. The save already running answers for both.
    expect(onBeforeSave).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().pendingCommands).toHaveLength(1);
  });
});

/**
 * The row a save commits, against everything that can move while the editor
 * that composed it is open.
 *
 * One state machine, so one table rather than a test per defect. A save is
 * built from three things that drift apart: the values the dialog OPENED on,
 * the values the row holds when Save is pressed, and the values it holds when
 * the commit finally dispatches. The rule that has to hold across every
 * interleaving is the same one `reseatEditedRow` states — only what the
 * researcher actually DECIDED is written, and everything that arrived
 * meanwhile survives.
 */
const OPENED_ON: Prompt & Record<string, unknown> = {
  id: 'a',
  text: 'Alpha',
  helpText: 'Original help',
  additionalAttributes: [],
};

const ATTRIBUTES = [{ variable: 'v1', value: true }];

type Interleaving = Readonly<{
  name: string;
  /** When the change from elsewhere reaches the row. */
  when: 'before Save' | 'while the save is in flight';
  /** The row, as something else writes it. */
  arrival: Record<string, unknown>;
  /** What the researcher types into the prompt text, if anything. */
  typed?: string;
  expected: Record<string, unknown>;
}>;

const INTERLEAVINGS: readonly Interleaving[] = [
  {
    name: 'keeps an arrival on a rendered key the researcher never touched',
    when: 'before Save',
    arrival: { ...OPENED_ON, helpText: 'Help from elsewhere' },
    typed: 'Alpha edited',
    expected: {
      ...OPENED_ON,
      text: 'Alpha edited',
      helpText: 'Help from elsewhere',
    },
  },
  {
    name: 'keeps an arrival when the researcher typed nothing at all',
    when: 'before Save',
    arrival: { ...OPENED_ON, text: 'Alpha from elsewhere' },
    expected: { ...OPENED_ON, text: 'Alpha from elsewhere' },
  },
  {
    name: 'lets the researcher win on the very key the arrival touched',
    when: 'before Save',
    arrival: { ...OPENED_ON, text: 'Alpha from elsewhere' },
    typed: 'Alpha edited',
    expected: { ...OPENED_ON, text: 'Alpha edited' },
  },
  {
    name: 'keeps an arrival on a key the editor never renders',
    when: 'before Save',
    arrival: { ...OPENED_ON, additionalAttributes: ATTRIBUTES },
    typed: 'Alpha edited',
    expected: {
      ...OPENED_ON,
      text: 'Alpha edited',
      additionalAttributes: ATTRIBUTES,
    },
  },
  {
    name: 'keeps an arrival on a rendered key that landed mid-save',
    when: 'while the save is in flight',
    arrival: { ...OPENED_ON, helpText: 'Help from elsewhere' },
    typed: 'Alpha edited',
    expected: {
      ...OPENED_ON,
      text: 'Alpha edited',
      helpText: 'Help from elsewhere',
    },
  },
  {
    name: 'keeps an arrival on an unrendered key that landed mid-save',
    when: 'while the save is in flight',
    arrival: { ...OPENED_ON, additionalAttributes: ATTRIBUTES },
    typed: 'Alpha edited',
    expected: {
      ...OPENED_ON,
      text: 'Alpha edited',
      additionalAttributes: ATTRIBUTES,
    },
  },
];

describe('the row a save commits', () => {
  it.each(INTERLEAVINGS)('$when: $name', async (interleaving) => {
    const { when, arrival, typed, expected } = interleaving;
    const user = userEvent.setup();
    const session = createSession({ prompts: [OPENED_ON] });

    let release: () => void = () => undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderPromptList(session, {
      editorFieldsComponent: PromptFieldsWithHelp,
      ...(when === 'before Save'
        ? {}
        : {
            onBeforeSave: async (value: unknown) => {
              await inFlight;
              return value;
            },
          }),
    });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    if (typed !== undefined) {
      await user.clear(text);
      await user.type(text, typed);
    }

    const arrive = async () => {
      act(() => {
        session.dispatch([{ op: 'set', key: 'prompts', value: [arrival] }]);
      });
      await waitFor(() => expect(promptsOf(session)).toEqual([arrival]));
    };

    if (when === 'before Save') {
      await arrive();
      await user.click(screen.getByRole('button', { name: 'Save' }));
    } else {
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await arrive();
      await act(async () => {
        release();
        await inFlight;
      });
    }

    await waitFor(() => expect(promptsOf(session)).toEqual([expected]));
  });

  it('keeps the editor open when the write is refused as it dispatches', async () => {
    const user = userEvent.setup();
    const store = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    const { session, revoke } = withRevocableDispatch(store);
    renderPromptList(session);

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    // The lease goes without the form hearing about it: both pre-save checks
    // read what this render built and both say the save may proceed, so the
    // refusal happens inside the list's own save, where the only thing that
    // can report it is the commit path itself.
    revoke();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This stage is read-only, so this prompt was not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    // A refusal reported as a success is what closes the dialog over a
    // discarded draft, so the draft is still here to be rescued.
    expect(promptText()).toHaveValue('Alpha edited');
    expect(promptsOf(store)).toEqual([{ id: 'a', text: 'Alpha' }]);
    expect(store.getSnapshot().pendingCommands).toEqual([]);
  });
});

describe('a row editor whose row goes while the researcher is in it', () => {
  it('commits the retry after a refusal to the row the draft was made on', async () => {
    const user = userEvent.setup();
    const store = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    const { session, revoke, restore } = withRevocableDispatch(store);
    renderPromptList(session);

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Alpha edited');

    revoke();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'This stage is read-only, so this prompt was not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();

    // The refusal cleared the LIST's editing state on its way past — the row
    // was handed over before the session declined the write — so the editor is
    // open over a draft the list no longer has a row for. Taking editing back
    // is exactly what the message asks for, and the retry has to reach the row
    // the draft was made on rather than reading "no row" as "the same row" and
    // reporting a commit that never happened.
    restore();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(promptsOf(store)).toEqual([{ id: 'a', text: 'Alpha edited' }]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Prompt text' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('asks before a row removed elsewhere takes an edited draft with it', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });
    renderPromptList(session);

    const text = await editRow(user, 1);
    await waitFor(() => expect(text).toHaveValue('Bravo'));
    await user.clear(text);
    await user.type(text, 'Bravo edited');

    // The row leaves the array with no save in flight: a collaborator removed
    // it, or an undo did. `ArrayField` drops its editing session, and closing
    // the dialog on that would throw the researcher's draft away without a
    // word — the one thing this editor exists to prevent.
    act(() => {
      session.dispatch([{ op: 'removeItem', key: 'prompts', index: 1 }]);
    });

    expect(
      await screen.findByText(
        'This editor holds changes that have not been saved. Closing it now discards them.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    // The draft is still on screen to be rescued, and a save now says why
    // there is nothing to save it to rather than reporting one that happened.
    await waitFor(() => expect(promptText()).toHaveValue('Bravo edited'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        /This prompt was removed while your changes were being saved/,
      ),
    ).toBeInTheDocument();
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });

  it('closes an untouched editor without asking when its row is removed', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
      ],
    });
    renderPromptList(session);

    const text = await editRow(user, 1);
    await waitFor(() => expect(text).toHaveValue('Bravo'));

    act(() => {
      session.dispatch([{ op: 'removeItem', key: 'prompts', index: 1 }]);
    });

    // Nothing was typed, so there is nothing to lose and nothing to ask about.
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Prompt text' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Discard your changes?')).toBeNull();
  });
});

describe('what a row editor validates against', () => {
  /**
   * The shape of every "unchanged pick" escape in this package: a value is
   * refused unless it is the one the row already had — reselecting what is
   * already saved is never a NEW contradiction. What answers "already had" is
   * the row the dialog OPENED on.
   */
  const reservedText: DialogArrayEditorValidate = (values, context) => {
    const initial = context?.initialValues;
    const openedWith =
      typeof initial === 'object' && initial !== null && 'text' in initial
        ? initial.text
        : undefined;
    return values.text === 'Reserved' && openedWith !== 'Reserved'
      ? { text: 'That name is reserved. Choose another.' }
      : undefined;
  };

  it('judges a submitted value against the row the dialog opened on', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Reserved' }] });
    renderPromptList(session, { editorValidate: reservedText });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Reserved'));

    // The row moves under the open editor. The draft is untouched, so what the
    // researcher submits is still the value the row already had — and judged
    // against the row as it stands NOW, that reads as a deliberate fresh pick
    // of a reserved name and is refused.
    act(() => {
      session.dispatch([
        { op: 'set', key: 'prompts', value: [{ id: 'a', text: 'Elsewhere' }] },
      ]);
    });
    await waitFor(() =>
      expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Elsewhere' }]),
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Prompt text' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText('That name is reserved. Choose another.'),
    ).toBeNull();
    // Nothing the researcher decided, so the arrival stands.
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Elsewhere' }]);
  });

  it('still refuses a value the researcher did choose', async () => {
    const user = userEvent.setup();
    const session = createSession({ prompts: [{ id: 'a', text: 'Alpha' }] });
    renderPromptList(session, { editorValidate: reservedText });

    const text = await editRow(user, 0);
    await waitFor(() => expect(text).toHaveValue('Alpha'));
    await user.clear(text);
    await user.type(text, 'Reserved');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('That name is reserved. Choose another.'),
    ).toBeInTheDocument();
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha' }]);
  });
});

describe('a list rendered inside a row dialog', () => {
  it('does not let an insert inside the row reach the list around it', async () => {
    const user = userEvent.setup();
    const session = createSession({
      prompts: [{ id: 'a', text: 'Alpha', rules: [] }],
    });
    renderPromptList(session, {
      editorFieldsComponent: PromptFieldsWithRuleList,
    });

    await editRow(user, 0);
    await user.click(await screen.findByRole('button', { name: 'Add rule' }));

    // The rule is part of THIS row, not a sibling of it: adding one must not
    // commit an insert against the array of prompts the dialog belongs to,
    // even before the dialog is saved.
    expect(promptsOf(session)).toEqual([{ id: 'a', text: 'Alpha', rules: [] }]);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The rule went into the prompt's own field, not beside it.
    expect(promptsOf(session)).toEqual([
      { id: 'a', text: 'Alpha', rules: [{ id: 'rule-1', label: 'New rule' }] },
    ]);
  });
});
