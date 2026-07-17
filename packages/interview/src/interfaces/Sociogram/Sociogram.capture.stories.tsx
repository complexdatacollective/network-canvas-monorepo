import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../../.storybook/CaptureStory';

/**
 * Screenshot-capture story for the Sociogram interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });
  const layoutVar = nt.addVariable({
    type: 'layout',
    name: 'Sociogram Layout',
  });
  const et = si.addEdgeType({ name: 'Friendship' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Sociogram', { initialNodes: { count: 9 } });
  stage.addPrompt({
    text: 'Please connect any two people who know each other.',
    layout: { layoutVariable: layoutVar.id },
    edges: { create: et.id, display: [et.id] },
  });

  // Hand-placed positions: two friendship clusters set on a balanced diagonal
  // and joined through a single broker (8), with triadic closure inside each
  // cluster. A deterministic, natural-looking social network for the published
  // screenshot (the layout is authored here rather than simulated so the
  // capture is stable across ratios).
  const positions = [
    { x: 0.22, y: 0.3 }, // 0
    { x: 0.34, y: 0.44 }, // 1 — cluster-A hub
    { x: 0.2, y: 0.52 }, // 2
    { x: 0.36, y: 0.24 }, // 3
    { x: 0.64, y: 0.56 }, // 4 — cluster-B hub
    { x: 0.78, y: 0.44 }, // 5
    { x: 0.7, y: 0.72 }, // 6
    { x: 0.86, y: 0.58 }, // 7
    { x: 0.5, y: 0.5 }, // 8 — broker bridging the two clusters
  ];
  positions.forEach((position, index) => {
    si.setNodeAttribute(index, layoutVar.id, position);
  });

  si.addEdges(
    [
      // Cluster A (left)
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 3],
      // Cluster B (right)
      [4, 5],
      [4, 6],
      [5, 6],
      [5, 7],
      [6, 7],
      // Broker bridging the clusters
      [1, 8],
      [4, 8],
    ],
    et.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/Sociogram',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'Sociogram' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
