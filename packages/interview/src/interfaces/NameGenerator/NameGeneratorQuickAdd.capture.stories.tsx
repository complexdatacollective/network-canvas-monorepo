import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the quick-add Name Generator. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nodeType = si.addNodeType({ name: 'Person' });
  const nameVar = nodeType.addVariable({ type: 'text', name: 'Name' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NameGeneratorQuickAdd', {
    label: 'Name Generator',
    subject: { entity: 'node', type: nodeType.id },
    quickAdd: nameVar.id,
    initialNodes: { count: 4, promptIndex: 0 },
  });
  // The seeded generator occasionally produces a node whose label falls back
  // to the variable name; pin presentable names instead.
  ['Aaliyah', 'Max', 'Christina', 'Jamal'].forEach((name, i) => {
    si.setNodeAttribute(i, nameVar.id, name);
  });
  stage.addPrompt({
    text: 'Within the past 6 months, who have you discussed important matters with?',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/NameGeneratorQuickAdd',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'NameGeneratorQuickAdd' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
