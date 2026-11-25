import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../storybook-support/StoryInterviewShell';

/**
 * An interview with every interface that makes a sound, for listening to
 * them. A browser plays no sound until the page has been interacted with, so
 * the first press of anything is silent.
 */
function buildInterview() {
  const interview = new SyntheticInterview(7);
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({ type: 'text', name: 'Name' });
  const layout = person.addVariable({ type: 'layout', name: 'Layout' });
  const close = person.addVariable({ type: 'boolean', name: 'Close' });
  const friendship = interview.addEdgeType({ name: 'Friendship' });
  const category = person.addVariable({
    type: 'categorical',
    name: 'Category',
    options: ['Family', 'Friend', 'Colleague'].map((label, index) => ({
      label,
      value: index + 1,
    })),
  });
  const otherCategory = person.addVariable({
    type: 'text',
    name: 'Other Category',
    component: 'Text',
    validation: { required: true },
  });
  const closeness = person.addVariable({
    type: 'ordinal',
    name: 'Closeness',
    options: ['Distant', 'Close', 'Very close'].map((label, index) => ({
      label,
      value: index + 1,
    })),
  });

  interview.addInformationStage({
    title: 'Interaction sounds',
    text: 'Press Next to begin. The first press only lets the page play sound, so it is silent.',
  });

  const nameGenerator = interview.addStage('NameGeneratorQuickAdd', {
    label: 'Add people',
    subject: { entity: 'node', type: person.id },
    quickAdd: name.id,
    initialNodes: { count: 3, promptIndex: 0 },
  });
  nameGenerator.addPrompt({
    text: 'Add people, and drag them to the bin to remove them.',
  });

  const sociogram = interview.addStage('Sociogram', {
    label: 'Connect people',
    subject: { entity: 'node', type: person.id },
  });
  sociogram.addPrompt({
    text: 'Tap a person, then another, to connect or disconnect them. A sound loops while the first waits.',
    layout: { layoutVariable: layout.id },
    edges: { create: friendship.id, display: [friendship.id] },
  });
  sociogram.addPrompt({
    text: 'Tap the people you are close to.',
    layout: { layoutVariable: layout.id },
    edges: { display: [friendship.id] },
    highlight: { variable: close.id },
  });

  const census = interview.addStage('OneToManyDyadCensus', {
    label: 'Choose connections',
    subject: { entity: 'node', type: person.id },
    behaviours: { removeAfterConsideration: false },
  });
  census.addPrompt({
    text: 'Tap the people this person knows, and tap again to undo.',
    createEdge: friendship.id,
  });

  const categoricalBin = interview.addStage('CategoricalBin', {
    label: 'Sort people',
    subject: { entity: 'node', type: person.id },
  });
  categoricalBin.addPrompt({
    variable: category.id,
    text: 'Drag each person to a category. Leave the Other answer empty and save to hear the error sound.',
    otherVariable: otherCategory.id,
    otherVariablePrompt: 'Which category?',
    otherOptionLabel: 'Other',
  });

  const ordinalBin = interview.addStage('OrdinalBin', {
    label: 'Rate people',
    subject: { entity: 'node', type: person.id },
  });
  ordinalBin.addPrompt({
    variable: closeness.id,
    text: 'How close is each person to you?',
  });

  interview.addFinishSessionStage();

  for (let index = 0; index < 3; index += 1) {
    interview.unsetNodeAttribute(index, category.id);
    interview.unsetNodeAttribute(index, closeness.id);
    interview.unsetNodeAttribute(index, close.id);
  }

  return interview;
}

function InteractionSoundsStory({
  interactionSounds,
}: {
  interactionSounds: boolean;
}) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview().getInterviewPayload({ currentStep: 0 }),
      ),
    [],
  );
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        allowStageNavigation
        interactionSounds={interactionSounds}
      />
    </div>
  );
}

const meta: Meta<typeof InteractionSoundsStory> = {
  title: 'Examples/Interaction Sounds',
  component: InteractionSoundsStory,
  parameters: { layout: 'fullscreen' },
  args: { interactionSounds: true },
  argTypes: {
    interactionSounds: {
      control: 'boolean',
      description:
        'Turns the sounds on or off while the interview is running, as a host setting would.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof InteractionSoundsStory>;

export const Listen: Story = {};
