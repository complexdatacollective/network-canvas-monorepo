import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import {
  fixtureLayoutId,
  fixtureStageId,
  fixtureTypeId,
} from '../testing/protocolFixture.ts';
import UnreachableLayoutAlert from './UnreachableLayoutAlert.tsx';

const LAYOUT = fixtureLayoutId('layout');
const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');

const TITLE = 'No stage places some nodes in this layout';

const meta = {
  title: 'Protocol Builder/Fields/Unreachable layout alert',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shown under the layout chosen for a stage that only shows positions, such as a Narrative preset, when no stage places nodes of some of its node types in that layout. Those nodes are shown there only if a roster gives them positions. The protocol is still valid, so this is a warning.',
      },
    },
  },
  args: {
    stageId: fixtureStageId('narrative-1'),
    sectionTitle: 'Layout',
    children: (
      <UnreachableLayoutAlert layoutId={LAYOUT} nodeTypes={[FAMILY_MEMBER]} />
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One node type that no stage places in the layout. */
export const OneNodeType: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(TITLE)).toBeVisible();
    await expect(
      canvas.getByText(
        'No stage places family member nodes in the layout “layout”, so they are shown here only if a roster gives them positions in this layout. Add a Sociogram or a Network Composer that places them in this layout, or choose another layout.',
      ),
    ).toBeVisible();
  },
};

/** Several node types, named together in one sentence. */
export const SeveralNodeTypes: Story = {
  args: {
    children: (
      <UnreachableLayoutAlert
        layoutId={LAYOUT}
        nodeTypes={[PERSON, FAMILY_MEMBER]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(TITLE)).toBeVisible();
    await expect(
      canvas.getByText(
        /^No stage places nodes of the types person and family member in the layout “layout”/u,
      ),
    ).toBeVisible();
  },
};

/** Every node type has a position in the layout: nothing is shown. */
export const NothingToReport: Story = {
  args: {
    children: <UnreachableLayoutAlert layoutId={LAYOUT} nodeTypes={[]} />,
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await expect(
      await within(canvasElement).findByRole('heading', { name: 'Layout' }),
    ).toBeVisible();
    await expect(
      within(canvasElement).queryByText(TITLE),
    ).not.toBeInTheDocument();
  },
};
