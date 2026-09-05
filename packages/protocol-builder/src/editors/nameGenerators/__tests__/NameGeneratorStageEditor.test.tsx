import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getStageEditorInitialValues } from '../../../interfaces/initialValues.ts';
import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { nameGeneratorStageEditors } from '../../nameGeneratorStageEditors.ts';

/**
 * The prompt and question text are rich-text editors, and their editing
 * surface cannot be driven in jsdom: ProseMirror places the caret through
 * `elementFromPoint` and `getClientRects`, neither of which jsdom implements,
 * so typing throws rather than producing text. A plain input carrying the same
 * value keeps these tests about what they are for — which sections the editor
 * composes, and what reaches the stage — and the editor has its own test.
 */
vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

/**
 * The editor as a host reaches it: through its family's registry part, so
 * every mount here also says this interface is dispatched to THIS editor.
 * The harness's `editor` slot takes an editor for ANY stage type, which a
 * named editor deliberately is not.
 */
const mountFixture = () =>
  renderStageEditor({
    stageId: 'name-generator-1',
    registry: nameGeneratorStageEditors,
  });

/** A stage of this interface that does not exist yet, as a host creates one. */
const newStage = () => {
  const { type: _type, ...fields } = getStageEditorInitialValues({
    interfaceType: 'NameGenerator',
    template: getInterfaceTemplate('NameGenerator'),
  });
  return {
    id: 'name-generator-being-created',
    type: 'NameGenerator' as const,
    fields: fields as SectionDoc,
  };
};

const openDialog = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
) => {
  await harness.user.click(screen.getByRole('button', { name }));
  return within(await screen.findByRole('dialog'));
};

describe('the name generator editor', () => {
  it('saves the stage it opened, unchanged, with every key on screen', async () => {
    const harness = mountFixture();

    expect(
      await screen.findByText('Who are the people you know?'),
    ).toBeInTheDocument();
    // Nothing is excused: every key this fixture stage holds belongs to a
    // section this editor mounts, so the researcher can see and change all of
    // it.
    await harness.roundTrip({ unowned: [] });
  });

  it('asks its questions in the order a researcher answers them', async () => {
    const harness = mountFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(8));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Form fields',
      'Prompts',
      'Side panels',
      'Nomination limits',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * What a researcher must do to a brand-new stage before a host will store
   * it: name it, say who it nominates, say what is recorded about them, and
   * ask something.
   */
  it('saves a new stage once it has been given the minimum a name generator needs', async () => {
    const harness = renderStageEditor({
      stage: newStage(),
      registry: nameGeneratorStageEditors,
    });

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Close friends',
    );
    // The type first: everything below describes it, and choosing a different
    // one throws all of that away.
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Form title' }),
      'Add a person',
    );
    const field = await openDialog(harness, 'Create new form field');
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'name',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question text' }),
      'What is their name?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const prompt = await openDialog(harness, 'Create new prompt');
    await harness.user.type(
      prompt.getByRole('textbox', { name: 'Prompt text' }),
      'Who are the people you are closest to?',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'Close friends',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'name', prompt: 'What is their name?' }],
      },
      prompts: [{ text: 'Who are the people you are closest to?' }],
    });
    // A stage the interface has no authored defaults for: everything it holds
    // was authored just now.
    expect(request?.stageDocument.panels).toBeUndefined();
    expect(request?.stageDocument.behaviours).toBeUndefined();
  });

  /**
   * The refusal has to say which part of the stage is unfinished. A form with
   * no heading reaches the schema as `stages.N.form.title`, which is a path
   * rather than a place on the page.
   */
  it('refuses to save a form with no heading, and says which section it is', async () => {
    const harness = mountFixture();

    await harness.user.clear(
      await screen.findByRole('textbox', { name: 'Form title' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(screen.getByText('Give this form a title.')).toBeInTheDocument();
    expect(
      harness.outline().find((section) => section.title === 'Form fields'),
    ).toEqual({ title: 'Form fields', state: 'Has a problem' });
  });

  /**
   * Closing the editor without saving leaves the host holding nothing: typing
   * is the researcher's, not the session's, until they save it.
   */
  it('leaves nothing behind when the editor is closed without saving', async () => {
    const harness = mountFixture();
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Form title' }),
      ' now',
    );
    await harness.cancel();

    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toHaveLength(0);
    expect(harness.gateway.getStagingResidue()).toHaveLength(0);
  });

  /**
   * A node type a collaborator adds appears here, and the editor says nothing
   * back: their change is not this session's edit, and echoing it would write
   * their work into this stage's own pending batch and save it as ours.
   */
  it('follows a codebook change made elsewhere without writing anything', async () => {
    const harness = mountFixture();
    await screen.findByRole('radio', { name: 'person' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        colleague: {
          name: 'colleague',
          color: 'node-color-seq-3',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            colleague_name: {
              name: 'colleague_name',
              type: 'text',
              component: 'Text',
            },
          },
        },
      },
    });

    expect(
      await screen.findByRole('radio', { name: 'colleague' }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();

    // The spy is watching the path a local edit really takes: a list editor
    // commits its rows structurally, so an echo of the change above would have
    // been caught here.
    const [removePrompt] = screen.getAllByRole('button', {
      name: 'Remove prompt',
    });
    await harness.user.click(removePrompt as HTMLElement);
    // The confirmation is modal, so the row's own control is hidden from the
    // accessibility tree while it is open and this finds the dialog's.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });

  it('refuses to save while someone else holds the stage', async () => {
    const harness = mountFixture();
    await screen.findByRole('textbox', { name: 'Form title' });

    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });
});
