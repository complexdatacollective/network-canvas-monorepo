import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../../.storybook/StoryInterviewShell';
import {
  clickGetStarted,
  clickNext,
  getDialog,
  selectEgoSex,
  setFieldInput,
  setPartnership,
} from './familyPedigreeWizardHelpers';
import { SuppressPedigreeHintContext } from './pedigreeHintContext';

function createFamilyPedigreeInterview(seed: number) {
  const si = new SyntheticInterview(seed);

  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'diamond' },
  });
  const nameVar = nodeType.addVariable({
    name: 'Name',
    type: 'text',
    component: 'Text',
  });

  const genderVar = nodeType.addVariable({
    id: 'gender_identity',
    name: 'Current Gender Identity',
    type: 'categorical',
    options: [
      { label: 'Man/boy', value: 'man' },
      { label: 'Woman/girl', value: 'woman' },
      { label: 'Non-binary', value: 'non_binary' },
      { label: 'Genderqueer/Gender non-conforming', value: 'genderqueer' },
      { label: 'Two-Spirit', value: 'two_spirit' },
      { label: 'Other', value: 'other' },
      { label: 'Prefer not to say', value: 'prefer_not_to_say' },
      { label: "Don't know", value: 'dont_know' },
    ],
    component: 'RadioGroup',
    validation: { required: true },
  });

  // Dynamic shape mapping based on gender identity
  nodeType.setShape({
    default: 'diamond',
    dynamic: {
      variable: genderVar.id,
      type: 'discrete',
      map: [
        { value: 'man', shape: 'square' },
        { value: 'woman', shape: 'circle' },
        { value: 'non_binary', shape: 'diamond' },
        { value: 'genderqueer', shape: 'diamond' },
        { value: 'two_spirit', shape: 'diamond' },
        { value: 'other', shape: 'diamond' },
        { value: 'prefer_not_to_say', shape: 'diamond' },
      ],
    },
  });
  const diseaseVar = nodeType.addVariable({
    name: 'Has Disease',
    type: 'boolean',
  });
  const diabetesVar = nodeType.addVariable({
    name: 'Has Diabetes',
    type: 'boolean',
  });
  const isEgoVar = nodeType.addVariable({
    name: 'Is Ego',
    type: 'boolean',
  });
  const relationshipToEgoVar = nodeType.addVariable({
    name: 'Relationship to Ego',
    type: 'text',
  });
  const biologicalSexVar = nodeType.addVariable({
    name: 'Biological Sex',
    type: 'text',
  });

  const edgeType = si.addEdgeType({ name: 'Family' });

  // These values are shared with Architect, which creates them automatically.
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

  return {
    si,
    nodeType,
    nameVar,
    genderVar,
    diseaseVar,
    diabetesVar,
    isEgoVar,
    relationshipToEgoVar,
    biologicalSexVar,
    edgeType,
    relationshipVar,
    isActiveVar,
    isGestCarrierVar,
  };
}

