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

/** The control as `NodeLayoutSection` mounts it: the section names it. */
function LayoutMode() {
  const intl = useAppIntl();
  return (
    <Field<typeof LayoutModeField>
      name={AUTOMATIC_LAYOUT_FIELD}
      component={LayoutModeField}
      label={intl.formatMessage(canvasBehavioursMessages.layoutModeLabel)}
      hint={intl.formatMessage(canvasBehavioursMessages.layoutModeHint)}
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
          'How a canvas stage arranges nodes when it opens. The protocol stores one switch, and the researcher is asked it as a choice between two named modes: “automatic layout is off” is not a decision anybody recognises making, while “manual mode” is — and each card can then say what the participant will actually see. Nothing stored is manual mode: opting a protocol into a force simulation nobody asked for would change what its participants see.',
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

    // Named by the section that answers for it: the refusal is read out above
    // the form, whether or not the host draws a list of the sections.
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Node layout: Layout mode holds the wrong kind of value.',
    );
  },
};
