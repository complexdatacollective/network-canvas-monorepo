import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { nameGeneratorStageEditors } from '../../nameGeneratorStageEditors.ts';
import { addInterviewNetworkPanel, chooseNodeType } from './addSidePanel.ts';

/**
 * The prompt text is a rich-text editor, and its editing surface cannot be
 * driven in jsdom: ProseMirror places the caret through `elementFromPoint` and
 * `getClientRects`, neither of which jsdom implements, so typing throws rather
 * than producing text. A plain input carrying the same value keeps these tests
 * about what they are for — which sections the editor composes, and what
 * reaches the stage — and the editor has its own test.
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

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

/**
 * The editor as a host reaches it: through its family's registry part, so
 * every mount here also says this interface is dispatched to THIS editor.
 * The harness's `editor` slot takes an editor for ANY stage type, which a
 * named editor deliberately is not.
 */
const mountFixture = () =>
  renderStageEditor({
    stageId: 'name-generator-quick-add-1',
    registry: nameGeneratorStageEditors,
  });

/** Where a host would insert a new one: over the stage the fixture holds. */
const QUICK_ADD_INDEX = fixtureStageIds().indexOf('name-generator-quick-add-1');

const createFixture = () => ({
  create: {
    type: 'NameGeneratorQuickAdd' as const,
    position: QUICK_ADD_INDEX,
  },
  registry: nameGeneratorStageEditors,
});

/**
 * The stage's name control, as the input it is.
 *
 * A stage the session is CREATING opens with a name already proposed for it,
 * so a create-mode test asks what the value looks like rather than what it
 * equals — the proposal is deduplicated against the interview it is joining.
 */
const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

const quickAddOptions = () =>
  within(screen.getByRole('combobox', { name: /Attribute filled in/ }))
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

