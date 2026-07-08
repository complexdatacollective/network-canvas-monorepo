import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

import { selectBiologicalSex } from './familyPedigreeWizardHelpers';

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
  const biologicalSexVar = nodeType.addVariable({
    name: 'Biological Sex',
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
      biologicalSexVariable: biologicalSexVar.id,
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
    // boundaries is a mandatory schema field read by the checklist.
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    ...(withIntroScreen && {
      introScreen: {
        items: [
          {
            id: 'intro-text',
            type: 'text' as const,
            content:
              'This pedigree helps us understand your family health history.',
          },
        ],
      },
    }),
  });

  return si;
}

type FixedFramingMode = 'gamete' | 'gendered';

function buildFixedFramingInterview(value: FixedFramingMode) {
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
  const biologicalSexVar = nodeType.addVariable({
    name: 'Biological Sex',
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
      biologicalSexVariable: biologicalSexVar.id,
      form: [],
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: relationshipVar.id,
      isActiveVariable: isActiveVar.id,
      isGestationalCarrierVariable: isGestCarrierVar.id,
    },
    censusPrompt: 'Please create your family pedigree.',
    framing: { mode: 'fixed', value },
    // boundaries is a mandatory schema field read by the checklist.
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
  });

  return si;
}

function buildBoundaryInterview(
  requireGrandparents: 'required' | 'recommended',
) {
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
  const biologicalSexVar = nodeType.addVariable({
    name: 'Biological Sex',
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
      biologicalSexVariable: biologicalSexVar.id,
      form: [],
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: relationshipVar.id,
      isActiveVariable: isActiveVar.id,
      isGestationalCarrierVariable: isGestCarrierVar.id,
    },
    censusPrompt: 'Please create your family pedigree.',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents,
      requireChildrenContributors: 'off',
    },
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
 * Answer the "About you" (EgoSexStep) biological-sex question and continue. This
 * step always appears after any Introduction/FramingSelection steps and before
 * the egg-parent step. The radios are labelled by their option label (from
 * BIOLOGICAL_SEX_OPTIONS; the default here is "Female").
 */
async function selectEgoSex(label = 'Female') {
  const dialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  await selectBiologicalSex(dialog, label);
  await clickContinue();
}

/**
 * Complete the minimal quick-start wizard: fill in egg and sperm parents
 * (minimal required fields), skip other parents, skip partnerships (no
 * partner), and finish.
 *
 * buildBoundaryInterview uses fixed gamete framing with no introScreen, so the
 * wizard opens directly on the "About you" (EgoSexStep) step (no leading
 * IntroStep or FramingSelectionStep), then EggParentStep.
 */
async function completeMinimalQuickStart() {
  await clickGetStarted();

  // About you (EgoSexStep) — biological sex required
  await selectEgoSex();

  // EggParentStep — is-donor required (BooleanField: first radio = true, second = false)
  const eggDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  const eggRadios = within(eggDialog).getAllByRole('radio');
  // "is-donor" false: select second radio in the field
  const isDonorFalse = eggRadios[1];
  if (isDonorFalse) await userEvent.click(isDonorFalse);
  // gestationalCarrier true: select first radio
  // Find the gestational carrier radios after setting is-donor
  const eggDialog2 = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  const allEggRadios = within(eggDialog2).getAllByRole('radio');
  // There are two BooleanFields: is-donor (2 radios) + gestationalCarrier (2 radios)
  // gestationalCarrier first radio = true
  const gestCarrierTrue = allEggRadios[2];
  if (gestCarrierTrue) await userEvent.click(gestCarrierTrue);
  await clickContinue();

  // SpermParentStep — is-donor required (BooleanField: first = true, second = false)
  const spermDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  const spermRadios = within(spermDialog).getAllByRole('radio');
  const spermIsDonorFalse = spermRadios[1];
  if (spermIsDonorFalse) await userEvent.click(spermIsDonorFalse);
  await clickContinue();

  // OtherParentsStep — hasOtherParents: false (second radio)
  const otherDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  const otherRadios = within(otherDialog).getAllByRole('radio');
  const noOtherParents = otherRadios[1];
  if (noOtherParents) await userEvent.click(noOtherParents);
  await clickContinue();

  // ParentPartnershipsStep — no changes needed, continue
  await clickContinue();

  // PartnerAndChildrenStep — hasPartner: false (second radio)
  const partnerDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
  const partnerRadios = within(partnerDialog).getAllByRole('radio');
  const noPartner = partnerRadios[1];
  if (noPartner) await userEvent.click(noPartner);
  // Finish the wizard
  await clickContinue();
}

/**
 * participantChoice framing: the framing-selection step appears before
 * EggParentStep. Choosing "gendered" means the parent steps use "Mother" /
 * "Father" terminology.
 */
export const ParticipantChoiceSelectsGendered: Story = {
  render: () => <FramingStoryWrapper buildFn={() => buildFramingInterview()} />,
  play: async () => {
    await clickGetStarted();

    // Framing selection step: choose the gendered option ("Mother & father").
    // FramingSelectionStep uses a RichSelectGroupField, so each choice is a
    // button[role="option"] whose accessible name is the label + description.
    const dialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    const genderedOption = within(dialog).getByRole('option', {
      name: /mother & father/i,
    });
    await userEvent.click(genderedOption);
    await clickContinue();

    // About you (EgoSexStep) — answer before the parent steps.
    await selectEgoSex();

    // EggParentStep is now open and titled "Mother"; multiple elements may
    // match the text so assert there is at least one.
    const eggDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    expect(within(eggDialog).getAllByText(/mother/i).length).toBeGreaterThan(0);
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

    // IntroStep: the custom intro-screen text is shown.
    await screen.findByText(/family health history/i, {}, STEP_TIMEOUT);
    await clickContinue();

    // Framing selection step: choose the gamete option ("Egg parent & sperm
    // parent"). RichSelectGroupField renders each choice as a
    // button[role="option"] named by its label + description.
    const dialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    const gameteOption = within(dialog).getByRole('option', {
      name: /egg parent & sperm parent/i,
    });
    await userEvent.click(gameteOption);
    await clickContinue();

    // About you (EgoSexStep) — answer before the parent steps.
    await selectEgoSex();

    // EggParentStep is now open; "egg parent" appears in its body copy.
    const eggDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    expect(
      within(eggDialog).getAllByText(/egg parent/i).length,
    ).toBeGreaterThan(0);
  },
};

/**
 * Fixed gamete framing: the framing-selection step is SKIPPED because the
 * mode is 'fixed'. The wizard opens directly on EggParentStep using gamete
 * terminology ("Egg Parent" / "Sperm Parent").
 */
export const FixedGameteQuickStart: Story = {
  render: () => (
    <FramingStoryWrapper buildFn={() => buildFixedFramingInterview('gamete')} />
  ),
  play: async () => {
    await clickGetStarted();

    // The framing-selection step is skipped for fixed framing, so its options
    // never appear — the wizard opens on the "About you" (EgoSexStep) step.
    expect(
      screen.queryByRole('option', { name: /mother & father/i }),
    ).toBeNull();
    await selectEgoSex();

    // EggParentStep is now open; multiple elements may contain "Egg Parent"
    // (title + labels) — assert at least one is present.
    const eggDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    expect(
      within(eggDialog).getAllByText(/egg parent/i).length,
    ).toBeGreaterThan(0);
  },
};

/**
 * Fixed gendered framing: the framing-selection step is SKIPPED because the
 * mode is 'fixed'. The wizard opens directly on EggParentStep using gendered
 * terminology ("Mother" / "Father").
 */
export const FixedGenderedQuickStart: Story = {
  render: () => (
    <FramingStoryWrapper
      buildFn={() => buildFixedFramingInterview('gendered')}
    />
  ),
  play: async () => {
    await clickGetStarted();

    // The framing-selection step is skipped for fixed framing, so its options
    // never appear — the wizard opens on the "About you" (EgoSexStep) step.
    expect(
      screen.queryByRole('option', { name: /egg parent & sperm parent/i }),
    ).toBeNull();
    await selectEgoSex();

    // EggParentStep is now open and titled "Mother"; multiple elements may
    // contain that text (dialog title + labels) — assert at least one.
    const eggDialog = await screen.findByRole('dialog', {}, STEP_TIMEOUT);
    expect(within(eggDialog).getAllByText(/mother/i).length).toBeGreaterThan(0);
  },
};

/**
 * Required grandparents boundary: ego is given two biological parents by the
 * quick-start wizard but those parents have no parents of their own. With
 * `requireGrandparents: 'required'`, the checklist shows a blocking item
 * (marked required with *) and the "Finalize family pedigree" button is absent.
 */
export const RequiredBoundaryGrandparentsBlocked: Story = {
  render: () => (
    <FramingStoryWrapper buildFn={() => buildBoundaryInterview('required')} />
  ),
  play: async () => {
    await completeMinimalQuickStart();

    // After the wizard finishes, the pedigree canvas is shown. The checklist
    // widget should appear once the network has nodes (ego + two parents).
    const checklist = await screen.findByText(
      'Pedigree Checklist',
      {},
      { timeout: 8000 },
    );
    expect(checklist).toBeTruthy();

    // The boundary-grandparents blocker item should be present and required (*)
    const blocker = await screen.findByText(
      /record each parent.s two parents/i,
      {},
      STEP_TIMEOUT,
    );
    expect(blocker).toBeTruthy();

    // The required marker (*) must be visible
    const checklist$El = blocker.closest('[class]')?.parentElement;
    expect(checklist$El?.querySelector('.text-destructive')).not.toBeNull();

    // The finalize button must NOT be shown (allDone is false)
    expect(
      screen.queryByRole('button', { name: /finalize family pedigree/i }),
    ).toBeNull();
  },
};

/**
 * Recommended grandparents boundary: same pedigree shape as
 * RequiredBoundaryGrandparentsBlocked but the boundary is 'recommended'. The
 * checklist shows the grandparents item as a nudge WITHOUT the required (*)
 * marker — the observable, checklist-level difference from the required case.
 *
 * The spec's "recommended never blocks" guarantee is enforced in
 * `validatePedigreeCompleteness` (recommended boundaries contribute no blocking
 * issues, so stage-advance is allowed) and is covered by its unit tests in
 * `utils/__tests__/validatePedigree.test.ts`. It is NOT reflected by the
 * finalize button's visibility: that button is gated on `allDone` (every
 * checklist task done), which a minimal quick-start never reaches because the
 * optional siblings/partner/children/grandparent items remain unchecked. So
 * this story asserts the marker difference, not the button.
 */
export const RecommendedBoundaryGrandparentsNudge: Story = {
  render: () => (
    <FramingStoryWrapper
      buildFn={() => buildBoundaryInterview('recommended')}
    />
  ),
  play: async () => {
    await completeMinimalQuickStart();

    // Wait for checklist
    await screen.findByText('Pedigree Checklist', {}, { timeout: 8000 });

    // The grandparents nudge item should be present
    const nudge = await screen.findByText(
      /record each parent.s two parents/i,
      {},
      STEP_TIMEOUT,
    );
    expect(nudge).toBeTruthy();

    // The nudge item must NOT carry a required (*) marker — this is what
    // distinguishes 'recommended' from 'required' in the checklist.
    const nudgeParent = nudge.closest('[class]')?.parentElement;
    expect(nudgeParent?.querySelector('.text-destructive')).toBeNull();

    // The finalize button is gated on allDone (all tasks checked), not on
    // boundary severity, so it is absent here — same as the required case.
    expect(
      screen.queryByRole('button', { name: /finalize family pedigree/i }),
    ).toBeNull();
  },
};
