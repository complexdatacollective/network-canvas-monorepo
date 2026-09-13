import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { canvasBehavioursMessages } from '../sections/canvas-behaviours/canvasBehavioursMessages.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import LayoutModeField from './LayoutModeField.tsx';

/** Where every canvas stage keeps this decision. */
const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';

/** Which interface's wording the cards carry. */
type Wording =
  /** The sentences the control itself supplies, which most canvases use. */
  | 'shared'
  /**
   * A narrative stage's own. It is shown a network that has already been
   * built rather than collecting positions, so both cards promise something
   * different from the shared sentences.
   */
  | 'narrative';

/**
 * The control as `NodeLayoutSection` mounts it: the section names the field and
 * formats the words, and passes an interface's own sentences only where it has
 * them. Absent, the cards keep the wording the control itself carries.
 */
function LayoutMode({ wording = 'shared' }: Readonly<{ wording?: Wording }>) {
  const intl = useAppIntl();
  return (
    <Field<typeof LayoutModeField>
      name={AUTOMATIC_LAYOUT_FIELD}
      component={LayoutModeField}
      label={intl.formatMessage(canvasBehavioursMessages.layoutModeLabel)}
      hint={intl.formatMessage(canvasBehavioursMessages.layoutModeHint)}
      {...(wording === 'narrative'
        ? {
            manualDescription: intl.formatMessage(
              canvasBehavioursMessages.layoutModeManualNarrativeDescription,
            ),
            automaticDescription: intl.formatMessage(
              canvasBehavioursMessages.layoutModeAutomaticNarrativeDescription,
            ),
          }
        : {})}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Layout mode',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'How a canvas stage arranges nodes when it opens. The protocol stores one switch, and the researcher is asked it as a choice between two named modes: “automatic layout is off” is not a decision anybody recognises making, while “manual mode” is — and each card can then say what the participant will actually see. What they see is not the same on every canvas, so an interface whose behaviour differs passes its own sentence for a card and the rest keep the shared one. Nothing stored is manual mode: opting a protocol into a force simulation nobody asked for would change what its participants see.',
      },
    },
  },
  args: {
    stageId: 'sociogram-1',
    sectionTitle: 'Node layout',
    children: <LayoutMode />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sociogram as the protocol holds it: the stage arranges the nodes. */
export const Automatic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Automatic mode/ }),
    ).toHaveAttribute('aria-selected', 'true');
  },
};

/**
 * A stage that stores nothing here, which is most of them. It is drawn as
 * manual rather than as nothing chosen: the absence IS the answer, and a
 * control showing neither card would ask the researcher to make a decision the
 * protocol has already made.
 */
export const NothingStoredIsManual: Story = {
  args: { stageId: 'narrative-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Manual mode/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('option', { name: /^Automatic mode/ }),
    ).toHaveAttribute('aria-selected', 'false');
  },
};

/** Choosing the other mode. */
export const ChoosingTheOtherMode: Story = {
  args: { stageId: 'narrative-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('option', { name: /^Automatic mode/ }),
    );

    await expect(
      canvas.getByRole('option', { name: /^Automatic mode/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('option', { name: /^Manual mode/ }),
    ).toHaveAttribute('aria-selected', 'false');
  },
};

/**
 * An interface whose own behaviour the shared sentences do not describe. The
 * narrative stage draws a network that was built elsewhere, so manual mode
 * shows the positions its preset's attribute already holds rather than a bucket
 * of nodes to place — and the card says so instead.
 */
export const AnInterfaceWithItsOwnWording: Story = {
  args: {
    stageId: 'narrative-1',
    children: <LayoutMode wording="narrative" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const manual = await canvas.findByRole('option', { name: /^Manual mode/ });
    await expect(manual).toHaveAccessibleName(/left off the canvas/);
    // The shared sentence is replaced rather than added to: a card promising
    // both a bucket and a stored position promises something no stage does.
    await expect(manual).not.toHaveAccessibleName(/bucket/);
  },
};

/** Held elsewhere: both modes can be read, and neither can be chosen. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Manual mode/ }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('option', { name: /^Automatic mode/ }),
    ).toBeDisabled();
  },
};

/**
 * A stored value that is neither mode, which an imported or hand-edited
 * protocol can hold.
 *
 * This control has no refusal of its own — a switch that is on or off cannot be
 * left unanswered or filled in wrongly — so the one thing that can be wrong
 * here is a value that is not a switch at all. Anything that is not "on" is
 * drawn as manual, and nothing says so; the protocol schema is what refuses it,
 * when the stage is saved.
 */
export const AValueThatIsNeitherMode: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'sociogram-1' });
      const { document } = host.store.read(stage);
      host.store.applyAsCollaborator(stage, {
        ...document,
        behaviours: { automaticLayout: 'yes' },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Manual mode/ }),
    ).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'This stage is not finished, so it was not saved.',
    );
  },
};
