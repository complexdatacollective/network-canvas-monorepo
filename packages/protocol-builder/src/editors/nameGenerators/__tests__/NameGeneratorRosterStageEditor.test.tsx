import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fixtureStageIds } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { nameGeneratorStageEditors } from '../../nameGeneratorStageEditors.ts';

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

/** A roster of different people, carrying different attributes. */
const OTHER_ROSTER = 'name,city\nAda,Lagos\nGrace,Kyoto\n';

const FIXTURE_COLUMNS = 'The people in it carry these attributes: age, name.';
const STAGED_COLUMNS = 'The people in it carry these attributes: city, name.';

/**
 * The editor as a host reaches it: through its family's registry part, so
 * every mount here also says this interface is dispatched to THIS editor.
 * The harness's `editor` slot takes an editor for ANY stage type, which a
 * named editor deliberately is not.
 */
const mountFixture = () =>
  renderStageEditor({
    stageId: 'name-generator-roster-1',
    registry: nameGeneratorStageEditors,
  });

/** Where a host would insert a new one: over the stage the fixture holds. */
const ROSTER_INDEX = fixtureStageIds().indexOf('name-generator-roster-1');

/**
 * The stage's name control, as the input it is.
 *
 * A stage the session is CREATING opens with a name already proposed for it,
 * so a create-mode test asks what the value looks like rather than what it
 * equals — the proposal is deduplicated against the interview it is joining.
 */
const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/** Replaces the stage's data file with one the researcher imports. */
const importAnotherRoster = async (
  harness: ReturnType<typeof renderStageEditor>,
) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Remove this resource' }),
  );
  await harness.user.click(
    await screen.findByRole('button', { name: 'Select a data file' }),
  );
  await harness.user.upload(
    await screen.findByLabelText('Choose a file from your computer'),
    new File([OTHER_ROSTER], 'community.csv', { type: 'text/csv' }),
  );
};

