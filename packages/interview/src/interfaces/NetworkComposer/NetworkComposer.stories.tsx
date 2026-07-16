import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../../.storybook/StoryInterviewShell';

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
    nodeForm: { fields: [{ component: 'Number', label: 'Age' }] },
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
    form: { fields: [{ component: 'Toggle', label: 'Reciprocated?' }] },
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

const buildManyAttributes = () => {
  const { si, quickAddVar, layoutVar, friendship } = createComposerInterview(7);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  // A long, varied node form so selecting a node overflows the drawer and the
  // attribute list scrolls.
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 3 },
    nodeForm: {
      fields: [
        { component: 'Text', label: 'Full name' },
        { component: 'Text', label: 'Nickname' },
        { component: 'Number', label: 'Age' },
        { component: 'Text', label: 'Occupation' },
        { component: 'Text', label: 'Where they live' },
        { component: 'RadioGroup', label: 'How close are you?' },
        { component: 'Boolean', label: 'Do you live together?' },
        { component: 'Toggle', label: 'Seen in the last month?' },
        { component: 'LikertScale', label: 'How often do you talk?' },
        { component: 'CheckboxGroup', label: 'How do you keep in touch?' },
        { component: 'Number', label: 'Years known' },
        { component: 'TextArea', label: 'How did you meet?' },
        { component: 'Text', label: 'Phone number' },
        { component: 'TextArea', label: 'Anything else to note?' },
      ],
    },
  });
  stage.addEdgeType({ type: friendship.id });
  si.addEdges([[0, 1]], friendship.id);
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

/**
 * A node form with many fields. Selecting a node opens the attribute drawer with
 * more fields than fit, so the list scrolls within the drawer.
 */
export const ManyAttributes: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildManyAttributes} />,
};

const buildConvexHulls = () => {
  const si = new SyntheticInterview(8);
  const nt = si.addNodeType({ name: 'Person' });
  const quickAddVar = nt.addVariable({ type: 'text', name: 'name' });
  const layoutVar = nt.addVariable({ type: 'layout', name: 'Composer Layout' });
  const community = nt.addVariable({
    type: 'categorical',
    name: 'Community',
    options: [
      { value: 'school', label: 'School' },
      { value: 'work', label: 'Work' },
      { value: 'family', label: 'Family' },
    ],
  });
  const friendship = si.addEdgeType({ name: 'Friendship' });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 8 },
    convexHullVariable: community.id,
  });
  stage.addEdgeType({ type: friendship.id });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

/**
 * Configures `convexHullVariable` with a categorical "Community" variable, so
 * its hulls are always drawn behind the network. Assign groups via the Groups
 * tool (tap nodes to toggle membership) or by lasso-selecting in select mode
 * and choosing a group; membership pulls same-group nodes together under
 * automatic layout.
 */
export const ConvexHulls: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildConvexHulls} />,
};

const buildBackgroundImage = () => {
  const { si, quickAddVar, layoutVar, friendship } = createComposerInterview(9);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const bgAssetId = 'bg-map-1';
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    initialNodes: { count: 6 },
    background: { image: bgAssetId },
  });
  stage.addEdgeType({ type: friendship.id });
  si.addAsset({
    assetId: bgAssetId,
    url: 'https://picsum.photos/seed/network-composer/1200/1200',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

/**
 * Configures `background.image` with a resolvable asset, mirroring the
 * Sociogram's background image support: the image renders behind the canvas
 * in place of the (default) concentric circles.
 */
export const BackgroundImage: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildBackgroundImage} />,
};
