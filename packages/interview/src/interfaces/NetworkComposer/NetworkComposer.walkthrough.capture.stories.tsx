import type { Meta, StoryObj } from '@storybook/react-vite';
import { screen, userEvent, within } from 'storybook/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import CaptureStory, {
  type CaptureParameters,
} from '../../storybook-support/CaptureStory';

/**
 * Stills for the Network Composer walkthrough in Architect: the same small
 * network, pictured with and without each setting the walkthrough explains.
 * Generated into @codaco/interface-images' walkthroughManifest.
 */

const PEOPLE = [
  { name: 'Alex', x: 0.3, y: 0.3, community: 'family' },
  { name: 'Bea', x: 0.45, y: 0.22, community: 'family' },
  { name: 'Chen', x: 0.38, y: 0.5, community: 'family' },
  { name: 'Dana', x: 0.65, y: 0.35, community: 'work' },
  { name: 'Eli', x: 0.75, y: 0.55, community: 'work' },
  { name: 'Fran', x: 0.58, y: 0.68, community: 'work' },
] as const;

const CONNECTIONS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
  [2, 5],
  [3, 4],
  [3, 5],
];

type Variant = Readonly<{
  groups?: boolean;
  automaticLayout?: boolean;
  connections?: boolean;
  extraConnectionType?: boolean;
  backgroundImage?: boolean;
}>;

const build =
  ({
    groups = false,
    automaticLayout = false,
    connections = true,
    extraConnectionType = false,
    backgroundImage = false,
  }: Variant = {}) =>
  () => {
    const si = new SyntheticInterview(1);
    const person = si.addNodeType({ name: 'Person' });
    const name = person.addVariable({ type: 'text', name: 'name' });
    const layout = person.addVariable({ type: 'layout', name: 'Layout' });
    const age = person.addVariable({ type: 'number', name: 'age' });
    const closeness = person.addVariable({
      type: 'ordinal',
      name: 'closeness',
      options: [
        { value: 1, label: 'Not close' },
        { value: 2, label: 'Somewhat close' },
        { value: 3, label: 'Very close' },
      ],
    });
    const community = person.addVariable({
      type: 'categorical',
      name: 'Community',
      options: [
        { value: 'family', label: 'Family' },
        { value: 'work', label: 'Work' },
      ],
    });
    const friendship = si.addEdgeType({ name: 'Friendship' });
    const work = si.addEdgeType({ name: 'Works with' });

    if (backgroundImage) {
      si.addAsset({
        assetId: 'social-context-map',
        url: '/storybook/social-context-map.svg',
      });
    }

    si.addInformationStage({ title: 'Welcome', text: 'Before the stage.' });
    const stage = si.addStage('NetworkComposer', {
      quickAdd: name.id,
      layoutVariable: layout.id,
      initialNodes: { count: PEOPLE.length },
      nodeForm: {
        fields: [
          { variable: age.id, component: 'Number', label: 'Age' },
          {
            variable: closeness.id,
            component: 'RadioGroup',
            label: 'How close are you?',
          },
        ],
      },
      ...(groups ? { convexHullVariable: community.id } : {}),
      ...(automaticLayout ? { behaviours: { automaticLayout: true } } : {}),
      ...(backgroundImage
        ? { background: { image: 'social-context-map' } }
        : {}),
    });
    if (connections) {
      stage.addEdgeType({ type: friendship.id });
      if (extraConnectionType) stage.addEdgeType({ type: work.id });
      si.addEdges(CONNECTIONS, friendship.id);
    }

    PEOPLE.forEach((entry, index) => {
      si.setNodeAttribute(index, name.id, entry.name);
      si.setNodeAttribute(index, layout.id, { x: entry.x, y: entry.y });
      si.setNodeAttribute(index, community.id, [entry.community]);
      si.unsetNodeAttribute(index, age.id);
      si.unsetNodeAttribute(index, closeness.id);
    });

    si.addInformationStage({ title: 'Complete', text: 'After the stage.' });
    return si;
  };

const capture = (walkthrough: string): CaptureParameters => ({
  interface: 'NetworkComposer',
  walkthrough,
});

const meta: Meta = {
  title: 'Capture/NetworkComposer walkthrough',
  tags: ['capture'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

const buildCanvas = build();
const buildGroups = build({ groups: true });
const buildAutomaticLayout = build({ automaticLayout: true });
const buildNoConnections = build({ connections: false });
const buildTwoConnectionTypes = build({ extraConnectionType: true });
const buildBackgroundImage = build({ backgroundImage: true });

export const Canvas: Story = {
  parameters: { capture: capture('canvas') },
  render: () => <CaptureStory build={buildCanvas} />,
};

export const Groups: Story = {
  parameters: { capture: capture('groups') },
  render: () => <CaptureStory build={buildGroups} />,
};

export const AutomaticLayout: Story = {
  parameters: { capture: { ...capture('automaticLayout'), delay: 3000 } },
  render: () => <CaptureStory build={buildAutomaticLayout} />,
};

export const NoConnections: Story = {
  parameters: { capture: capture('noConnections') },
  render: () => <CaptureStory build={buildNoConnections} />,
};

export const BackgroundImage: Story = {
  parameters: { capture: capture('backgroundImage') },
  render: () => <CaptureStory build={buildBackgroundImage} />,
};

export const QuickAdd: Story = {
  parameters: { capture: { ...capture('quickAdd'), keepFocus: true } },
  render: () => <CaptureStory build={buildCanvas} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /add node/i }),
    );
    await userEvent.type(
      await screen.findByRole('textbox', { name: /name/i }),
      'Gus',
    );
  },
};

export const NodeForm: Story = {
  parameters: { capture: capture('nodeForm') },
  render: () => <CaptureStory build={buildCanvas} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Chen' }));
    await screen.findByRole('spinbutton', { name: /age/i });
  },
};

export const DrawConnection: Story = {
  parameters: { capture: { ...capture('drawConnection'), keepFocus: true } },
  render: () => <CaptureStory build={buildTwoConnectionTypes} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /draw edge/i }),
    );
    await within(await screen.findByRole('menu')).findByText('Works with');
  },
};
