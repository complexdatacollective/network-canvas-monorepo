import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

function createComposerInterview(seed: number) {
  const si = new SyntheticInterview(seed);
  const nt = si.addNodeType({ name: 'Person' });
  const quickAddVar = nt.addVariable({ type: 'text', name: 'name' });
  const layoutVar = nt.addVariable({
    type: 'layout',
    name: 'Composer Layout',
  });
  const friendship = si.addEdgeType({ name: 'Friendship' });
  return { si, nt, quickAddVar, layoutVar, friendship };
}

function NetworkComposerStoryWrapper({
  buildFn,
}: {
  buildFn: () => SyntheticInterview;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/NetworkComposer',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

// --- Stories ---

const buildDefault = () => {
  const { si, quickAddVar, layoutVar, friendship } = createComposerInterview(1);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 6 },
    nodeForm: { fields: [{ component: 'Number', prompt: 'Age' }] },
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

export const Default: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildDefault} />,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const el = canvasElement.querySelector<HTMLElement>(
        '[data-testid="network-composer"]',
      );
      expect(el).not.toBeNull();
    });
  },
};

const buildEmptyNetwork = () => {
  const { si, quickAddVar, layoutVar, friendship } = createComposerInterview(2);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
  });
  stage.addEdgeType({ type: friendship.id });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

export const EmptyNetwork: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildEmptyNetwork} />,
};

const buildMultipleEdgeTypes = () => {
  const { si, quickAddVar, layoutVar, friendship } = createComposerInterview(3);
  const advice = si.addEdgeType({ name: 'Advice' });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 6 },
  });
  stage.addEdgeType({ type: friendship.id });
  stage.addEdgeType({
    type: advice.id,
    form: { fields: [{ component: 'Toggle', prompt: 'Reciprocated?' }] },
  });
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    friendship.id,
  );
  si.addEdges(
    [
      [3, 4],
      [4, 5],
    ],
    advice.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

export const MultipleEdgeTypes: Story = {
  render: () => (
    <NetworkComposerStoryWrapper buildFn={buildMultipleEdgeTypes} />
  ),
};

const buildAutomaticLayout = () => {
  const { si, quickAddVar, layoutVar, friendship } = createComposerInterview(4);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 6 },
    behaviours: { automaticLayout: true },
  });
  stage.addEdgeType({ type: friendship.id });
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
    friendship.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

export const AutomaticLayout: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildAutomaticLayout} />,
};
