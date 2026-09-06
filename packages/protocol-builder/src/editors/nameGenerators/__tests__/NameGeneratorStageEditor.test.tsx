import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { nameGeneratorStageEditors } from '../../nameGeneratorStageEditors.ts';
import { addInterviewNetworkPanel, chooseNodeType } from './addSidePanel.ts';

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

/** Where a host would insert a new one: over the stage the fixture holds. */
const NAME_GENERATOR_INDEX = fixtureStageIds().indexOf('name-generator-1');

/**
 * The stage's name control, as the input it is.
 *
 * A stage the session is CREATING opens with a name already proposed for it,
 * so a create-mode test asks what the value looks like rather than what it
 * equals — the proposal is deduplicated against the interview it is joining.
 */
const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

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
      create: { type: 'NameGenerator', position: NAME_GENERATOR_INDEX },
      registry: nameGeneratorStageEditors,
    });

    // A stage the session is CREATING opens with a name proposed for it —
    // nothing else about this interface has an authored default, so the
    // rest of what a host will store is written below.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Form Name Generator/);

    await harness.user.clear(stageNameInput());
    await harness.user.type(stageNameInput(), 'Close friends');
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
   * The proposed name says what the stage IS, and side panels are part of
   * that: a name generator offering the people named so far is a different
   * stage from one that offers nothing.
   *
   * The rule is Architect's, unchanged. `resolveStageQualifier` — which
   * `apps/architect/src/components/StageEditor/autoStageName/useAutoStageName.ts`
   * calls, and which this package already owns — turns panels that all draw on
   * the interview's own network into "with Network Panels".
   */
  it('qualifies the proposed name of a new stage with the panels beside it', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGenerator', position: NAME_GENERATOR_INDEX },
      registry: nameGeneratorStageEditors,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Form Name Generator'),
    );

    // Naming the type is part of the proposal too, so the expected name
    // carries it from here on.
    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue(
        'Person Form Name Generator with Network Panels',
      ),
    );
  });

  /**
   * Switching the capability off destroys the panels, so the qualifier goes
   * with them: the proposal describes the stage as it now is, not as it was.
   */
  it('takes the panel qualifier back out when the panels are switched off', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGenerator', position: NAME_GENERATOR_INDEX },
      registry: nameGeneratorStageEditors,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Form Name Generator'),
    );
    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue(
        'Person Form Name Generator with Network Panels',
      ),
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Side panels' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove panels' }),
    );

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Person Form Name Generator'),
    );
  });

  /**
   * And the same is true of the last panel being deleted, which leaves an
   * EMPTY list rather than no list at all.
   *
   * A stage with no panels is named as if the section had never been switched
   * on — the qualifier reads what the panels are, and there are none. Proved
   * here rather than asserted by a guard on the way in: `resolvePanelQualifier`
   * already answers `null` for an empty list, and a second guard upstream
   * would only be a second thing to keep in step with it.
   */
  it('takes the panel qualifier back out when the last panel is deleted', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGenerator', position: NAME_GENERATOR_INDEX },
      registry: nameGeneratorStageEditors,
    });

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Form Name Generator'),
    );
    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');
    await waitFor(() =>
      expect(stageNameInput()).toHaveValue(
        'Person Form Name Generator with Network Panels',
      ),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove panel' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove panel' }),
    );

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Person Form Name Generator'),
    );
  });

  /** A name the researcher typed is theirs; a later panel does not take it. */
  it('leaves a name the researcher typed alone when a panel is added', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGenerator', position: NAME_GENERATOR_INDEX },
      registry: nameGeneratorStageEditors,
    });

    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    await harness.user.clear(stageNameInput());
    await harness.user.type(stageNameInput(), 'Close friends');

    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');

    expect(stageNameInput()).toHaveValue('Close friends');
  });

  /**
   * An existing stage's name is already the researcher's — they typed it, or
   * accepted a proposal months ago — so adding a panel to it renames nothing.
   */
  it('never renames a stage that already exists', async () => {
    const harness = mountFixture();
    await screen.findByText('Who are the people you know?');
    expect(stageNameInput()).toHaveValue('Name Generator');

    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');

    expect(stageNameInput()).toHaveValue('Name Generator');
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

/**
 * The two sections of this editor that write the same node, with opposite
 * validation: a form field asks the participant and checks the answer, a
 * prompt stamp sets a value with nobody to check. The schema refuses an
 * attribute written both ways, so each has to see what the other has bound in
 * THIS session — the role map is built from the saved protocol, and knows
 * neither.
 *
 * The prompts section reads the live form itself. The other direction is the
 * editor's to supply, because it is the one component that knows both sections
 * are on screen, and this is what says it does.
 *
 * Only the withdrawal is covered here. The save-time refusal behind it belongs
 * to `FormFieldsSection`, which owns it and can reach it: once a field is
 * bound the stamp picker stops offering the attribute, so no order of clicks
 * in THIS editor produces the contradiction — which is the point of the
 * withdrawal.
 */
describe('a form field and a prompt stamp reaching for the same attribute', () => {
  /**
   * An attribute of the fixture's person type that nothing writes yet.
   *
   * The fixture's own attributes are all spoken for — every one the form
   * offers is refused by the stamp picker and the other way about, because the
   * protocol already exercises those rules elsewhere. So the test needs one
   * free attribute, added the way a collaborator would add it.
   */
  const FREE_ATTRIBUTE = 'nominated_early';

  const addFreeAttribute = (harness: ReturnType<typeof renderStageEditor>) => {
    const person =
      harness.session.getSnapshot().protocolSections[
        sectionId({ kind: 'codebookNode', typeId: 'person' })
      ];
    if (person === undefined) throw new Error('the person type is gone');

    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...person,
          variables: {
            ...(person.variables as Record<string, unknown>),
            [FREE_ATTRIBUTE]: {
              name: FREE_ATTRIBUTE,
              type: 'boolean',
              component: 'Boolean',
            },
          },
        },
      },
    });
  };

  /** Which attributes a form-field dialog is offering. */
  const offeredAttributes = (dialog: ReturnType<typeof within>): string[] =>
    within(dialog.getByRole('combobox', { name: 'Attribute' }))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

  const closeDialog = async (
    harness: ReturnType<typeof renderStageEditor>,
    dialog: ReturnType<typeof within>,
  ) => {
    await harness.user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );
  };

  it('withdraws it from the form the moment a prompt stamps it', async () => {
    const harness = mountFixture();
    await screen.findByRole('textbox', { name: 'Form title' });
    addFreeAttribute(harness);

    // Nothing writes it unvalidated yet, so the form may collect it.
    const before = await openDialog(harness, 'Create new form field');
    expect(offeredAttributes(before)).toContain(FREE_ATTRIBUTE);
    await closeDialog(harness, before);

    // The researcher stamps it on everyone this prompt names instead.
    const prompt = await openDialog(harness, 'Edit prompt');
    await harness.user.click(
      prompt.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    await harness.user.selectOptions(
      await prompt.findByRole('combobox', {
        name: 'Create or select an attribute',
      }),
      FREE_ATTRIBUTE,
    );
    await harness.user.click(prompt.getByRole('radio', { name: 'True' }));
    await harness.user.click(prompt.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // Nothing has been saved: the stamp is a draft write, invisible to the
    // role map, and this is the editor handing it to the form.
    expect(harness.pendingCommands().length).toBeGreaterThan(0);

    const after = await openDialog(harness, 'Create new form field');
    const offered = offeredAttributes(after);
    // Not the empty picker: everything else about this node type is still
    // offered, so the section is filtering rather than failing.
    expect(offered).toContain('flagged');
    expect(offered).not.toContain(FREE_ATTRIBUTE);
  });
});
