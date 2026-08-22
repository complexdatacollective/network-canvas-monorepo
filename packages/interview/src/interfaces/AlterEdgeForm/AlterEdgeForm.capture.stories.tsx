import type { Meta, StoryObj } from '@storybook/react-vite';

import { ProtocolBuilder } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';

/**
 * Screenshot-capture story for the AlterEdgeForm interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new ProtocolBuilder(1);
  const nt = si.addNodeType({ name: 'Person' });
  const et = si.addEdgeType({ name: 'Friendship' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  // NameGenerator creates the nodes that the edges connect, so the
  // AlterEdgeForm stage lands at currentStep 2. A name generator must carry at
  // least one prompt and a form, so give it the minimum a real one would have.
  const nameGenerator = si.addStage('NameGenerator', {
    label: 'Name Generator',
    initialNodes: { count: 4 },
    subject: { entity: 'node', type: nt.id },
  });
  nameGenerator.addPrompt({
    text: 'Who are the people you spend time with?',
  });
  nameGenerator.addFormField({
    component: 'Text',
    prompt: 'What is their name?',
  });
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    et.id,
  );
  const stage = si.addStage('AlterEdgeForm', {
    label: 'Relationship Details',
    subject: { entity: 'edge', type: et.id },
    introductionPanel: {
      title: 'Relationship Details',
      text: 'Please answer the following questions about each relationship in your network.',
    },
  });
  stage.addFormField({
    component: 'RadioGroup',
    prompt: 'How close is this relationship?',
  });
  stage.addFormField({
    component: 'TextArea',
    prompt: 'Describe this relationship.',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/AlterEdgeForm',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    // advance: move past the introduction slide so the per-entity form
    // is pictured (showNavigation keeps the Next button available; the
    // runner removes the navigation before screenshotting).
    capture: {
      interface: 'AlterEdgeForm',
      advance: 1,
    } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} currentStep={2} showNavigation />,
};
