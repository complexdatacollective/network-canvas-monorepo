import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the Narrative interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });
  const layoutVar = nt.addVariable({
    type: 'layout',
    name: 'Narrative Layout',
  });
  const closeVar = nt.addVariable({ type: 'boolean', name: 'Close Friend' });
  const communityVar = nt.addVariable({
    type: 'categorical',
    name: 'Community',
    options: [
      { label: 'Family', value: 'family' },
      { label: 'Work', value: 'work' },
      { label: 'School', value: 'school' },
    ],
  });
  const friendshipEt = si.addEdgeType({ name: 'Friendship' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', { initialNodes: { count: 8 } }).addPreset({
    label: 'Social Network',
    layoutVariable: layoutVar.id,
    edges: { display: [friendshipEt.id] },
    groupVariable: communityVar.id,
    highlight: [closeVar.id],
  });
  const closeValues = [true, false, true, null, true, false, true, false];
  closeValues.forEach((v, i) => {
    si.setNodeAttribute(i, closeVar.id, v);
  });
  const groupValues: (string | string[])[] = [
    'family',
    'family',
    'family',
    'work',
    'work',
    'work',
    'school',
    ['family', 'school'],
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addEdges(
    [
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 4],
      [3, 4],
      [4, 5],
      [6, 7],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/Narrative',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'Narrative' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
