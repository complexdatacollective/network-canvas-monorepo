import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { binBehavioursMessages } from '../sections/bin-behaviours/binBehavioursMessages.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import InteractionModeField from './InteractionModeField.tsx';

/** Where both bin interfaces keep this decision. */
const INTERACTION_MODE_FIELD = 'behaviours.interactionMode';

/** The control as `BinBehavioursSection` mounts it: the section names it. */
function InteractionMode() {
  const intl = useAppIntl();
  return (
    <Field<typeof InteractionModeField>
      name={INTERACTION_MODE_FIELD}
      component={InteractionModeField}
      label={intl.formatMessage(binBehavioursMessages.interactionModeLabel)}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Interaction mode',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'How the participant places nodes on an Ordinal or Categorical Bin stage: by dragging each one onto its bin, or by tapping the bin for one node at a time. Nothing stored is drag and drop, which is what every bin stage did before the choice existed.',
      },
    },
  },
  args: {
    stageId: 'ordinal-bin-1',
    sectionTitle: 'Placing nodes',
    children: <InteractionMode />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A stage that stores nothing here, which is every stage migrated from an
 * earlier schema. It is drawn as drag and drop rather than as nothing chosen.
 */
export const NothingStoredIsDragAndDrop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor is drawn a
    // turn after the story mounts.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Drag and drop/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('option', { name: /^Tap to place/ }),
    ).toHaveAttribute('aria-selected', 'false');
  },
};

/** Choosing tap to place, on the other bin interface. */
export const ChoosingTapToPlace: Story = {
  args: { stageId: 'categorical-bin-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('option', { name: /^Tap to place/ }),
    );

    await expect(
      canvas.getByRole('option', { name: /^Tap to place/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('option', { name: /^Drag and drop/ }),
    ).toHaveAttribute('aria-selected', 'false');
  },
};

/** A stage that already stores tap to place. */
export const TapToPlaceStored: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'ordinal-bin-1' });
      const { document } = host.store.read(stage);
      host.store.applyAsCollaborator(stage, {
        ...document,
        behaviours: { interactionMode: 'select' },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Tap to place/ }),
    ).toHaveAttribute('aria-selected', 'true');
  },
};

/** Held elsewhere: both modes can be read, and neither can be chosen. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Drag and drop/ }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('option', { name: /^Tap to place/ }),
    ).toBeDisabled();
  },
};
