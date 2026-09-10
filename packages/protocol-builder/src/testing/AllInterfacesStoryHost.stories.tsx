import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { INTERFACE_NAMES } from '../interfaces/interfaceNames.ts';
import { AllInterfacesStoryHost } from './AllInterfacesStoryHost.tsx';
import { fixtureStageIds, loadFixtureStage } from './protocolFixture.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Every interface',
  component: AllInterfacesStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Every interface the protocol schema declares, opened one at a time in a single `<ProtocolBuilder>` over the package’s in-memory host. Each stage is reached through the `StageEditor` dispatcher with no registry passed, so what opens is whatever the package’s own registry holds for that interface — and an interface nothing registers throws while the dispatcher renders rather than showing an empty panel. The stages come from the all-interfaces fixture, which holds exactly one per stage type; nothing here is written out.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AllInterfacesStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Open every interface in turn, and check the right editor opened on the right
 * stage each time.
 *
 * Both halves are needed. That an editor appeared says the dispatcher found
 * one; that its stage name holds this stage's own label says it found the
 * right one, over the stage that was asked for rather than over a blank
 * document. Nineteen mounts of the Information editor would satisfy the first
 * on its own.
 */
export const EveryInterface: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const stages = fixtureStageIds().map((stageId) => {
      const { type, fields } = loadFixtureStage(stageId);
      return { stageId, name: INTERFACE_NAMES[type], label: fields.label };
    });

    // Nothing else here can fail if this list is empty, so it is asked first
    // and asked of the fixture rather than of the page.
    await expect(stages.length).toBeGreaterThan(0);

    // Boot on its own: the first editor mounting is the app starting up, and a
    // wait that also covered "did the right stage open" would spend one budget
    // on two questions.
    await canvas.findByRole('navigation', { name: 'Interfaces' });

    for (const { name, label } of stages) {
      await userEvent.click(canvas.getByRole('button', { name }));

      // Scoped to this interface's own region, so a stale editor left on the
      // page by a failed swap cannot answer for the one that was asked for.
      const region = await canvas.findByRole('region', {
        name: `${name} editor`,
      });
      await expect(
        await within(region).findByRole('textbox', { name: 'Stage name' }),
      ).toHaveValue(label);
    }
  },
};
