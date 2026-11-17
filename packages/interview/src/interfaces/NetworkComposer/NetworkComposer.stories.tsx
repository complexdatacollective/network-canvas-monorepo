import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import {
  expect,
  fireEvent,
  screen,
  spyOn,
  userEvent,
  waitFor,
  within,
} from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import type { NavigationOrientation } from '../../Shell';
import { exitOffsetOf } from '../../storybook-support/drawerExit';
import { choosePassphraseInPrompter } from '../../storybook-support/passphraseSteps';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

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
  navigationOrientation,
}: {
  buildFn: () => SyntheticInterview;
  navigationOrientation?: NavigationOrientation;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        navigationOrientation={navigationOrientation}
      />
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
      { value: 'partner-family', label: "My partner's family" },
      { value: 'friends', label: 'Friends' },
      { value: 'neighborhood', label: 'Neighborhood' },
      { value: 'community', label: 'Community or faith group' },
      { value: 'professionals', label: 'Services and professionals' },
      { value: 'online', label: 'Online' },
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

const validatedAgeInterview = (
  people: { id: string; name: string; position: { x: number; y: number } }[],
) => {
  const { si, nt, quickAddVar, layoutVar, friendship } =
    createComposerInterview(12);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    nodeForm: {
      fields: [
        {
          component: 'Number',
          label: 'Age',
          validation: { minValue: 1, maxValue: 120 },
        },
      ],
    },
  });
  stage.addEdgeType({ type: friendship.id });
  for (const { id, name, position } of people) {
    si.addManualNode(stage.id, nt.id, id, {
      [quickAddVar.id]: name,
      [layoutVar.id]: position,
    });
  }
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const alice = { id: 'alice', name: 'Alice', position: { x: 0.4, y: 0.4 } };

const buildValidatedAge = () => validatedAgeInterview([alice]);

const buildValidatedAges = () =>
  validatedAgeInterview([
    alice,
    { id: 'bob', name: 'Bob', position: { x: 0.65, y: 0.6 } },
  ]);

/**
 * Leaving the stage with an edit in the drawer saves it, even one made too
 * recently for the autosave. An edit that cannot be saved, such as an age
 * outside its limits, is not dropped without a word: the participant is asked
 * whether to discard it, and keeping it stays on the stage.
 */
export const LeavingWithAnInvalidEdit: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildValidatedAge} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Alice' }, { timeout: 10_000 }),
    );

    const age = await screen.findByRole('spinbutton', { name: /age/i });
    await userEvent.clear(age);
    await userEvent.type(age, '500');
    await userEvent.click(canvas.getByTestId('next-button'));

    await expect(
      await screen.findByRole('dialog', { name: 'Discard changes?' }),
    ).toHaveTextContent(/Do you want to discard your changes\?/);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(
      await screen.findByRole('spinbutton', { name: /age/i }),
    ).toHaveValue(500);
    await expect(canvas.queryByText('After the main stage.')).toBeNull();
  },
};

/**
 * Moving off a person never drops an edit in the drawer. Closing the drawer,
 * or tapping someone else, first saves the edit, even one made too recently
 * for the autosave. An edit that cannot be saved, such as an age outside its
 * limits, is not dropped without a word: the participant is asked whether to
 * discard it, and keeping it keeps the drawer open on it.
 */
export const UnsavedEditInDrawer: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildValidatedAges} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const discardDialog = { name: 'Discard changes?' };
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Alice' }, { timeout: 10_000 }),
    );

    const age = await screen.findByRole('spinbutton', { name: /age/i });
    await userEvent.clear(age);
    await userEvent.type(age, '500');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await expect(
      await screen.findByRole('dialog', discardDialog),
    ).toHaveTextContent(/Do you want to discard your changes\?/);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', discardDialog)).toBeNull(),
    );
    await expect(screen.getByRole('spinbutton', { name: /age/i })).toHaveValue(
      500,
    );

    await userEvent.clear(screen.getByRole('spinbutton', { name: /age/i }));
    await userEvent.type(
      screen.getByRole('spinbutton', { name: /age/i }),
      '34',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Bob' }));
    await expect(screen.queryByRole('dialog', discardDialog)).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Alice' }));
    await waitFor(() =>
      expect(screen.getByRole('spinbutton', { name: /age/i })).toHaveValue(34),
    );
  },
};

/**
 * In a right-to-left interview the drawer is on the left, the end edge, with
 * its resize handle on the edge that faces the canvas. Widening it is a drag
 * or an arrow key towards the canvas, which is now to the right.
 */