function FamilyPedigreeStoryWrapper({
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

  // Scenario stories demonstrate finished pedigrees, so suppress the post-wizard
  // "Building the rest of your pedigree" hint that would otherwise cover them.
  return (
    <SuppressPedigreeHintContext.Provider value={true}>
      <div className="h-screen">
        <StoryInterviewShell rawPayload={rawPayload} />
      </div>
    </SuppressPedigreeHintContext.Provider>
  );
}

// Exported for the capture story, which replays a scenario play function and
// must match its PlayFunctionContext typing.
export type StoryArgs = {
  scaffoldingText: string;
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/FamilyPedigree',
  // buildScenarioInterview is a runtime export consumed by the capture
  // story; keep it out of the story index.
  excludeStories: ['buildScenarioInterview'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    scaffoldingText: {
      control: 'text',
      description: 'Text displayed in the census prompt',
    },
  },
  args: {
    scaffoldingText:
      'Please create your family pedigree by adding family members.',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: ({ scaffoldingText }) => {
    const buildFn = () => {
      const {
        si,
        nodeType,
        nameVar,
        genderVar,
        diseaseVar,
        edgeType,
        relationshipVar,
        isActiveVar,
        isGestCarrierVar,
        isEgoVar,
        relationshipToEgoVar,
        biologicalSexVar,
      } = createFamilyPedigreeInterview(1);

      // A leading information stage keeps the FamilyPedigree at step index 1,
      // which the wrapper navigates to (getInterviewPayload currentStep: 1).
      si.addInformationStage({
        title: 'Welcome',
        text: 'Before the main stage.',
      });

      si.addStage('FamilyPedigree', {
        label: 'Family Pedigree',
        subject: { entity: 'node', type: nodeType.id },
        // The in-wizard intro screen explains what a family pedigree is and how
        // it is built; participantChoice framing lets the participant pick how
        // their parents are referred to (the FramingSelectionStep).
        framing: { mode: 'participantChoice' },
        introScreen: {
          items: [
            {
              id: 'intro-text',
              type: 'text',
              content: [
                'A family pedigree is a simple diagram of your biological relatives — the people you are related to by blood — across a few generations. Building one helps us understand patterns of health and inheritance that can run in a family.',
                '',
                '### How it works',
                '',
                "We'll build the diagram together, one step at a time. You'll start with the parents who conceived you, then add grandparents, any brothers and sisters, and — if you have them — a partner and children. For each person you can share a few details, and you can skip anything you would rather not answer.",
                '',
                '### What you will see',
                '',
                'Each relative appears as a shape, joined to the others by lines that show how everyone is related. Nothing is final while you work — you can go back and change your answers before you finish.',
              ].join('\n'),
            },
          ],
        },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        nodeConfig: {
          type: nodeType.id,
          nodeLabelVariable: nameVar.id,
          egoVariable: isEgoVar.id,
          relationshipVariable: relationshipToEgoVar.id,
          biologicalSexVariable: biologicalSexVar.id,
          form: [
            {
              variable: genderVar.id,
              prompt: 'How does this person identify their gender?',
            },
          ],
        },
        edgeConfig: {
          type: edgeType.id,
          relationshipTypeVariable: relationshipVar.id,
          isActiveVariable: isActiveVar.id,
          isGestationalCarrierVariable: isGestCarrierVar.id,
        },
        censusPrompt: scaffoldingText,
        nominationPrompts: [
          {
            id: '1',
            text: 'Please nominate any family members who have been diagnosed with X',
            variable: diseaseVar.id,
          },
        ],
      });

      si.addInformationStage({
        title: 'Complete',
        text: 'After the main stage.',
      });

      return si;
    };

    return <FamilyPedigreeStoryWrapper buildFn={buildFn} />;
  },
};

// ---------------------------------------------------------------------------
// Helpers for wizard interaction tests
// ---------------------------------------------------------------------------

// Exported for the capture story (FamilyPedigree.capture.stories.tsx), which
// replays a scenario through the real quick-start wizard so the published
// screenshot shows a pedigree built from valid data.
export function buildScenarioInterview({ withNomination = false } = {}) {
  const {
    si,
    nodeType,
    nameVar,
    genderVar,
    diseaseVar,
    diabetesVar,
    edgeType,
    relationshipVar,
    isActiveVar,
    isGestCarrierVar,
    isEgoVar,
    relationshipToEgoVar,
    biologicalSexVar,
  } = createFamilyPedigreeInterview(1);

  si.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    subject: { entity: 'node', type: nodeType.id },
    // framing and boundaries are mandatory FamilyPedigree schema fields
    // (the provider reads framing.mode; the checklist reads
    // boundaries.requireGrandparents).
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: nameVar.id,
      egoVariable: isEgoVar.id,
      relationshipVariable: relationshipToEgoVar.id,
      biologicalSexVariable: biologicalSexVar.id,
      form: [
        {
          variable: genderVar.id,
          prompt: 'How does this person identify their gender?',
        },
      ],
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: relationshipVar.id,
      isActiveVariable: isActiveVar.id,
      isGestationalCarrierVariable: isGestCarrierVar.id,
    },
    censusPrompt: 'Please create your family pedigree.',
    ...(withNomination && {
      nominationPrompts: [
        {
          id: '1',
          text: 'Please nominate any family members who have been diagnosed with breast cancer.',
          variable: diseaseVar.id,
        },
        {
          id: '2',
          text: 'Please nominate any family members who have been diagnosed with type 2 diabetes.',
          variable: diabetesVar.id,
        },
      ],
    }),
  });

  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return si;
}

