import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import EdgeTypeSection from '../editors/dyad-census/sections/EdgeTypeSection.tsx';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import { PromptTextField, PromptTextPreview } from './PromptTextField.tsx';

/** The question the fixture's Dyad Census asks, as the protocol holds it. */
const WRITTEN = 'Do these **two people** know each other?';

/** What this prompt shows the participant is refused when it is nothing. */
const REFUSAL =
  'Write the question or instruction this prompt shows the participant.';

/**
 * What the participant is looking at while they answer, in a Dyad Census's own
 * words — the guidance each family passes, because it is the thing that
 * decides how the question has to be phrased.
 */
function DyadCensusGuidance() {
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        The participant sees two people side by side and answers yes or no, so
        write the question about the pair in front of them — “these two people”
        rather than a name — and phrase it so that yes and no are both sensible
        answers.
      </AlertDescription>
    </Alert>
  );
}

/**
 * One question, as a Dyad Census's row dialog mounts it.
 *
 * The group's name, its description and the connection type inside it are the
 * SECTION's, passed in: three of the five families put the question in a group
 * of its own and the other two put the connection an answer records in the
 * same group, so Architect names and explains it differently in each. These
 * are the Dyad Census's, and the connection picker is here because its
 * description is what says an affirmative answer creates one.
 */
function TheQuestion({ item }: Readonly<{ item: Record<string, unknown> }>) {
  return (
    <PromptTextField
      item={item}
      guidance={<DyadCensusGuidance />}
      placeholder="Do these two people know each other?"
      title="Prompt configuration"
      description="Write the participant prompt and select the edge type created by an affirmative response."
    >
      <EdgeTypeSection
        label="Created edge type"
        requiredMessage="Choose the type of connection an affirmative answer creates."
      />
    </PromptTextField>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Participant prompt',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The question one prompt shows the participant, written as markdown in a single line. Shared by the three censuses and the two bins, which differ in whether there is a sentence above the box at all, in what it says, in the example inside the box, and in what the group holding it is called — and that sentence comes first, because what the participant is looking at while they answer decides how the question has to be phrased. A prompt with nothing written in it is refused when the researcher saves, not while they are still writing.',
      },
    },
  },
  args: {
    stageId: 'dyad-census-1',
    // What the host stands in for is the row dialog that edits one question.
    sectionTitle: 'One question this stage asks',
    children: <TheQuestion item={{}} />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A question nobody has written yet, with the example inside the empty box. */
export const ANewQuestion: Story = {};

/**
 * The question as the protocol holds it. It reaches the field from the row the
 * dialog opened on rather than from the stage, so a question typed and then
 * cancelled goes with the row.
 */
export const AQuestionAlreadyWritten: Story = {
  args: { children: <TheQuestion item={{ text: WRITTEN }} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    // The box holds markdown as words rather than as its source: the emphasis
    // is drawn, so what is read here is what the participant will read.
    await expect(
      await canvas.findByRole('textbox', { name: 'Prompt text' }),
    ).toHaveTextContent('Do these two people know each other?');
  },
};

/** Held elsewhere: the question can be read, and the box takes nothing. */
export const ASpectator: Story = {
  args: {
    readOnly: true,
    children: <TheQuestion item={{ text: WRITTEN }} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: 'Prompt text' }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};

/**
 * A prompt saved with nothing for the participant to read. Said at the save,
 * because a box a researcher has not finished typing into is not a box that is
 * wrong.
 */
export const AQuestionThatMustBeWritten: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(await canvas.findByText(REFUSAL)).toBeInTheDocument();
  },
};

/**
 * How the same two questions read in the list of prompts, with their dialogs
 * closed.
 *
 * The written one is rendered as markdown rather than shown as its source: a
 * row reading `**these two people**` would send the researcher into the
 * interview to find out what the participant actually sees. The empty one is
 * named for being empty, so a prompt that has not been written yet can be
 * picked out of the list rather than read as a blank row.
 */
export const HowTheyReadInTheList: Story = {
  args: {
    children: (
      <>
        <PromptTextPreview item={{}} />
        <PromptTextPreview item={{ text: WRITTEN }} />
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('This prompt has no question yet.'),
    ).toBeInTheDocument();
    // An element of its own holding exactly the emphasised words, which is
    // what the markdown having been parsed looks like from outside.
    await expect(canvas.getByText('two people')).toBeInTheDocument();
  },
};
