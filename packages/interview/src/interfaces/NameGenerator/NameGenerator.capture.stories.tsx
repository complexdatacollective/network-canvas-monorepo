import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../../.storybook/CaptureStory';

/**
 * Screenshot-capture story for the form-based Name Generator. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nodeType = si.addNodeType({ name: 'Person' });
  const nameVar = nodeType.addVariable({ type: 'text', name: 'Name' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NameGenerator', {
    label: 'Name Generator',
    subject: { entity: 'node', type: nodeType.id },
    initialNodes: { count: 4, promptIndex: 0 },
  });
  // The seeded generator occasionally produces a node whose label falls back
  // to the variable name; pin presentable names instead.
  ['Aaliyah', 'Max', 'Christina', 'Jamal'].forEach((name, i) => {
    si.setNodeAttribute(i, nameVar.id, name);
  });
  stage.addFormField({ component: 'Text', prompt: 'What is their name?' });
  stage.addFormField({ component: 'Number', prompt: 'How old are they?' });
  stage.addFormField({
    component: 'Text',
    prompt: 'Do they have a nickname?',
  });
  stage.addPrompt({
    text: 'Who do you turn to for advice when something important happens in your life?',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/NameGenerator',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'NameGenerator' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