// ---------------------------------------------------------------------------
// Scenario stories
// ---------------------------------------------------------------------------

type ScenarioStory = StoryObj<StoryArgs>;

const scenarioRender = () => {
  const buildFn = () => buildScenarioInterview();
  return <FamilyPedigreeStoryWrapper buildFn={buildFn} />;
};

export const NuclearFamily: ScenarioStory = {
  tags: ['!test'],
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step
    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.name', 'Robert');
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    await setFieldInput('hasOtherParents', false);
    await clickNext();

    await setPartnership('egg-parent', 'Robert', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', true);
    await setFieldInput('partner.name', 'Sophia');
    await setFieldInput('partner.biologicalSex', 'female');
    await setFieldInput('partner.gender_identity', 'woman');
    await setFieldInput('childrenWithPartnerCount', 2);
    await clickNext();

    // Children details — name and gender, then confirm parentage defaults
    await setFieldInput('childWithPartner[0].name', 'Olivia');
    await setFieldInput('childWithPartner[0].biologicalSex', 'female');
    await setFieldInput('childWithPartner[0].gender_identity', 'woman');
    await setFieldInput('childWithPartner[1].name', 'Liam');
    await setFieldInput('childWithPartner[1].biologicalSex', 'male');
    await setFieldInput('childWithPartner[1].gender_identity', 'man');

    // Both children should show the egg/sperm parent selectors; nuclear-family
    // defaults (You → egg, Sophia → sperm) are already valid, so no changes needed.
    const childrenDialog = await getDialog();
    expect(within(childrenDialog).getAllByText('Egg Parent')).toHaveLength(2);
    expect(within(childrenDialog).getAllByText('Sperm Parent')).toHaveLength(2);

    await clickNext();
  },
};

export const SingleParent: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step: Linda is bio mum
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step: absent father (not a donor)
    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    // Other Parents step
    await setFieldInput('hasOtherParents', false);
    await clickNext();

    // Linda and the absent father are not partners (matrix default)
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

