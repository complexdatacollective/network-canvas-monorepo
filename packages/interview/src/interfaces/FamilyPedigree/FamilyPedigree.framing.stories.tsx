import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

function buildFramingInterview({
  withIntroScreen = false,
}: {
  withIntroScreen?: boolean;
} = {}) {
  const si = new SyntheticInterview(42);

  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'diamond' },
  });
  const nameVar = nodeType.addVariable({
    name: 'Name',
    type: 'text',
    component: 'Text',
  });
  const isEgoVar = nodeType.addVariable({ name: 'Is Ego', type: 'boolean' });
  const relationshipToEgoVar = nodeType.addVariable({
    name: 'Relationship to Ego',
    type: 'text',
  });
  const edgeType = si.addEdgeType({ name: 'Family' });
  const relationshipVar = edgeType.addVariable({
    name: 'Relationship',
    type: 'categorical',
    options: [
      { label: 'Parent', value: 'parent' },
      { label: 'Child', value: 'child' },
      { label: 'Sibling', value: 'sibling' },
      { label: 'Partner', value: 'partner' },
    ],
  });
  const isActiveVar = edgeType.addVariable({
    name: 'Is Active',
    type: 'boolean',
  });
  const isGestCarrierVar = edgeType.addVariable({
    name: 'Is Gestational Carrier',
    type: 'boolean',
  });

  si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    subject: { entity: 'node', type: nodeType.id },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: nameVar.id,
      egoVariable: isEgoVar.id,
      relationshipVariable: relationshipToEgoVar.id,
      form: [],
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: relationshipVar.id,
      isActiveVariable: isActiveVar.id,
      isGestationalCarrierVariable: isGestCarrierVar.id,
    },
    censusPrompt: 'Please create your family pedigree.',
    framing: { mode: 'participantChoice' },
    ...(withIntroScreen && {
      introScreen: {
        title: 'Before we begin',
        text: 'This pedigree helps us understand your family health history.',
      },
    }),
  });

  return si;
}

function FramingStoryWrapper({
  buildFn,
}: {
  buildFn: () => SyntheticInterview;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 0 })),
    [interview],
  );

  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/FamilyPedigree/Framing',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

const STEP_TIMEOUT = { timeout: 5000 };

async function clickGetStarted() {
  const btn = await screen.findByRole('button', {
    name: 'Build family pedigree',
  });
  await userEvent.click(btn);
  await screen.findByRole('dialog', {});
}

async function clickContinue() {
  const dialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  const buttons = within(dialog).getAllByRole('button');
  const continueBtn = buttons.find(
    (b) => b.textContent === 'Finish' || b.textContent === 'Continue',
  );
  if (!continueBtn) throw new Error('No Finish or Continue button found');
  await userEvent.click(continueBtn);
}

/**
 * participantChoice framing: the framing-selection step appears before the bio
 * parents intro. Choosing "gendered" means the next bio-parent step uses
 * "Mother" / "Father" terminology.
 */
export const ParticipantChoiceSelectsGendered: Story = {
  render: () => <FramingStoryWrapper buildFn={() => buildFramingInterview()} />,
  play: async () => {
    await clickGetStarted();

    // Framing selection step: choose "Gendered"
    const dialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    const genderedOption = within(dialog).getByRole('radio', {
      name: /gendered/i,
    });
    await userEvent.click(genderedOption);
    await clickContinue();

    // BioParentsIntroStep: now uses gendered terms
    await screen.findByText(/mother/i, {}, STEP_TIMEOUT);
    await clickContinue();

    // EggParentStep title should read "Mother"
    const eggDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    expect(within(eggDialog).getByText(/mother/i)).toBeTruthy();
  },
};

/**
 * participantChoice with an introScreen: the intro step appears first, then
 * the framing-selection step.
 */
export const WithIntroScreenThenFramingSelection: Story = {
  render: () => (
    <FramingStoryWrapper
      buildFn={() => buildFramingInterview({ withIntroScreen: true })}
    />
  ),
  play: async () => {
    await clickGetStarted();

    // IntroStep: custom title and text are shown
    await screen.findByText('Before we begin', {}, STEP_TIMEOUT);
    await screen.findByText(/family health history/i, {}, STEP_TIMEOUT);
    await clickContinue();

    // Framing selection step: choose "Gamete-based"
    const dialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    const gameteOption = within(dialog).getByRole('radio', {
      name: /gamete.based/i,
    });
    await userEvent.click(gameteOption);
    await clickContinue();

    // BioParentsIntroStep: gamete terms
    await screen.findByText(/egg parent/i, {}, STEP_TIMEOUT);
  },
};
