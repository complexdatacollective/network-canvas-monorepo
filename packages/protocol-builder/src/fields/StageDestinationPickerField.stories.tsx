import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import StageDestinationPickerField from './StageDestinationPickerField.tsx';

/** Where the stage order lives, which is what this picker draws its list from. */
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

const meta = {
  title: 'Protocol Builder/Fields/Stage destination picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Chooses where the interview carries on when a stage is skipped. The list is the protocol’s own stage order, subscribed to here rather than passed in, so a stage added, renamed, moved or deleted elsewhere changes what is offered without the section doing anything. A destination that has become impossible — its stage deleted, or moved to before this one — is reported rather than corrected: where the interview goes is the researcher’s decision, and dropping it silently would change an interview route with nobody being told.',
      },
    },
  },
  args: {
    stageId: 'information-1',
    sectionTitle: 'When this stage is skipped',
    children: (
      <Field<typeof StageDestinationPickerField>
        name="skipLogic.destination"
        component={StageDestinationPickerField}
        label="Where the interview continues"
        hint="Leave this on the next stage unless the interview should jump somewhere else."
      />
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: nothing chosen, so the interview simply carries on. */
export const Unset: Story = {};

/** Choosing a stage further down the interview. */
export const ChoosingAStage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts.
    await awaitPassiveEffects();

    const picker = await canvas.findByRole('combobox', {
      name: 'Where the interview continues',
    });
    await userEvent.selectOptions(picker, 'route:stage:sociogram-1');

    await expect(picker).toHaveValue('route:stage:sociogram-1');
  },
};

/**
 * The stage this one was pointed at is gone. It is reported at the control the
 * researcher has to fix it in, rather than being dropped: an interview route
 * changing on its own is not something to do quietly.
 */
export const ADestinationThatIsGone: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'information-1' });
      const { document } = host.store.read(stage);
      const skipLogic =
        typeof document.skipLogic === 'object' && document.skipLogic !== null
          ? document.skipLogic
          : {};
      host.store.applyAsCollaborator(stage, {
        ...document,
        skipLogic: { ...skipLogic, destination: { stageId: 'no-such-stage' } },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', {
        name: 'Where the interview continues',
      }),
    ).toHaveAttribute('aria-invalid', 'true');
  },
};

/**
 * A protocol whose stage order has been rewritten to two stages. The list is
 * short because the protocol is short — nothing here holds a copy of it.
 */
export const AShortInterview: Story = {
  args: {
    seedEdit: (host) => {
      host.store.applyAsCollaborator(STAGE_ORDER, {
        stages: ['information-1', 'sociogram-1'],
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const picker = await canvas.findByRole('combobox', {
      name: 'Where the interview continues',
    });
    await expect(
      within(picker).getByRole('option', { name: /Sociogram/ }),
    ).toBeInTheDocument();
    await expect(
      within(picker).queryByRole('option', { name: /Geospatial/ }),
    ).toBeNull();
  },
};
