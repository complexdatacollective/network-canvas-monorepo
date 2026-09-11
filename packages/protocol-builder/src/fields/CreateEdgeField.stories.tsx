import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import CreateEdgeField, { CREATE_EDGE_FIELD } from './CreateEdgeField.tsx';

/** The stage whose every question records a connection between a pair. */
const DYAD_CENSUS = sectionId({ kind: 'stage', stageId: 'dyad-census-1' });

/** The connection type the fixture's prompt was saved pointing at. */
const KNOWS = sectionId({ kind: 'codebookEdge', typeId: 'knows' });

/**
 * A Dyad Census's own words for this control.
 *
 * Passed rather than read from the census catalog because they are the
 * SECTION's: each of the three censuses records something different by a yes,
 * and says so in its own sentence. These are the Dyad Census's.
 */
const DYAD_CENSUS_WORDS = {
  title: 'Affirmative answer',
  description:
    'Choose the kind of connection an affirmative answer records between the pair.',
  hint: 'A connection of this type is created between the two people whenever the participant answers yes.',
  requiredMessage:
    'Choose the type of connection an affirmative answer creates.',
};

/**
 * Points the mounted field at a connection type.
 *
 * In the application the choice is a key of the PROMPT, held by the row dialog
 * that edits one question; this host mounts the control on the stage itself,
 * so a stored choice is seeded where the field is registered rather than in a
 * row the host does not open.
 */
const choseConnection =
  (typeId: string) =>
  (host: InMemoryHost): void => {
    const { document } = host.store.read(DYAD_CENSUS);
    host.store.applyAsCollaborator(DYAD_CENSUS, {
      ...document,
      [CREATE_EDGE_FIELD]: typeId,
    });
  };

const meta = {
  title: 'Protocol Builder/Fields/Connection type picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Says what a census question records between the two people it asked about, and — where the researcher has only just thought of it — invents the connection type to record. The types are the protocol’s own edge types, subscribed to rather than passed in, so one a collaborator adds or deletes appears or disappears while the question is open. Creating one writes the CODEBOOK, under that section’s own lock and on its own, and the question is then pointed at what the host made: a question naming a type that does not exist yet is not one the protocol would accept, so the two cannot be saved as one edit.',
      },
    },
  },
  args: {
    stageId: 'dyad-census-1',
    // What the host stands in for is the row dialog that edits one question,
    // which is where this control is met.
    sectionTitle: 'One question this stage asks',
    children: <CreateEdgeField {...DYAD_CENSUS_WORDS} />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A question nobody has said the answer to yet: no connection named. */
export const ANewQuestion: Story = {};

/** The question as the protocol holds it, recording the connection it names. */
export const AConnectionAlreadyChosen: Story = {
  args: { seedEdit: choseConnection('knows') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('radio', { name: 'knows' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('radio', { name: 'family_edge' }),
    ).not.toBeChecked();
  },
};

/**
 * Held elsewhere: every connection type is there to read, and none of them can
 * be chosen.
 */
export const ASpectator: Story = {
  args: { readOnly: true, seedEdit: choseConnection('knows') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('radio', { name: 'knows' }),
    ).toBeDisabled();
  },
};

/**
 * A question saved without saying what a yes records. Refused at the save
 * rather than the moment the dialog opens: a question being written is not yet
 * a question that is wrong.
 */
export const AConnectionThatMustBeChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText(DYAD_CENSUS_WORDS.requiredMessage),
    ).toBeInTheDocument();
  },
};

/**
 * The connection type this question records has been deleted from the
 * codebook. The choice is shown rather than blanked — a group of chips with
 * none of them selected reads as a question nobody has answered, while the
 * prompt underneath still names the type that is gone — and the control says
 * so for itself.
 *
 * What the researcher then meets at the save is `missingEdgeTypeIssue`, which
 * the three prompts sections apply in their own `beforeSave`. A row gate is
 * the dialog's to run, so this host cannot reach it: the sentence below is the
 * picker's, and the refusal that stops the question being saved is the
 * section's.
 */
export const AConnectionTypeThatWasDeleted: Story = {
  args: {
    seedEdit: (host) => {
      choseConnection('knows')(host);
      host.store.applyAsCollaborator(KNOWS, undefined);
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'This type is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * Inventing the connection type the question needs, without leaving the
 * question.
 *
 * The codebook's own editor rather than a name box: an edge type carries a
 * colour the participant recognises it by, and the researcher is asked for
 * both at once. What the prompt is then pointed at is the id the HOST minted,
 * read off the write.
 */
export const InventingOne: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', {
        name: 'Create a new connection type',
      }),
    );

    // The dialog is portalled out of the story root, so it is reached through
    // the document rather than the canvas.
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Edge type name' }),
      'worksWith',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save entity' }),
    );

    await expect(
      await canvas.findByRole('radio', { name: 'worksWith' }),
    ).toBeChecked();
  },
};
