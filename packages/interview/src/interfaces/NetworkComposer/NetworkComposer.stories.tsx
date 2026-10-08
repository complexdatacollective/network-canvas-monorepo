import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import type { NavigationOrientation } from '../../Shell';
import EncryptedStoryInterviewShell from '../../storybook-support/EncryptedStoryInterviewShell';
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
    ).toHaveTextContent(/invalid data/);
    await userEvent.click(screen.getByRole('button', { name: 'Keep changes' }));

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
    ).toHaveTextContent(/invalid data/);
    await userEvent.click(screen.getByRole('button', { name: 'Keep changes' }));
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
    await expect(
      await screen.findByText(/enter your passphrase to see and change/i),
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

const buildProtectedNotes = () => {
  const { si, nt, quickAddVar, layoutVar, friendship } =
    createComposerInterview(11);
  const notesVar = nt.addVariable({
    type: 'text',
    name: 'notes',
    component: 'Text',
    encrypted: true,
  });
  const stage = si.addStage('NetworkComposer', {
    quickAdd: quickAddVar.id,
    layoutVariable: layoutVar.id,
    nodeForm: {
      fields: [
        { variable: notesVar.id, component: 'Text', label: 'Notes' },
        { component: 'Number', label: 'Age' },
      ],
    },
  });
  stage.addEdgeType({ type: friendship.id });
  si.addManualNode(stage.id, nt.id, 'alice', {
    [quickAddVar.id]: 'Alice',
    [layoutVar.id]: { x: 0.4, y: 0.4 },
    [notesVar.id]: 'Met at work',
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return { interview: si, encryptedVariableIds: [notesVar.id] };
};

/**
 * The notes are protected, but the record this interview keeps to check a
 * passphrase has been damaged (here, an impossible key-stretching count), so
 * no passphrase can open them. A person's notes are shown as unavailable, with
 * the reason, and cannot be replaced; nothing asks for a passphrase.
 */
export const ProtectedNotesRefused: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildProtectedNotes}
      passphrase="storybook passphrase"
      currentStep={0}
      headerIterations={1_000_000_000}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Alice' }, { timeout: 10_000 }),
    );

    const notes = await screen.findByRole('textbox', { name: /notes/i });
    await expect(notes).toHaveValue('Answer unavailable');
    await expect(notes).toHaveAttribute('readonly');
    await expect(notes).toHaveAccessibleDescription(
      /cannot be shown or saved in this interview/,
    );
    await expect(
      screen.queryByRole('button', { name: 'Enter a new answer' }),
    ).not.toBeInTheDocument();
    await expect(
      screen.queryByRole('button', { name: 'Enter your passphrase' }),
    ).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Keep changes' }));
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
