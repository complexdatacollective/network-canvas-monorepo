import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import RichTextField from './RichTextField.tsx';

/** The prose an anonymisation stage shows before asking for a passphrase. */
const EXPLANATION_FIELD = 'explanationText.body';
const EXPLANATION_LABEL = 'Explanation';

/** The one question a family pedigree asks while the family is being built. */
const CENSUS_FIELD = 'censusPrompt';
const CENSUS_LABEL = 'Census prompt';

const ANONYMISATION = sectionId({ kind: 'stage', stageId: 'anonymisation-1' });

/**
 * A passage, which is what the multi-line shape is for: headings, lists and
 * links are all available, and Enter starts a new paragraph.
 */
const explanation = (
  <Field<typeof RichTextField>
    name={EXPLANATION_FIELD}
    component={RichTextField}
    label={EXPLANATION_LABEL}
    hint="Say which answers the passphrase protects, who can read them, and that the answers cannot be recovered without it."
    placeholder="Some of your answers are stored so that only you can unlock them."
    required={REQUIRED}
  />
);

/**
 * One line, which is what `singleLine` is for.
 *
 * The restriction is told to the editor as well as to the markdown conversion:
 * a document the editor was free to split left the conversion joining two
 * paragraphs into one line by inventing a separator, and a label a participant
 * reads was saved with a space in front of it.
 */
const censusPrompt = (
  <Field<typeof RichTextField>
    name={CENSUS_FIELD}
    component={RichTextField}
    label={CENSUS_LABEL}
    hint="Shown throughout the family-building phase, so it should describe the whole task rather than one step of it."
    placeholder="Enter your prompt..."
    singleLine
    required={REQUIRED}
  />
);

/** A stage whose participant-facing prose has not been written yet. */
const nothingWritten = (host: InMemoryHost) => {
  const { document } = host.store.read(ANONYMISATION);
  const explanationText = document.explanationText;
  // Read defensively rather than trusted: the host holds whatever the protocol
  // last sent, which is a document a collaborator can leave half-written.
  const title: unknown =
    typeof explanationText === 'object' && explanationText !== null
      ? Reflect.get(explanationText, 'title')
      : undefined;
  host.store.applyAsCollaborator(ANONYMISATION, {
    ...document,
    // The heading beside it is kept: this story is about the box that is
    // empty, and a stage missing both halves is a different state.
    explanationText: { title },
  });
};

const meta = {
  title: 'Protocol Builder/Fields/Markdown text',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The box every piece of participant-facing text in the builder is written in — a prompt, an explanation, the sentence under a heading. It holds markdown, and it shows the researcher what the participant will see rather than the characters that produce it. Two shapes: a passage, which may have headings, lists and links and takes as many paragraphs as it needs; and a single line, offered by callers whose value is read in a place that has room for one — a button’s label, a question in a row. The single line is held to one line by the editor itself, not only by the conversion to markdown, so a pasted passage arrives as one sentence rather than as a saved line break nobody asked for.',
      },
    },
  },
  args: {
    stageId: 'anonymisation-1',
    sectionTitle: 'What the participant is told',
    children: explanation,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: a passage somebody has written. */
export const Written: Story = {};

/** Nothing written yet, so the box shows an example of the prose it wants. */
export const NothingWrittenYet: Story = {
  args: { seedEdit: nothingWritten },
};

/**
 * Held elsewhere: the passage can be read, and neither the text nor the
 * formatting can be changed. The toolbar stays on screen rather than
 * disappearing — a control that vanishes cannot show that editing is held
 * somewhere else.
 */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: EXPLANATION_LABEL }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByRole('button', { name: 'Bold' })).toBeDisabled();
  },
};

/**
 * A passage the participant has to read, left blank. The refusal appears only
 * once the researcher tries to save, which is also how this story knows the
 * save was refused rather than still in flight: the sentence does not exist
 * until the submit has come back.
 */
export const TheSaveIsRefusedWithNothingWritten: Story = {
  args: { seedEdit: nothingWritten },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('textbox', { name: EXPLANATION_LABEL });
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(
      await canvas.findByText('This field is required.'),
    ).toBeVisible();
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};

/**
 * The whole toolbar, and a box that takes as many paragraphs as the passage
 * needs. `aria-multiline` is how a screen reader is told that Enter does
 * something here.
 */
export const APassage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: EXPLANATION_LABEL }),
    ).toHaveAttribute('aria-multiline', 'true');
    await expect(
      canvas.getByRole('button', { name: 'Heading 1' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Bullet list' }),
    ).toBeInTheDocument();
  },
};

/**
 * One line. Nothing that would need a second block is offered at all —
 * headings, lists and thematic breaks are withheld rather than shown and
 * refused — and the control says it holds one line, so a reader is not
 * promised an Enter that does nothing.
 */
export const OneLineOnly: Story = {
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'What the participant is asked',
    children: censusPrompt,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: CENSUS_LABEL }),
    ).toHaveAttribute('aria-multiline', 'false');
    await expect(
      canvas.queryByRole('button', { name: 'Heading 1' }),
    ).toBeNull();
    await expect(
      canvas.queryByRole('button', { name: 'Bullet list' }),
    ).toBeNull();
    await expect(
      canvas.queryByRole('button', { name: 'Thematic break' }),
    ).toBeNull();
  },
};