describe('the roster name generator editor', () => {
  it('saves the stage it opened, unchanged, with every key on screen', async () => {
    const harness = mountFixture();

    // The columns arrive from the gateway, and every section below the data
    // file is chosen from them: nothing here can be judged until they have.
    await screen.findByText(FIXTURE_COLUMNS);
    // Nothing is excused: every key this fixture stage holds belongs to a
    // section this editor mounts.
    await harness.roundTrip({ unowned: [] });
  });

  it('asks its questions in the order a researcher answers them', async () => {
    const harness = mountFixture();

    await waitFor(() => expect(harness.outline()).toHaveLength(10));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Roster source',
      'Prompts',
      'Card details',
      'Roster order',
      'Roster search',
      'Nomination limits',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * Everything on this stage is chosen from the data file's own columns — a
   * roster is external data, and a column in it need not be a codebook
   * attribute at all. Changing the file therefore changes every one of those
   * lists, and takes the choices made against the old file with it.
   */
  it('offers the chosen file’s columns, and follows a file the researcher swaps in', async () => {
    const harness = mountFixture();
    await screen.findByText(FIXTURE_COLUMNS);

    expect(screen.getByRole('checkbox', { name: 'age' })).toBeChecked();
    expect(cardDetailOptions()).toEqual(['age', 'name']);
    expect(sortableOptions()).toEqual(['age', 'name']);

    await importAnotherRoster(harness);

    expect(await screen.findByText(STAGED_COLUMNS)).toBeInTheDocument();
    // The card details, the ordering and the search all named columns of the
    // old file, so they went with it rather than staying as references to
    // attributes the new file does not have.
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Card details' }),
      ).not.toBeChecked(),
    );
    expect(
      screen.getByRole('switch', { name: 'Roster order' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Roster search' }),
    ).not.toBeChecked();

    // Switched back on, each section offers the NEW file's columns.
    await harness.user.click(
      screen.getByRole('switch', { name: 'Roster search' }),
    );
    expect(
      await screen.findByRole('checkbox', { name: 'city' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'age' })).toBeNull();

    await harness.user.click(
      screen.getByRole('switch', { name: 'Card details' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Add new card detail' }),
    );
    await waitFor(() => expect(cardDetailOptions()).toEqual(['city', 'name']));
  });

  /**
   * What a researcher must do to a brand-new stage before a host will store
   * it: name it, say who it lists, choose the file they come from, and ask
   * something. The card, ordering and search sections are all genuinely
   * optional — a short roster of distinct names needs none of them.
   */
  it('saves a new stage once it has been given the minimum a roster needs', async () => {
    const harness = renderStageEditor({
      create: { type: 'NameGeneratorRoster', position: ROSTER_INDEX },
      registry: nameGeneratorStageEditors,
    });

    // A stage the session is CREATING opens with a name proposed for it —
    // nothing else about this interface has an authored default, so the
    // rest of what a host will store is written below.
    await waitFor(() => expect(stageNameInput()).not.toHaveValue(''));
    expect(stageNameInput().value).toMatch(/^Roster Name Generator/);

    await harness.user.clear(stageNameInput());
    await harness.user.type(stageNameInput(), 'People from the register');
    // The type first: everything below describes it, and choosing a different
    // one throws all of that away.
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await harness.user.click(
      await screen.findByRole('button', { name: 'Select a data file' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Roster' }),
    );
    await screen.findByText(FIXTURE_COLUMNS);

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    const prompt = within(await screen.findByRole('dialog'));
    await harness.user.type(
      prompt.getByRole('textbox', { name: 'Prompt text' }),
      'Which of these people do you know?',
    );
    await harness.user.click(prompt.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      label: 'People from the register',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster_data',
      prompts: [{ text: 'Which of these people do you know?' }],
    });
    expect(request?.stageDocument.cardOptions).toBeUndefined();
    expect(request?.stageDocument.sortOptions).toBeUndefined();
    expect(request?.stageDocument.searchOptions).toBeUndefined();
  });

  /**
   * The refusal has to say which part of the stage is unfinished. A search
   * with nothing to match against finds nobody whatever the participant types,
   * and reaches the schema as `searchOptions.matchProperties` against a path.
   */
  it('refuses to save a search that matches nothing, and says which section it is', async () => {
    const harness = mountFixture();
    await screen.findByText(FIXTURE_COLUMNS);

    await harness.user.click(screen.getByRole('checkbox', { name: 'name' }));
    await harness.user.click(screen.getByRole('checkbox', { name: 'age' }));

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'Choose at least one attribute for a search to match against.',
      ),
    ).toBeInTheDocument();
    expect(
      harness.outline().find((section) => section.title === 'Roster search'),
    ).toEqual({ title: 'Roster search', state: 'Has a problem' });
  });

  /**
   * A data file imported while editing is staged with the host rather than
   * stored: closing the editor without saving has to leave the host holding
   * neither the file nor anything the researcher typed.
   */
  it('leaves nothing behind when the editor is closed without saving', async () => {
    const harness = mountFixture();
    await screen.findByText(FIXTURE_COLUMNS);

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await importAnotherRoster(harness);
    await screen.findByText(STAGED_COLUMNS);
    // The proof the discard below has something to do.
    expect(harness.gateway.getStagingResidue().length).toBeGreaterThan(0);

    await harness.cancel();

    expect(harness.gateway.getStagingResidue()).toHaveLength(0);
    expect(harness.pendingCommands()).toHaveLength(0);
  });

  /**
   * A node type a collaborator adds appears here, and the editor says nothing
   * back: their change is not this session's edit, and echoing it would write
   * their work into this stage's own pending batch and save it as ours.
   */
  it('follows a codebook change made elsewhere without writing anything', async () => {
    const harness = mountFixture();
    await screen.findByText(FIXTURE_COLUMNS);
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
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
  });

  it('refuses to save while someone else holds the stage', async () => {
    const harness = mountFixture();
    await screen.findByText(FIXTURE_COLUMNS);

    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });
});

/** The columns a card detail may show, as that section offers them. */
const cardDetailOptions = () => columnOptions('Card details');

/**
 * The columns the participant may reorder the roster by. Second in its
 * section: the starting order comes first, and both name a column.
 */
const sortableOptions = () => columnOptions('Roster order', 1);

/**
 * The columns one roster section offers, read from a row of one of its lists.
 *
 * Scoped to the section rather than to the page: three of them offer the data
 * file's columns under the same "Attribute" label, and an unscoped search
 * cannot say which list it read.
 */
function columnOptions(sectionName: string, rowIndex = 0): string[] {
  const region = within(screen.getByRole('region', { name: sectionName }));
  const row = region.getAllByRole('combobox', { name: 'Attribute' })[rowIndex];
  if (row === undefined) {
    throw new Error(`"${sectionName}" has no attribute row ${rowIndex}.`);
  }
  return within(row)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value)
    .filter((value) => value !== '');
}
