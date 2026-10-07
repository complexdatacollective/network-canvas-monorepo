import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

// ---------------------------------------------------------------------------
// The Colored Eco-Genetic Relationship Map (CEGRM; Kenen & Peters, J Genet
// Couns 2001) implemented in Network Canvas. The CEGRM overlays, on a cancer
// pedigree extended with non-blood ("fictive") and in-law ("affinal") kin, three
// ego↔member resource exchanges — information, practical support and feelings —
// plus a disseminator/barrier role and cancer status.
//
// Ego is never a node on the map, so each exchange is captured as a pair of
// booleans nominated on the Sociogram: "which of these people provides you with
// X" and "which do you provide with X". Their reciprocity is inferred from the
// two answers, rather than asked as a categorical. Disseminator and barrier are
// likewise two independent booleans, not one either/or role.
//
// The mapping to Network Canvas interfaces:
//   • FamilyPedigree + NarrativePedigree  → the genetic layer (a hereditary
//     breast/ovarian cancer family; the pedigree is SEEDED to reduce burden).
//   • NameGenerator (QuickAdd)            → add fictive/affinal kin to the network.
//   • Sociogram (one stage, auto layout)  → who knows whom (edge creation on the
//     first prompt), then the three reciprocal exchanges (two booleans each) and
//     the disseminator/barrier roles, each an attribute-nomination prompt.
// Every network member is one "Person" node type. Only the participant's
// family — the people connected to them through family relationships — appears
// on the Narrative Pedigree; the friends and colleagues added later share the
// node type but are not family, so only the sociogram shows them.
// ---------------------------------------------------------------------------

const KIN_TYPE_VAR = 'kinType';
const LAYOUT_VAR = 'socialLayout';

// Each reciprocal exchange is two booleans: the person provides it to ego (…In)
// and ego provides it to the person (…Out). Reciprocity is inferred from both.
const INFO_IN_VAR = 'infoProvidesYou';
const INFO_OUT_VAR = 'infoYouProvide';
const SUPPORT_IN_VAR = 'supportProvidesYou';
const SUPPORT_OUT_VAR = 'supportYouProvide';
const FEELINGS_IN_VAR = 'feelingsProvidesYou';
const FEELINGS_OUT_VAR = 'feelingsYouProvide';

// Disseminator and barrier are independent boolean roles.
const DISSEMINATOR_VAR = 'isDisseminator';
const BARRIER_VAR = 'isBarrier';

/**
 * Build the CEGRM demonstration interview. The pedigree is a hereditary
 * breast/ovarian cancer (HBOC) family whose cancer descends the maternal line
 * (autosomal dominant); the ego "Jane" is at risk. Resource exchanges,
 * disseminator/barrier roles and non-blood kin are seeded to mirror the paper's
 * worked example so every stage opens already populated.
 *
 * The friends and colleagues are nominated on a later stage and tied to the
 * family only by "knows" ties, never family relationships, so the Narrative
 * Pedigree leaves them off the family tree.
 */