describe('the quick-add name generator editor', () => {
  it('saves the stage it opened, unchanged, with every key on screen', async () => {
    const harness = mountFixture();

    expect(
      await screen.findByText('Quickly add people you know'),
    ).toBeInTheDocument();
    // Nothing is excused: every key this fixture stage holds belongs to a
    // section this editor mounts.
    await harness.roundTrip({ unowned: [] });
  });

  it('asks its questions in the order a researcher answers them', async () => {
    const harness = mountFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(8));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Quick add',
      'Prompts',
      'Side panels',
      'Nomination limits',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * What a researcher must do to a brand-new stage before a host will store
   * it: name it, say who it nominates, say what the single box fills in, and
   * ask something.
   */
  it('opens a new stage on the interface template', async () => {
    renderStageEditor(createFixture());

    // A stage the session is CREATING opens with a name proposed for it —
    // nothing else about this interface has an authored default, so
    // everything a host will store is the researcher's to write.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Quick Add Name Generator/);
    expect(screen.getByRole('radio', { name: 'person' })).not.toBeChecked();
  });

  it('saves a new stage once it has been given the minimum quick add needs', async () => {
    const harness = renderStageEditor(createFixture());
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));

    await writeInto(harness, stageNameInput(), 'People you see often');
    // The type first: everything below describes it, and choosing a different
    // one throws all of that away.
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: /Attribute filled in/ }),
      'name',
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    const prompt = within(await screen.findByRole('dialog'));
    await writeInto(
      harness,
      prompt.getByRole('textbox', { name: 'Prompt text' }),
      'Who do you see most weeks?',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'People you see often',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      prompts: [{ text: 'Who do you see most weeks?' }],
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
    const harness = renderStageEditor(createFixture());

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue('Quick Add Name Generator'),
    );

    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');

    await waitFor(() =>
      expect(stageNameInput()).toHaveValue(
        'Quick Add Name Generator with Network Panels',
      ),
    );
  });

  /** A name the researcher typed is theirs; a later panel does not take it. */
  it('leaves a name the researcher typed alone when a panel is added', async () => {
    const harness = renderStageEditor(createFixture());

    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    await harness.user.clear(stageNameInput());
    await harness.user.type(stageNameInput(), 'People you see often');

    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');

    expect(stageNameInput()).toHaveValue('People you see often');
  });

  /**
   * An existing stage's name is already the researcher's — they typed it, or
   * accepted a proposal months ago — so adding a panel to it renames nothing.
   */
  it('never renames a stage that already exists', async () => {
    const harness = mountFixture();
    await screen.findByText('Quickly add people you know');
    expect(stageNameInput()).toHaveValue('Name Generator Quick Add');

    await chooseNodeType(harness, 'person');
    await addInterviewNetworkPanel(harness, 'People you named earlier');

    expect(stageNameInput()).toHaveValue('Name Generator Quick Add');
  });

  /**
   * The refusal has to say which part of the stage is unfinished. A stage that
   * asks nothing reaches the schema as "expected array to have >=1 items"
   * against a path, rather than as a place on the page.
   */
  it('refuses to save a stage that asks nothing, and says which section it is', async () => {
    const harness = mountFixture();

    const [removePrompt] = await screen.findAllByRole('button', {
      name: 'Remove prompt',
    });
    await harness.user.click(removePrompt as HTMLElement);
    // The confirmation is modal, so the row's own control is hidden from the
    // accessibility tree while it is open and this finds the dialog's.
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Create at least one prompt. A stage with no prompts asks the participant nothing.',
      ),
    ).toBeInTheDocument();
    expect(
      harness.outline().find((section) => section.title === 'Prompts'),
    ).toEqual({ title: 'Prompts', state: 'Has a problem' });
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
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: /Attribute filled in/ }),
      'relationship_to_ego',
    );
    await harness.cancel();

    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toHaveLength(0);
    expect(harness.gateway.getStagingResidue()).toHaveLength(0);
  });

  /**
   * An attribute a collaborator adds to the type this stage nominates becomes
   * something quick add could fill in, and the editor says nothing back: their
   * change is not this session's edit, and echoing it would write their work
   * into this stage's own pending batch and save it as ours.
   */
  it('follows a codebook change made elsewhere without writing anything', async () => {
    const harness = mountFixture();
    await screen.findByRole('combobox', { name: /Attribute filled in/ });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: { person: withNickname(personDefinition(harness)) },
    });

    await waitFor(() => expect(quickAddOptions()).toContain('nickname'));
    expect(dispatch).not.toHaveBeenCalled();

    // The spy is watching the path a local edit really takes: a list editor
    // commits its rows structurally, so an echo of the change above would have
    // been caught here.
    const [removePrompt] = screen.getAllByRole('button', {
      name: 'Remove prompt',
    });
    await harness.user.click(removePrompt as HTMLElement);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });

  /**
   * Quick add and a prompt's assignments write the same node with opposite
   * validation — one honours the attribute's rules as the participant types,
   * the other stamps a fixed value with nobody to check it — and the interview
   * applies the assignments before the typed value, so one attribute claimed
   * by both would have the typing overwrite the stamp.
   *
   * They cannot collide, and the reason is structural rather than a check
   * either section performs: quick add can only offer TEXT (one box, and the
   * schema's own rule 3e refuses anything else), and an assignment can only
   * offer BOOLEAN (the interview sets the value with nobody to answer). The
   * shared prompts section's role map deliberately omits the stage being
   * edited, so neither section can see the other's unsaved pick — which is
   * exactly why this has to be pinned: widening either pool by a type would
   * make the two reachable from each other with nothing in between.
   *
   * Both picks are made in THIS session, unsaved, which is the case a role map
   * built from the saved protocol cannot answer for.
   */
  it('never offers one attribute to both quick add and a prompt assignment', async () => {
    const harness = mountFixture();
    // Invented here, so nothing else in the protocol writes it: an attribute
    // some other stage already collects would be kept out of the assignment
    // list by the ordinary cross-class rule, and this test would pass without
    // saying anything about the two pools.
    await harness.user.type(
      await screen.findByRole('textbox', { name: /Create a new attribute/ }),
      'nickname',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );
    const invented = await waitFor(() => {
      const value = (
        screen.getByRole('combobox', {
          name: /Attribute filled in/,
        }) as HTMLSelectElement
      ).value;
      if (value === 'name') throw new Error('the create has not landed yet');
      return value;
    });

    // Read before the dialog opens: it is modal, so the stage behind it is
    // hidden from the accessibility tree while it is up.
    const fillable = quickAddOptions().filter((value) => value !== '');

    const [editPrompt] = screen.getAllByRole('button', { name: 'Edit prompt' });
    await harness.user.click(editPrompt as HTMLElement);
    const dialog = within(await screen.findByRole('dialog'));
    await harness.user.click(
      dialog.getByRole('button', { name: 'Add new attribute to assign' }),
    );

    const assignable = within(
      dialog.getByRole('combobox', { name: /Create or select an attribute/ }),
    )
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
      .filter((value) => value !== '');

    // Neither list may be empty, or the disjointness below would hold for the
    // wrong reason.
    expect(assignable.length).toBeGreaterThan(0);
    expect(fillable).toContain(invented);
    // The live quick-add pick, named outright: it is what the reviewer's
    // failure would have to reach, and nothing but the type of the pool keeps
    // it out.
    expect(assignable).not.toContain(invented);
    expect(assignable.filter((value) => fillable.includes(value))).toEqual([]);
    // The structural reason, stated as itself: one box can only be typed into,
    // and a stamp set with nobody to answer can only be a flag.
    const typeOf = (variableId: string) =>
      (
        harness.hostCodebook().node?.person?.variables?.[variableId] as
          | { type?: string }
          | undefined
      )?.type;
    expect(fillable.map(typeOf)).toEqual(fillable.map(() => 'text'));
    expect(assignable.map(typeOf)).toEqual(assignable.map(() => 'boolean'));
  });

  it('refuses to save while someone else holds the stage', async () => {
    const harness = mountFixture();
    await screen.findByRole('combobox', { name: /Attribute filled in/ });

    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });
});

/** The type this stage nominates, exactly as the session holds it. */
function personDefinition(
  harness: ReturnType<typeof renderStageEditor>,
): SectionDoc {
  const definition =
    harness.session.getSnapshot().protocolSections[PERSON_SECTION];
  if (definition === undefined) {
    throw new Error('The fixture protocol has no "person" node type.');
  }
  return definition;
}

/**
 * The same type with one more text attribute, as a collaborator editing the
 * codebook in another session would leave it.
 */
function withNickname(definition: SectionDoc): SectionDoc {
  const variables = definition.variables;
  return {
    ...definition,
    variables: {
      ...(typeof variables === 'object' && variables !== null ? variables : {}),
      nickname: { name: 'nickname', type: 'text', component: 'Text' },
    },
  };
}
