import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DialogModule from '@codaco/fresco-ui/dialogs/Dialog';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import { DialogFormField } from '../../DialogForm.tsx';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import DialogArrayField from '../DialogArrayField.tsx';

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

const promptsOf = (session: ProtocolBuilderSessionStore): Prompt[] =>
  (session.getSnapshot().editedSection.fields.prompts ?? []) as Prompt[];

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

function renderPromptList(
  session: ProtocolBuilderSessionStore,
  extra?: Readonly<{
    withPreview?: boolean;
    onBeforeSave?: (value: unknown) => unknown;
  }>,
) {
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
            editorFieldsComponent={PromptFields}
            {...(extra?.withPreview === true
              ? { editorPreviewComponent: PromptEditorPreview }
              : {})}
            {...(extra?.onBeforeSave === undefined
              ? {}
              : { onBeforeSave: extra.onBeforeSave })}
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