export function buildCegrmInterview(seed: number, recordedOnly = false) {
  const si = new SyntheticInterview(seed);

  // --- One Person node type for kin AND non-kin -------------------------------
  const person = si.addNodeType({ name: 'Person' });
  person.addVariable({
    id: KIN_TYPE_VAR,
    name: KIN_TYPE_VAR,
    type: 'categorical',
    options: [
      { label: 'Biological kin', value: 'biological' },
      { label: 'In-law (affinal)', value: 'affinal' },
      { label: 'Friend (fictive kin)', value: 'fictive' },
    ],
  });
  for (const id of [
    INFO_IN_VAR,
    INFO_OUT_VAR,
    SUPPORT_IN_VAR,
    SUPPORT_OUT_VAR,
    FEELINGS_IN_VAR,
    FEELINGS_OUT_VAR,
    DISSEMINATOR_VAR,
    BARRIER_VAR,
  ]) {
    person.addVariable({ id, name: id, type: 'boolean' });
  }
  person.addVariable({ id: LAYOUT_VAR, name: LAYOUT_VAR, type: 'layout' });

  // --- Social (member-to-member) edge type; the pedigree adds its own --------
  const socialEdge = si.addEdgeType({ name: 'Knows' });

  // --- Stage 0: introduction --------------------------------------------------
  si.addInformationStage({
    label: 'About this map',
    title: 'Your family and support network',
    text:
      'This session builds a Colored Eco-Genetic Relationship Map. First we ' +
      'confirm your family tree and who has had cancer. Then we add the friends ' +
      'and others who matter to you, and record who you share information, help ' +
      'and feelings with, and who helps the wider family talk about its health.',
  });

  // --- Stage 1: family pedigree (seeded HBOC family) --------------------------
  const fpStage = si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    subject: { entity: 'node', type: person.id },
    framing: 'gamete',
    askGenderIdentity: false,
    prompt: 'Confirm the people in your family.',
    nominationPrompts: [
      { text: 'Who has had cancer?', variableName: 'hasCancer' },
    ],
  });
  // The pedigree's own person attributes, which the whole network shares.
  const NAME_VAR = fpStage.name;
  const EGO_VAR = fpStage.ego;
  const SEX_VAR = fpStage.sexAssignedAtBirth;
  const [CANCER_VAR] = fpStage.nominations;
  if (!CANCER_VAR) throw new Error('The cancer question is missing');
  // Circles for female, squares for male, diamonds for anyone else.
  person.setShape({
    default: 'diamond',
    dynamic: {
      variable: SEX_VAR,
      type: 'discrete',
      map: [
        { value: 'female', shape: 'circle' },
        { value: 'male', shape: 'square' },
      ],
    },
  });

  // --- Stage 2: add non-blood kin --------------------------------------------
  const ng = si.addStage('NameGeneratorQuickAdd', {
    label: 'People in your life',
    subject: { entity: 'node', type: person.id },
    quickAdd: NAME_VAR,
  });
  ng.addPrompt({
    text: 'Add the friends, colleagues and others who are important to you.',
  });

  // --- Stage 3: the whole CEGRM sociogram, on one auto-laid-out canvas --------
  // A single Sociogram stage with force-directed automatic layout, so the
  // participant reads the network rather than placing every person. The first
  // prompt draws the member-to-member ties; the rest nominate the three
  // reciprocal resource exchanges (two booleans each) and the two role booleans.
  // Edge creation and attribute highlighting cannot share a prompt, so each is a
  // prompt of its own within this one stage.
  const sociogram = si.addStage('Sociogram', {
    label: 'Your support network',
    subject: { entity: 'node', type: person.id },
    behaviours: { automaticLayout: true },
  });
  // Edge creation first: who knows whom.
  sociogram.addPrompt({
    text: 'Connect people who **know one another** by tapping them to create a line',
    layout: { layoutVariable: LAYOUT_VAR },
    edges: { create: socialEdge.id, display: [socialEdge.id] },
  });
  // Information exchange.
  sociogram.addPrompt({
    text: 'Which of these people provides you with genetic or health information?',
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: INFO_IN_VAR },
  });
  sociogram.addPrompt({
    text: 'Which of these people do you provide with genetic or health information?',
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: INFO_OUT_VAR },
  });
  // Practical support.
  sociogram.addPrompt({
    text: 'Which of these people provides you with practical help — like coming to an appointment or minding your children?',
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: SUPPORT_IN_VAR },
  });
  sociogram.addPrompt({
    text: 'Which of these people do you provide with practical help?',
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: SUPPORT_OUT_VAR },
  });
  // Sharing feelings.
  sociogram.addPrompt({
    text: "Which of these people shares their feelings about the family's cancer with you?",
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: FEELINGS_IN_VAR },
  });
  sociogram.addPrompt({
    text: "Which of these people do you share your feelings about the family's cancer with?",
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: FEELINGS_OUT_VAR },
  });
  // Disseminator / barrier roles.
  sociogram.addPrompt({
    text: 'Which of these people helps the family talk about its cancer risk?',
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: DISSEMINATOR_VAR },
  });
  sociogram.addPrompt({
    text: 'Which of these people makes it harder for the family to talk about its cancer risk?',
    layout: { layoutVariable: LAYOUT_VAR },
    highlight: { variable: BARRIER_VAR },
  });

  // --- Stage 4: narrative pedigree (the cancer pathway), shown last -----------
  // Shows the participant's family only, so the friends and colleagues added
  // since do not appear on the family tree.
  si.addStage('NarrativePedigree', {
    label: recordedOnly ? 'Family health history' : 'Hereditary cancer risk',
    sourceStageId: fpStage.id,
    showAtRiskStatuses: !recordedOnly,
    diseases: [
      {
        id: 'hboc',
        label: recordedOnly
          ? 'Reported cancer history'
          : 'Hereditary breast/ovarian cancer',
        color: 'node-color-seq-1',
        attribute: CANCER_VAR,
        inheritancePattern: recordedOnly ? 'unknown' : 'autosomalDominant',
      },
    ],
  });

  // --- Seed the network -------------------------------------------------------
  const fpId = fpStage.id;
  const ngId = ng.id;

  // Sociogram positions (normalised 0–1) seed the starting arrangement; the
  // stage's automatic layout then relaxes the network into a readable shape.
  const POS: Record<string, { x: number; y: number }> = {
    ego: { x: 0.5, y: 0.52 },
    husband: { x: 0.66, y: 0.5 },
    sister: { x: 0.4, y: 0.36 },
    bestfriend: { x: 0.74, y: 0.24 },
    childhoodfriend: { x: 0.56, y: 0.2 },
    colleague: { x: 0.86, y: 0.44 },
    aunt: { x: 0.28, y: 0.52 },
    mother: { x: 0.36, y: 0.66 },
    father: { x: 0.54, y: 0.72 },
    mgm: { x: 0.2, y: 0.78 },
    mgf: { x: 0.14, y: 0.62 },
    pgm: { x: 0.76, y: 0.74 },
    pgf: { x: 0.86, y: 0.68 },
    daughter: { x: 0.44, y: 0.86 },
    son: { x: 0.62, y: 0.86 },
  };

  type Attrs = Record<string, unknown>;

  const kin = (uid: string, attrs: Attrs) =>
    si.addManualNode(fpId, person.id, uid, {
      ...(POS[uid] ? { [LAYOUT_VAR]: POS[uid] } : {}),
      ...attrs,
    });
  // Nominated on the quick-add stage's only prompt, so the stage opens listing
  // them rather than empty.
  const nonKin = (uid: string, attrs: Attrs) =>
    si.addManualNode(
      ngId,
      person.id,
      uid,
      {
        [KIN_TYPE_VAR]: ['fictive'],
        ...(POS[uid] ? { [LAYOUT_VAR]: POS[uid] } : {}),
        ...attrs,
      },
      { promptIndices: [0] },
    );

  // Generation 1 — grandparents. The maternal grandmother founds the HBOC line;
  // the paternal grandmother is a key information disseminator.
  kin('mgm', {
    [NAME_VAR]: 'Rosa',
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
  });
  kin('mgf', {
    [NAME_VAR]: 'Bill',
    [SEX_VAR]: ['male'],
    [KIN_TYPE_VAR]: ['biological'],
  });
  kin('pgm', {
    [NAME_VAR]: 'Mary',
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
    [DISSEMINATOR_VAR]: true,
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [SUPPORT_IN_VAR]: true,
    [SUPPORT_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });
  kin('pgf', {
    [NAME_VAR]: 'Simon',
    [SEX_VAR]: ['male'],
    [KIN_TYPE_VAR]: ['biological'],
  });

  // Generation 2 — parents and a maternal aunt.
  kin('mother', {
    [NAME_VAR]: 'Nancy',
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [BARRIER_VAR]: true,
  });
  kin('father', {
    [NAME_VAR]: 'David',
    [SEX_VAR]: ['male'],
    [KIN_TYPE_VAR]: ['biological'],
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [SUPPORT_IN_VAR]: true,
    [SUPPORT_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });
  kin('aunt', {
    [NAME_VAR]: 'Carol',
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });

  // Generation 3 — ego, her sister, and her (affinal, married-in) husband.
  kin('ego', {
    [NAME_VAR]: 'Jane',
    [EGO_VAR]: true,
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
  });
  kin('sister', {
    [NAME_VAR]: 'Cynthia',
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });
  kin('husband', {
    [NAME_VAR]: 'Mark',
    [SEX_VAR]: ['male'],
    [KIN_TYPE_VAR]: ['affinal'],
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [SUPPORT_IN_VAR]: true,
    [SUPPORT_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });

  // Generation 4 — ego's children (at risk). Jane provides practical support to
  // her daughter but does not receive it — a one-way exchange (…Out only).
  kin('daughter', {
    [NAME_VAR]: 'Ada',
    [SEX_VAR]: ['female'],
    [KIN_TYPE_VAR]: ['biological'],
    [SUPPORT_OUT_VAR]: true,
  });
  kin('son', {
    [NAME_VAR]: 'Sam',
    [SEX_VAR]: ['male'],
    [KIN_TYPE_VAR]: ['biological'],
  });

  // Non-blood ("fictive") kin — the friends and colleagues CEGRM adds alongside
  // the family. Jane confides fully in her best friend, shares feelings with a
  // childhood friend, and receives one-way information from a colleague.
  nonKin('bestfriend', {
    [NAME_VAR]: 'Priya',
    [SEX_VAR]: ['female'],
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [SUPPORT_IN_VAR]: true,
    [SUPPORT_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });
  nonKin('colleague', {
    [NAME_VAR]: 'Tom',
    [SEX_VAR]: ['male'],
    [INFO_IN_VAR]: true,
  });
  nonKin('childhoodfriend', {
    [NAME_VAR]: 'Beth',
    [SEX_VAR]: ['female'],
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });

  // --- Pedigree edges ---------------------------------------------------------
  const bioEdge = (uid: string, from: string, to: string) =>
    si.addManualEdge(fpStage.edgeType, uid, from, to, {
      [fpStage.kind]: ['biological'],
      [fpStage.gestationalCarrier]: false,
    });
  const partnerEdge = (uid: string, a: string, b: string) =>
    si.addManualEdge(fpStage.edgeType, uid, a, b, {
      [fpStage.kind]: ['partner'],
      [fpStage.currentPartner]: true,
    });

  partnerEdge('mgm-mgf', 'mgm', 'mgf');
  partnerEdge('pgm-pgf', 'pgm', 'pgf');
  bioEdge('mgm-mother', 'mgm', 'mother');
  bioEdge('mgf-mother', 'mgf', 'mother');
  bioEdge('mgm-aunt', 'mgm', 'aunt');
  bioEdge('mgf-aunt', 'mgf', 'aunt');
  bioEdge('pgm-father', 'pgm', 'father');
  bioEdge('pgf-father', 'pgf', 'father');
  partnerEdge('mother-father', 'mother', 'father');
  bioEdge('mother-ego', 'mother', 'ego');
  bioEdge('father-ego', 'father', 'ego');
  bioEdge('mother-sister', 'mother', 'sister');
  bioEdge('father-sister', 'father', 'sister');
  partnerEdge('ego-husband', 'ego', 'husband');
  bioEdge('ego-daughter', 'ego', 'daughter');
  bioEdge('husband-daughter', 'husband', 'daughter');
  bioEdge('ego-son', 'ego', 'son');
  bioEdge('husband-son', 'husband', 'son');

  // --- Social (member-to-member) edges for the sociogram ----------------------
  const knows = (uid: string, a: string, b: string) =>
    si.addManualEdge(socialEdge.id, uid, a, b, {});
  knows('k-bf-sister', 'bestfriend', 'sister');
  knows('k-bf-husband', 'bestfriend', 'husband');
  knows('k-colleague-husband', 'colleague', 'husband');
  knows('k-cf-sister', 'childhoodfriend', 'sister');
  knows('k-aunt-mother', 'aunt', 'mother');
  knows('k-bf-cf', 'bestfriend', 'childhoodfriend');

  return { si };
}

function CegrmWrapper({
  seed,
  step,
  recordedOnly = false,
}: {
  seed: number;
  step: number;
  recordedOnly?: boolean;
}) {
  const rawPayload = useMemo(() => {
    const { si } = buildCegrmInterview(seed, recordedOnly);
    return SuperJSON.stringify(si.getInterviewPayload({ currentStep: step }));
  }, [seed, step, recordedOnly]);
  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} isDevelopment={false} />
    </div>
  );
}

const meta: Meta = {
  title: 'Examples/CEGRM',
  parameters: { layout: 'fullscreen' },
  excludeStories: ['buildCegrmInterview'],
};

export default meta;

type Story = StoryObj;

/**
 * The whole CEGRM walk-through, starting at the introduction. Use Next to move
 * through the pedigree, add the non-family members, work through the single
 * support-network sociogram (drawing ties, then nominating the resource
 * exchanges and roles) and finish on the hereditary-cancer-risk view.
 */
export const FullWalkthrough: Story = {
  render: () => <CegrmWrapper seed={11} step={0} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Your family and support network'),
    ).toBeVisible();
  },
};

