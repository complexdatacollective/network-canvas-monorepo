import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProtocolBuilder } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';

/**
 * Screenshot-capture story for the NetworkComposer interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new ProtocolBuilder(1);
  const nt = si.addNodeType({ name: 'Person' });
  const quickAddVar = nt.addVariable({ type: 'text', name: 'name' });
  const layoutVar = nt.addVariable({
    type: 'layout',
    name: 'ComposerLayout',
  });
  const friendship = si.addEdgeType({ name: 'Friendship' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 6 },
    nodeForm: { fields: [{ component: 'Number', label: 'Age' }] },
    // Capture the interface with the force-directed layout running.
    behaviours: { automaticLayout: true },
  });
  stage.addEdgeType({ type: friendship.id });
  si.addEdges([
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 4],
    [4, 5],
  ]);
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/NetworkComposer',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'NetworkComposer' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