export const SameSexMothers: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step: Linda is egg parent + carried
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step: anonymous sperm donor
    await setFieldInput('sperm-parent.is-donor', true);
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    // OtherParentsStep: Patricia is a social parent
    await setFieldInput('hasOtherParents', true);
    await setFieldInput('otherParentCount', 1);
    await clickNext();

    // AdditionalParentsStep: Patricia
    await setFieldInput('additional-parent[0].role', 'raised-me');
    await setFieldInput('additional-parent[0].name', 'Patricia');
    await setFieldInput('additional-parent[0].gender_identity', 'woman');
    await clickNext();

    // Patricia is Linda's current partner; the donor partners no one
    await setPartnership('egg-parent', 'Patricia', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

export const SpermDonor: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step
    await setFieldInput('sperm-parent.is-donor', true);
    await setFieldInput('sperm-parent.name', 'Carlos');
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    await setFieldInput('hasOtherParents', true);
    await setFieldInput('otherParentCount', 1);
    await clickNext();

    await setFieldInput('additional-parent[0].role', 'raised-me');
    await setFieldInput('additional-parent[0].name', 'Patricia');
    await setFieldInput('additional-parent[0].gender_identity', 'woman');
    await clickNext();

    // Patricia is Linda's current partner; Carlos partners no one
    await setPartnership('egg-parent', 'Patricia', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

export const BlendedFamily: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step: Susan is egg parent + carried
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Susan');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step: Robert is sperm parent
    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.name', 'Robert');
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    // OtherParentsStep: Karen is a step-parent
    await setFieldInput('hasOtherParents', true);
    await setFieldInput('otherParentCount', 1);
    await clickNext();

    // AdditionalParentsStep: Karen
    await setFieldInput('additional-parent[0].role', 'step-parent');
    await setFieldInput('additional-parent[0].name', 'Karen');
    await setFieldInput('additional-parent[0].gender_identity', 'woman');
    await clickNext();

    // Susan and Robert are exes; Robert and Karen are current partners
    await setPartnership('egg-parent', 'Robert', 'ex');
    await setPartnership('sperm-parent', 'Karen', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

export const TransParent: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step: Alex (trans man, assigned female) is egg parent + carried
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Alex');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'man');
    await clickNext();

    // Sperm parent step: anonymous sperm donor
    await setFieldInput('sperm-parent.is-donor', true);
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    // OtherParentsStep: Priya is a social parent
    await setFieldInput('hasOtherParents', true);
    await setFieldInput('otherParentCount', 1);
    await clickNext();

    // AdditionalParentsStep: Priya
    await setFieldInput('additional-parent[0].role', 'raised-me');
    await setFieldInput('additional-parent[0].name', 'Priya');
    await setFieldInput('additional-parent[0].gender_identity', 'woman');
    await clickNext();

    // Priya is Alex's current partner; the donor partners no one
    await setPartnership('egg-parent', 'Priya', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

export const NonBinaryEgo: ScenarioStory = {
  tags: ['!test'],
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Tomoko');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step
    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.name', 'Kenji');
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    await setFieldInput('hasOtherParents', false);
    await clickNext();

    await setPartnership('egg-parent', 'Kenji', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', true);
    await setFieldInput('partner.name', 'Sam');
    await setFieldInput('partner.biologicalSex', 'female');
    await setFieldInput('partner.gender_identity', 'non_binary');
    await setFieldInput('childrenWithPartnerCount', 1);
    await clickNext();

    // Children details — name and gender, then confirm parentage defaults
    await setFieldInput('childWithPartner[0].name', 'Kai');
    await setFieldInput('childWithPartner[0].biologicalSex', 'male');
    await setFieldInput('childWithPartner[0].gender_identity', 'non_binary');

    // Confirm the egg/sperm parent selectors are present; defaults are valid.
    const childDialog = await getDialog();
    expect(within(childDialog).getByText('Egg Parent')).toBeTruthy();
    expect(within(childDialog).getByText('Sperm Parent')).toBeTruthy();

    await clickNext();
  },
};

export const AdoptedIn: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step: unknown bio parent (not a donor, just absent)
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step: unknown bio parent (not a donor, just absent)
    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    // OtherParentsStep: 2 adoptive parents
    await setFieldInput('hasOtherParents', true);
    await setFieldInput('otherParentCount', 2);
    await clickNext();

    // AdditionalParentsStep: James and Barbara
    await setFieldInput('additional-parent[0].role', 'adoptive-parent');
    await setFieldInput('additional-parent[0].name', 'James');
    await setFieldInput('additional-parent[0].gender_identity', 'man');

    await setFieldInput('additional-parent[1].role', 'adoptive-parent');
    await setFieldInput('additional-parent[1].name', 'Barbara');
    await setFieldInput('additional-parent[1].gender_identity', 'woman');
    await clickNext();

    // Unnamed bio parents fall back to role labels in the matrix; the focal
    // person frames the question and named parents use their name.
    const partnershipDialog = await getDialog();

    const eggMatrix = partnershipDialog.querySelector(
      '[data-field-name="partnerships.egg-parent"]',
    );
    if (!eggMatrix) throw new Error('No egg-parent partnership matrix');
    // The label renders markdown, so the bolded role fallback is a separate
    // <strong> node — assert against the matrix's combined text content.
    expect(eggMatrix.textContent).toContain(
      'Please indicate which of these people are partners of your egg parent',
    );
    expect(
      within(eggMatrix as HTMLElement).getByRole('radiogroup', {
        name: 'your sperm parent',
      }),
    ).toBeTruthy();
    expect(
      within(eggMatrix as HTMLElement).getByRole('radiogroup', {
        name: 'James',
      }),
    ).toBeTruthy();

    // James and Barbara (the adoptive parents) are current partners
    await setPartnership('additional-parent-0', 'Barbara', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

export const SingleParentTwoDonors: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step: anonymous egg donor who did NOT carry — Mum
    // (gestational carrier) carried, so the conditional carrier step shows next
    await setFieldInput('egg-parent.is-donor', true);
    await setFieldInput('egg-parent.gestationalCarrier', false);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Gestational carrier step: Mum carried using a donor egg
    await setFieldInput('gestational-carrier.name', 'Mum');
    await setFieldInput('gestational-carrier.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step: anonymous sperm donor
    await setFieldInput('sperm-parent.is-donor', true);
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    // OtherParentsStep: no additional parents (Mum is the gestational carrier)
    await setFieldInput('hasOtherParents', false);
    await clickNext();

    // Two anonymous donors and the carrier are none of them partners
    // (matrix default)
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', false);
    await clickNext();
  },
};

/**
 * A pedigree configured with multiple disease nomination prompts. After the
 * pedigree is built and finalized, the stage advances through each nomination
 * step in turn, where the prompt is shown and family members can be toggled to
 * nominate them.
 */
export const DiseaseNomination: ScenarioStory = {
  args: { scaffoldingText: '' },
  render: () => (
    <FamilyPedigreeStoryWrapper
      buildFn={() => buildScenarioInterview({ withNomination: true })}
    />
  ),
  play: async () => {
    // Build a small pedigree: ego with two named parents.
    await clickGetStarted();
    await selectEgoSex(); // About you (EgoSexStep)

    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.name', 'Robert');
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    await setFieldInput('hasOtherParents', false);
    await clickNext();

    await setPartnership('egg-parent', 'Robert', 'current');
    await clickNext();

    await setFieldInput('hasPartner', false);
    await clickNext();

    // The post-wizard hint is suppressed for scenario stories (see
    // FamilyPedigreeStoryWrapper), so the canvas is interactive immediately.
    // Finalize via the interview's next-stage navigation, which only requires
    // ego to have two parents.
    await userEvent.click(await screen.findByTestId('next-button'));
    const confirmDialog = await getDialog();
    await userEvent.click(
      within(confirmDialog).getByRole('button', { name: 'Finalize' }),
    );

    // First nomination prompt (breast cancer): nominate Linda.
    await screen.findByText(/diagnosed with breast cancer/i);
    await userEvent.click(await screen.findByRole('button', { name: 'Linda' }));
    await screen.findByRole('button', { name: 'Linda', pressed: true });

    // Advance to the second nomination prompt (type 2 diabetes): nominate Robert.
    await userEvent.click(await screen.findByTestId('next-button'));
    await screen.findByText(/diagnosed with type 2 diabetes/i);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Robert' }),
    );
    await screen.findByRole('button', { name: 'Robert', pressed: true });

    // The final nomination prompt advances out of the stage.
    await userEvent.click(await screen.findByTestId('next-button'));
    await screen.findByText('After the main stage.');
  },
};

export const WithPartnerAndChildren: ScenarioStory = {
  tags: ['!test'],
  args: { scaffoldingText: '' },
  render: scenarioRender,
  play: async () => {
    await clickGetStarted();

    // About you (EgoSexStep)
    await selectEgoSex();

    // Egg parent step
    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'woman');
    await clickNext();

    // Sperm parent step
    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.name', 'Robert');
    await setFieldInput('sperm-parent.gender_identity', 'man');
    await clickNext();

    await setFieldInput('hasOtherParents', false);
    await clickNext();

    await setPartnership('egg-parent', 'Robert', 'current');
    await clickNext();

    // Partner and children
    await setFieldInput('hasPartner', true);
    await setFieldInput('partner.name', 'Jennifer');
    await setFieldInput('partner.biologicalSex', 'female');
    await setFieldInput('partner.gender_identity', 'woman');
    await setFieldInput('childrenWithPartnerCount', 2);
    await clickNext();

    // Children details — name and gender, then confirm parentage defaults
    await setFieldInput('childWithPartner[0].name', 'Daniel');
    await setFieldInput('childWithPartner[0].biologicalSex', 'male');
    await setFieldInput('childWithPartner[0].gender_identity', 'man');
    await setFieldInput('childWithPartner[1].name', 'Emma');
    await setFieldInput('childWithPartner[1].biologicalSex', 'female');
    await setFieldInput('childWithPartner[1].gender_identity', 'woman');

    // Both children should show the egg/sperm parent selectors; nuclear-family
    // defaults (You → egg, Jennifer → sperm) are already valid.
    const childrenDialog = await getDialog();
    expect(within(childrenDialog).getAllByText('Egg Parent')).toHaveLength(2);
    expect(within(childrenDialog).getAllByText('Sperm Parent')).toHaveLength(2);

    await clickNext();
  },
};
