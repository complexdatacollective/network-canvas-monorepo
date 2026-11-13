import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../storybook-support/StoryInterviewShell';

const NAMES = ['Aaliyah Okafor', 'Max Lindqvist', 'Christina Mora'];

const INITIALS_AND_TIES = `function nodeLabelWorker({ node, network }) {
  const initials = node.name.split(' ')
    .map((word) => word.charAt(0))
    .join('');
  return initials + ' (' + network.nodes.length + ')';
}`;

const FAILS_FOR_MAX = `function nodeLabelWorker({ node }) {
  if (node.name.startsWith('Max')) throw new Error('no label for Max');
  return node.name.toUpperCase();
}`;

const payloadWith = (nodeLabelWorker: string) => {
  const si = new SyntheticInterview(1);
  const nodeType = si.addNodeType({ name: 'Person' });
  const nameVar = nodeType.addVariable({ type: 'text', name: 'name' });
  const stage = si.addStage('NameGenerator', {
    label: 'Name Generator',
    subject: { entity: 'node', type: nodeType.id },
    initialNodes: { count: NAMES.length, promptIndex: 0 },
  });
  NAMES.forEach((name, index) => {
    si.setNodeAttribute(index, nameVar.id, name);
  });
  stage.addFormField({ component: 'Text', prompt: 'What is their name?' });
  stage.addPrompt({ text: 'Who do you turn to for advice?' });

  const payload = si.getInterviewPayload({ currentStep: 0 });
  return SuperJSON.stringify({
    ...payload,
    protocol: { ...payload.protocol, nodeLabelWorker },
  });
};

const meta: Meta = {
  title: 'Systems/NodeLabelWorker',
  parameters: { layout: 'fullscreen' },
};

export default meta;

const renderWith = (nodeLabelWorker: string) => () => (
  <div className="flex h-dvh w-full">
    <StoryInterviewShell
      rawPayload={payloadWith(nodeLabelWorker)}
      isDevelopment={false}
    />
  </div>
);

/** Each node shows the label the protocol's script returns for it. */
export const LabelsFromTheScript: StoryObj = {
  render: renderWith(INITIALS_AND_TIES),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText('AO (3)')).toBeVisible(), {
      timeout: 20_000,
    });
    await expect(canvas.getByText('ML (3)')).toBeVisible();
    await expect(canvas.getByText('CM (3)')).toBeVisible();
  },
};

/** A node the script fails for keeps its standard label; the others do not. */
export const OneNodeFails: StoryObj = {
  render: renderWith(FAILS_FOR_MAX),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(
      () => expect(canvas.getByText('AALIYAH OKAFOR')).toBeVisible(),
      { timeout: 20_000 },
    );
    await expect(canvas.getByText('Max Lindqvist')).toBeVisible();
  },
};
