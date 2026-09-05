import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { Command, SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorController } from '../../../controller.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  createStageIdentity,
  type FinishRequest,
  ProtocolBuilderSessionStore,
} from '../../../session.ts';
import ProtocolArrayField from '../../ProtocolArrayField.tsx';
import ProtocolField from '../../ProtocolField.tsx';
import StageEditorShell from '../../StageEditorShell.tsx';
import DialogArrayField from '../DialogArrayField.tsx';
import Options, { optionsValidation } from '../Options.tsx';

type Prompt = { id: string; text: string };

function createSession(
  fields: SectionDoc,
  onFinish?: (request: FinishRequest) => void,
) {
  return new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Information', () => 'stage-1'),
    fields,
    protocolSections: {},
    manifestRevision: { sequence: 1n, hash: 'revision-1' },
    access: { mode: 'editable', leaseOwner: 'tab-1', leaseEpoch: 1n },
    buildCandidate: ({ stageDocument }) => ({
      name: 'Array field test',
      schemaVersion: 8,
      codebook: {},
      stages: [stageDocument],
    }),
    ...(onFinish === undefined ? {} : { onFinish }),
  });
}

const promptsOf = (session: ProtocolBuilderSessionStore): Prompt[] =>
  (session.getSnapshot().editedSection.fields.prompts ?? []) as Prompt[];

const commandsOf = (session: ProtocolBuilderSessionStore): Command[] =>
  session.getSnapshot().pendingCommands.flatMap((batch) => [...batch.commands]);

function PromptPreview({ text }: Record<string, unknown>) {
  return <span>{typeof text === 'string' ? text : ''}</span>;
}

function PromptFields({ item }: Record<string, unknown>) {
  const row = (item ?? {}) as Partial<Prompt>;
  return (
    <Field
      name="text"
      label="Prompt text"
      component={InputField}
      initialValue={row.text ?? ''}
    />
  );
}

function renderPromptList(
  session: ProtocolBuilderSessionStore,
  extra?: Readonly<{ onBeforeSave?: (value: unknown) => unknown }>,
) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Page content">
          <ProtocolField
            name="title"
            label="Page heading"
            component={InputField}
          />
        </BuilderSection>
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
 * Removes the row at `index` through its own confirmation.
 *
 * The confirmation's button carries the same accessible name as the row's — it
 * IS the row's confirmation, and names the same thing. They are told apart by
 * the modal: while it is open the list behind it is hidden from assistive
 * technology, so exactly one control by that name is reachable, and waiting for
 * that is also what proves the confirmation opened.
 */
async function removeRow(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
) {
  await user.click(
    screen.getAllByRole('button', { name: 'Remove prompt' })[index]!,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Remove prompt' }),
  );
}

describe('a list bound to a stage document key', () => {
  it('commits a removal as the removal of that row, not as a new array', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
        { id: 'c', text: 'Charlie' },
      ],
    });
    renderPromptList(session);

    await screen.findByText('Bravo');
    await removeRow(user, 1);

    await waitFor(() =>
      expect(promptsOf(session).map(({ id }) => id)).toEqual(['a', 'c']),
    );
    // The command says WHICH row went. A whole-array `set` would replay as
    // "the list is now this", which cannot be merged with anything else.
    expect(commandsOf(session)).toEqual([
      { op: 'removeItem', key: 'prompts', index: 1 },
    ]);
  });

  it('leaves every surviving row bound to its own values', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
      prompts: [
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo' },
        { id: 'c', text: 'Charlie' },
      ],
    });
    renderPromptList(session);

    await screen.findByText('Bravo');
    await removeRow(user, 1);
    await waitFor(() => expect(screen.queryByText('Bravo')).toBeNull());

    // The row that has taken the deleted one's place must still edit ITSELF.
    // A dialog opening on Alpha here is the relabelling this whole seam exists
    // to prevent.
    await user.click(
      screen.getAllByRole('button', { name: 'Edit prompt' })[1]!,
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Prompt text' })).toHaveValue(
        'Charlie',
      ),
    );
  });

  it('does not disturb the rest of the editor when a row is added', async () => {
    const user = userEvent.setup();
    const session = createSession({ title: 'Welcome', prompts: [] });
    renderPromptList(session);

    // Something typed but not yet saved. Adding a prompt writes to the session,
    // and the form is keyed on the committed draft — so without the marker
    // that says this write was the form's own, every control here is rebuilt
    // from the draft and this text is gone.
    const heading = await screen.findByRole('textbox', {
      name: 'Page heading',
    });
    await user.clear(heading);
    await user.type(heading, 'Half-written heading');

    await user.click(screen.getByRole('button', { name: 'Create new prompt' }));
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });
    await user.type(text, 'First prompt');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(promptsOf(session).map(({ text: value }) => value)).toEqual([
        'First prompt',
      ]),
    );
    expect(screen.getByRole('textbox', { name: 'Page heading' })).toHaveValue(
      'Half-written heading',
    );
  });

  it('commits a save that outlived its dialog to the row it was made on', async () => {
    const user = userEvent.setup();
    const session = createSession({
      title: 'Welcome',
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

    await screen.findByText('Bravo');
    await user.click(
      screen.getAllByRole('button', { name: 'Edit prompt' })[1]!,
    );
    const text = await screen.findByRole('textbox', { name: 'Prompt text' });
    await user.clear(text);
    await user.type(text, 'Bravo edited');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // A row arrives from elsewhere while the save is still in flight. Every
    // index the dialog opened with now points one row too high.
    act(() => {
      session.dispatch([
        {
          op: 'insertItem',
          key: 'prompts',
          index: 0,
          item: { id: 'x', text: 'Remote' },
        },
      ]);
    });

    await act(async () => {
      release();
      await inFlight;
    });

    await waitFor(() =>
      expect(promptsOf(session)).toEqual([
        { id: 'x', text: 'Remote' },
        { id: 'a', text: 'Alpha' },
        { id: 'b', text: 'Bravo edited' },
      ]),
    );
  });
});

function renderOptionList(session: ProtocolBuilderSessionStore) {
  function Host() {
    const controller = useStageEditorController(session, 'stage-form');
    return (
      <StageEditorShell
        controller={controller}
        actions={({ formId }) => (
          <SubmitButton form={formId}>Finished editing</SubmitButton>
        )}
      >
        <BuilderSection title="Options">
          <ProtocolArrayField
            name="options"
            label="Options"
            component={Options}
            addButtonLabel="Create new option"
            {...optionsValidation}
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

describe('array-level validation', () => {
  it('refuses a save the rows could only have complained about', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const session = createSession(
      {
        title: 'Welcome',
        options: [
          { label: 'Yes', value: 'yes' },
          { label: 'Yes', value: 'no' },
        ],
      },
      onFinish,
    );
    renderOptionList(session);

    await screen.findByRole('button', { name: 'Create new option' });
    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // A row's own duplicate-label error can only be displayed; this is the
    // rule that actually stops the protocol being saved with it.
    await screen.findByText('Every option needs a unique label.');
    // Refused before the form wrote anything: the submit flushes the draft into
    // the session and only then finishes, so an empty command log is the proof
    // that the array's rule stopped it rather than the schema catching it after.
    expect(session.getSnapshot().pendingCommands).toEqual([]);
    expect(onFinish).not.toHaveBeenCalled();
  });
});