/**
 * Jumps straight to the one support-network sociogram. Its first prompt draws
 * the member-to-member ties; the rest nominate the three reciprocal resource
 * exchanges (each two questions — who provides it to you, and who you provide it
 * to — so reciprocity is inferred) and the disseminator/barrier roles. The whole
 * network is auto-laid-out and pre-nominated from the seeded data. Use Back/Next
 * to move between prompts. Shortcut into {@link FullWalkthrough}.
 */
export const SupportNetwork: Story = {
  render: () => <CegrmWrapper seed={11} step={3} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Tom')).toBeVisible();
    await expect(await canvas.findByText('Beth')).toBeVisible();
  },
};

export const FamilyHealthNarrative: Story = {
  render: () => <CegrmWrapper seed={11} step={4} recordedOnly />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Reported cancer history' }),
    );
    await expect(
      await canvas.findByRole('button', { name: 'Focus on You' }),
    ).toBeVisible();
    await expect(
      canvas.queryByText('May develop this condition'),
    ).not.toBeInTheDocument();
  },
};

export const PedigreeStructure: Story = {
  render: () => <CegrmWrapper seed={11} step={1} recordedOnly />,
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nancy')).toBeVisible();
  },
};

/**
 * Jumps straight to the hereditary-cancer-risk view shown at the end of the
 * interview — the seeded family's cancer pathway, with the later-added friends
 * and colleagues excluded. Shortcut into the end of {@link FullWalkthrough}.
 */
export const HereditaryCancerRisk: Story = {
  render: () => <CegrmWrapper seed={11} step={4} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const condition = await canvas.findByRole('button', {
      name: 'Hereditary breast/ovarian cancer',
    });
    await userEvent.click(condition);
    await expect(condition).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Focus on You' }),
    );
    await expect(
      canvas.getByRole('button', { name: 'Clear focus' }),
    ).toBeVisible();
    // The friends and colleagues share the family's node type, but are not
    // family, so they are not on the family tree.
    for (const name of ['Tom', 'Priya', 'Beth']) {
      await expect(
        canvas.queryByRole('button', { name: `Focus on ${name}` }),
      ).not.toBeInTheDocument();
    }
    await expect(
      canvas.getByRole('button', { name: 'Focus on Cynthia' }),
    ).toBeInTheDocument();
  },
};
