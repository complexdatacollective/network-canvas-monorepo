import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import { useAutoStageName } from '../naming/useAutoStageName.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import StageNameInput from './StageNameInput.tsx';

const STAGE = sectionId({ kind: 'stage', stageId: 'sociogram-1' });

const STAGE_NAME_LABEL = 'Stage name';

/** The control's own cap, as `StageNameSection` sets it. It is not a rule. */
const STAGE_NAME_LIMIT = 50;

/**
 * What a stage arranging a person's network is called when nobody has named
 * it: the interface's own name, qualified by whose network it collects.
 *
 * Written down rather than derived, so a change to how a name is proposed
 * fails here instead of being absorbed by a story that asks the namer what it
 * would say and then agrees with it.
 */
const PROPOSED_NAME = 'Person Sociogram';

/**
 * The name control, with the auto-namer behind it.
 *
 * The two halves are separate on purpose, and `StageNameSection` wires them
 * together exactly like this: the control reports that the researcher has left
 * it, and the naming hook decides what leaving an empty name means. `propose`
 * is that section's `autoName.propose` — the override it documents for an
 * editor with a reason to differ from the edit's own answer.
 */
function StageName({ propose = false }: Readonly<{ propose?: boolean }>) {
  const { onLabelBlur } = useAutoStageName({ isNewStage: propose });

  return (
    <Field<typeof StageNameInput>
      name="label"
      component={StageNameInput}
      label={STAGE_NAME_LABEL}
      // Hidden because this control IS the stage's heading: a visible label
      // above it would name the stage twice, and the label still has to exist
      // because it is what the outline and a host's problem panel call the
      // field.
      labelHidden
      placeholder="Enter stage name..."
      characterLimit={STAGE_NAME_LIMIT}
      required={REQUIRED}
      onFieldBlur={onLabelBlur}
    />
  );
}

/** A stage nobody has named, which is where a stage being created starts. */
const unnamed = (host: InMemoryHost) => {
  const { document } = host.store.read(STAGE);
  host.store.applyAsCollaborator(STAGE, { ...document, label: '' });
};

const meta = {
  title: 'Protocol Builder/Fields/Stage name',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What the researcher calls one step of their interview, worn at the size of the page’s own heading. It is a text area rather than a single-line box for one reason: a name longer than the column has to wrap instead of being cut off at the edge with nothing saying more of it exists. The value it holds is still one line — Enter saves the stage the way it would in an ordinary text box, and a pasted name’s line breaks become spaces without the name being shortened. A stage being created is named from what it collects, and the proposal is put back if the researcher clears the name and moves on; a name they wrote themselves is never written over.',
      },
    },
  },
  args: {
    stageId: 'sociogram-1',
    sectionTitle: 'What this stage is called',
    children: <StageName />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: a name the researcher settled on. */
export const Named: Story = {};

/** Nothing yet, so the placeholder stands in at the same size the name will be. */
export const NotYetNamed: Story = {
  args: { seedEdit: unnamed },
};

/** Held elsewhere: the name can be read and not rewritten. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: STAGE_NAME_LABEL }),
    ).toBeDisabled();
  },
};

/**
 * A stage has to be called something. The refusal appears only once the
 * researcher tries to save, which is also how this story knows the save was
 * refused rather than still in flight: the sentence does not exist until the
 * submit has come back.
 */
export const TheSaveIsRefusedWithoutAName: Story = {
  args: { seedEdit: unnamed },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('textbox', { name: STAGE_NAME_LABEL });
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
 * Enter saves the stage rather than typing a line into the name.
 *
 * The `<input>` this replaced performed the form's implicit submission, so
 * that is what Enter still does — and the saved document is where the two
 * possible outcomes can be told apart, because a line break inside the name
 * would be saved along with it.
 */
export const EnterSavesTheStage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(
      await canvas.findByRole('textbox', { name: STAGE_NAME_LABEL }),
      ' (revised)',
    );
    await userEvent.keyboard('{Enter}');

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('"label":"Sociogram (revised)"');
    });
  },
};

/**
 * A stage being created arrives already named, from what it collects and what
 * kind of stage it is. The researcher opens an editor with something to
 * recognise the stage by rather than an empty heading to fill in first.
 */
export const ANameProposedForANewStage: Story = {
  args: { seedEdit: unnamed, children: <StageName propose /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: STAGE_NAME_LABEL });
    await waitFor(async () => {
      await expect(box).toHaveValue(PROPOSED_NAME);
    });
  },
};

/**
 * Clearing the name to rename the stage is not fought mid-keystroke: the box
 * stays empty while the researcher is in it. Leaving it empty is a different
 * act, and the proposal comes back rather than the stage losing its name.
 */
export const TheProposalComesBackWhenTheNameIsLeftEmpty: Story = {
  args: { seedEdit: unnamed, children: <StageName propose /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: STAGE_NAME_LABEL });
    await waitFor(async () => {
      await expect(box).toHaveValue(PROPOSED_NAME);
    });

    await userEvent.clear(box);
    await expect(box).toHaveValue('');

    // Tabbed rather than clicked away: the next thing that takes focus is the
    // save, and clicking it would submit the stage as well as leave the field.
    await userEvent.tab();
    await waitFor(async () => {
      await expect(box).toHaveValue(PROPOSED_NAME);
    });
  },
};

/**
 * And a name the researcher wrote is theirs. The proposal is never put back
 * over it, on this blur or on any later change to what the stage collects.
 */
export const ANameTheResearcherWroteIsKept: Story = {
  args: { seedEdit: unnamed, children: <StageName propose /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', { name: STAGE_NAME_LABEL });
    await waitFor(async () => {
      await expect(box).toHaveValue(PROPOSED_NAME);
    });

    await userEvent.clear(box);
    await userEvent.type(box, 'Who you turn to');
    await userEvent.tab();

    await expect(box).toHaveValue('Who you turn to');
  },
};