export const DrawerInARightToLeftInterview: Story = {
  globals: { appDirection: 'rtl' },
  render: () => <NetworkComposerStoryWrapper buildFn={buildValidatedAges} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Alice' }, { timeout: 10_000 }),
    );

    const handle = await screen.findByRole('separator', {
      name: 'Resize panel',
    });
    // Assert the direction landed, so a story that lost it fails here rather
    // than passing on a left-to-right layout.
    await expect(getComputedStyle(handle).direction).toBe('rtl');

    const panel = handle.parentElement!;
    // Once it has slid in, the drawer sits against the left of the window.
    await waitFor(() =>
      expect(Math.abs(panel.getBoundingClientRect().left)).toBeLessThan(1),
    );
    await expect(
      Math.abs(
        handle.getBoundingClientRect().right -
          panel.getBoundingClientRect().right,
      ),
    ).toBeLessThan(1);

    const width = () => Number(handle.getAttribute('aria-valuenow'));
    const initial = width();

    handle.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(width()).toBeGreaterThan(initial);
    await userEvent.keyboard('{ArrowLeft}');
    await expect(width()).toBe(initial);

    // The handle captures the pointer on press, which Firefox refuses for a
    // pointer no device produced.
    const setCapture = spyOn(
      window.HTMLElement.prototype,
      'setPointerCapture',
    ).mockImplementation(() => {});
    const releaseCapture = spyOn(
      window.HTMLElement.prototype,
      'releasePointerCapture',
    ).mockImplementation(() => {});
    try {
      const { right, top } = handle.getBoundingClientRect();
      const pointer = { pointerId: 1, pointerType: 'mouse', button: 0 };
      await fireEvent.pointerDown(handle, {
        ...pointer,
        buttons: 1,
        clientX: right,
        clientY: top + 20,
      });
      await fireEvent.pointerMove(handle, {
        ...pointer,
        buttons: 1,
        clientX: right + 40,
        clientY: top + 20,
      });
      await fireEvent.pointerUp(handle, pointer);
    } finally {
      setCapture.mockRestore();
      releaseCapture.mockRestore();
    }
    await expect(width()).toBe(initial + 40);

    // It leaves the way it came: off the left of the window, and at a swipe
    // towards that edge.
    await expect(exitOffsetOf(panel)).toBeLessThan(0);
    await expect(panel).toHaveAttribute('data-swipe-direction', 'left');
  },
};

const buildEncryptedNames = () => {
  const si = new SyntheticInterview(10);
  const nt = si.addNodeType({ name: 'Person' });
  const quickAddVar = nt.addVariable({
    type: 'text',
    name: 'name',
    encrypted: true,
  });
  const layoutVar = nt.addVariable({ type: 'layout', name: 'Composer Layout' });
  const friendship = si.addEdgeType({ name: 'Friendship' });
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
  });
  stage.addEdgeType({ type: friendship.id });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

/**
 * The quick-add name variable is marked encrypted. Adding a person waits for
 * a passphrase, chosen and confirmed from the key button in the navigation;
 * names are then stored encrypted and shown decrypted.
 */
export const EncryptedNames: Story = {
  render: () => (
    <NetworkComposerStoryWrapper
      buildFn={buildEncryptedNames}
      navigationOrientation="vertical"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addNode = await canvas.findByRole('button', { name: /add node/i });

    await userEvent.click(addNode);
    // The key button's hidden description says the same, so only the notice
    // that appears on the screen is looked for.
    await expect(
      await screen.findByText(/enter your passphrase to see and change/i, {
        ignore: '[hidden], script, style',
      }),
    ).toBeInTheDocument();
    await expect(
      screen.queryByRole('textbox', { name: /name/i }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await choosePassphraseInPrompter('storybook passphrase');

    await userEvent.click(addNode);
    const nameInput = await screen.findByRole('textbox', { name: /name/i });
    await userEvent.type(nameInput, 'Alex{Enter}');
    await userEvent.keyboard('{Escape}');

    await expect(
      await canvas.findByRole('button', { name: /alex/i }),
    ).toBeInTheDocument();
  },
};

const buildUndoInDrawer = () => {
  const { si, quickAddVar, layoutVar } = createComposerInterview(12);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    nodeForm: { fields: [{ component: 'Number', label: 'Age' }] },
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

/**
 * Undo and redo with the drawer open. An answer the participant has not
 * changed since it was saved follows the undo. An edit not saved yet when an
 * undo changes its answer stays on screen but is not saved over the undo:
 * closing the drawer asks before discarding it, and changing the answer again
 * saves it.
 */
export const UndoInDrawer: Story = {
  render: () => <NetworkComposerStoryWrapper buildFn={buildUndoInDrawer} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const openAlex = async () => {
      await userEvent.click(
        await canvas.findByRole('button', { name: /alex/i }),
      );
      return screen.findByLabelText(/age/i);
    };
    const closeDrawer = () =>
      userEvent.click(screen.getByRole('button', { name: 'Close' }));
    const overtaken = /undo or redo changed an answer/i;

    await userEvent.click(
      await canvas.findByRole('button', { name: /add node/i }),
    );
    await userEvent.type(
      await screen.findByRole('textbox', { name: /name/i }),
      'Alex{Enter}',
    );
    await userEvent.keyboard('{Escape}');

    // Closing the drawer saves the age before the undo.
    await userEvent.type(await openAlex(), '30');
    await closeDrawer();
    const age = await openAlex();
    await expect(age).toHaveValue(30);

    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(age).toHaveValue(null));
    await userEvent.click(canvas.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(age).toHaveValue(30));

    // An undo pressed before the new age is saved overtakes it.
    await userEvent.clear(age);
    await userEvent.type(age, '31');
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await closeDrawer();
    await expect(await screen.findByText(overtaken)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByText(overtaken)).not.toBeInTheDocument(),
    );
    await expect(age).toHaveValue(31);

    // Changing the answer again saves it.
    await userEvent.clear(age);
    await userEvent.type(age, '32');
    await closeDrawer();
    await waitFor(() =>
      expect(screen.queryByLabelText(/age/i)).not.toBeInTheDocument(),
    );
    await expect(await openAlex()).toHaveValue(32);
  },
};
