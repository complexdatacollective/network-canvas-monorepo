import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../../.storybook/StoryInterviewShell';

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
// Every network member is one "Person" node type. Only the people placed on the
// pedigree appear on the pedigree interfaces (via the pedigree's private
// membership); the sociogram shows everyone.
// ---------------------------------------------------------------------------

const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';
const CANCER_VAR = 'hasCancer';
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

const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

// The pedigree lives at stage index 1 (the introduction is index 0); the
// Narrative Pedigree reads this stage's committed membership to exclude non-kin.
const FAMILY_PEDIGREE_STAGE_INDEX = 1;

/**
 * Build the CEGRM demonstration interview. The pedigree is a hereditary
 * breast/ovarian cancer (HBOC) family whose cancer descends the maternal line
 * (autosomal dominant); the ego "Jane" is at risk. Resource exchanges,
 * disseminator/barrier roles and non-blood kin are seeded to mirror the paper's
 * worked example so every stage opens already populated.
 *
 * Returns the interview plus the seeded FamilyPedigree stage metadata: the
 * private membership (kin only) that scopes the pedigree interfaces so the
 * later-added friends do not appear on the family tree.
 */
export function buildCegrmInterview(seed: number) {
  const si = new SyntheticInterview(seed);

  // --- One Person node type for kin AND non-kin -------------------------------
  const person = si.addNodeType({
    name: 'Person',
    shape: {
      default: 'circle',
      dynamic: {
        type: 'discrete',
        variable: BIO_SEX_VAR,
        map: [
          { value: 'male', shape: 'square' },
          { value: 'female', shape: 'circle' },
          { value: 'other', shape: 'diamond' },
        ],
      },
    },
  });
  // `addNodeType` already seeds a text variable named "name"; re-declaring it
  // dedupes to that one and returns its real id. Use that id so the generic node
  // label (Sociogram, NameGenerator cards) resolves to the name rather than
  // falling through to another text variable (e.g. biological sex).
  const NAME_VAR = person.addVariable({ name: 'name', type: 'text' }).id;
  person.addVariable({ id: EGO_VAR, name: EGO_VAR, type: 'boolean' });
  person.addVariable({ id: BIO_SEX_VAR, name: BIO_SEX_VAR, type: 'text' });
  person.addVariable({
    id: REL_TO_EGO_VAR,
    name: REL_TO_EGO_VAR,
    type: 'text',
  });
  person.addVariable({ id: CANCER_VAR, name: CANCER_VAR, type: 'boolean' });
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

  // --- Edge types: family (pedigree) and social (member-to-member) ------------
  const familyEdge = si.addEdgeType({ name: 'Family' });
  familyEdge.addVariable({
    id: REL_TYPE_VAR,
    name: REL_TYPE_VAR,
    type: 'categorical',
    options: [
      { label: 'biological', value: 'biological' },
      { label: 'partner', value: 'partner' },
    ],
  });
  familyEdge.addVariable({
    id: IS_ACTIVE_VAR,
    name: IS_ACTIVE_VAR,
    type: 'boolean',
  });
  familyEdge.addVariable({
    id: IS_GEST_VAR,
    name: IS_GEST_VAR,
    type: 'boolean',
  });
  familyEdge.addVariable({
    id: GAMETE_ROLE_VAR,
    name: GAMETE_ROLE_VAR,
    type: 'text',
  });

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
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: person.id,
      nodeLabelVariable: NAME_VAR,
      egoVariable: EGO_VAR,
      relationshipVariable: REL_TO_EGO_VAR,
      biologicalSexVariable: BIO_SEX_VAR,
    },
    edgeConfig: {
      type: familyEdge.id,
      relationshipTypeVariable: REL_TYPE_VAR,
      isActiveVariable: IS_ACTIVE_VAR,
      isGestationalCarrierVariable: IS_GEST_VAR,
      gameteRoleVariable: GAMETE_ROLE_VAR,
    },
    censusPrompt: 'Confirm the people in your family.',
    nominationPrompts: [
      { id: 'nom-cancer', text: 'Who has had cancer?', variable: CANCER_VAR },
    ],
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
  // Reads the committed FamilyPedigree membership (kin only), so the friends and
  // colleagues added since do not appear on the family tree.
  si.addStage('NarrativePedigree', {
    label: 'Hereditary cancer risk',
    sourceStageId: fpStage.id,
    showAtRiskStatuses: true,
    diseases: [
      {
        id: 'hboc',
        label: 'Hereditary breast/ovarian cancer',
        color: '#e53e3e',
        variable: CANCER_VAR,
        inheritancePattern: 'autosomalDominant',
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

  // The pedigree's private membership: everyone placed on the family tree (kin
  // and the married-in husband), used to scope the pedigree interfaces.
  const pedigreeMembers: { id: string; label: string; isEgo: boolean }[] = [];
  const kin = (uid: string, attrs: Attrs) => {
    pedigreeMembers.push({
      id: uid,
      label:
        typeof attrs[NAME_VAR] === 'string' ? (attrs[NAME_VAR] as string) : uid,
      isEgo: attrs[EGO_VAR] === true,
    });
    return si.addManualNode(fpId, person.id, uid, {
      ...(POS[uid] ? { [LAYOUT_VAR]: POS[uid] } : {}),
      ...attrs,
    });
  };
  const nonKin = (uid: string, attrs: Attrs) =>
    si.addManualNode(ngId, person.id, uid, {
      [KIN_TYPE_VAR]: ['fictive'],
      ...(POS[uid] ? { [LAYOUT_VAR]: POS[uid] } : {}),
      ...attrs,
    });

  // Generation 1 — grandparents. The maternal grandmother founds the HBOC line;
  // the paternal grandmother is a key information disseminator.
  kin('mgm', {
    [NAME_VAR]: 'Rosa',
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
  });
  kin('mgf', {
    [NAME_VAR]: 'Bill',
    [BIO_SEX_VAR]: 'male',
    [KIN_TYPE_VAR]: ['biological'],
  });
  kin('pgm', {
    [NAME_VAR]: 'Mary',
    [BIO_SEX_VAR]: 'female',
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
    [BIO_SEX_VAR]: 'male',
    [KIN_TYPE_VAR]: ['biological'],
  });

  // Generation 2 — parents and a maternal aunt.
  kin('mother', {
    [NAME_VAR]: 'Nancy',
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [BARRIER_VAR]: true,
  });
  kin('father', {
    [NAME_VAR]: 'David',
    [BIO_SEX_VAR]: 'male',
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
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });

  // Generation 3 — ego, her sister, and her (affinal, married-in) husband.
  kin('ego', {
    [NAME_VAR]: 'Jane',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
  });
  kin('sister', {
    [NAME_VAR]: 'Cynthia',
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });
  kin('husband', {
    [NAME_VAR]: 'Mark',
    [BIO_SEX_VAR]: 'male',
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
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [SUPPORT_OUT_VAR]: true,
  });
  kin('son', {
    [NAME_VAR]: 'Sam',
    [BIO_SEX_VAR]: 'male',
    [KIN_TYPE_VAR]: ['biological'],
  });

  // Non-blood ("fictive") kin — the friends and colleagues CEGRM adds alongside
  // the family. Jane confides fully in her best friend, shares feelings with a
  // childhood friend, and receives one-way information from a colleague.
  nonKin('bestfriend', {
    [NAME_VAR]: 'Priya',
    [BIO_SEX_VAR]: 'female',
    [INFO_IN_VAR]: true,
    [INFO_OUT_VAR]: true,
    [SUPPORT_IN_VAR]: true,
    [SUPPORT_OUT_VAR]: true,
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });
  nonKin('colleague', {
    [NAME_VAR]: 'Tom',
    [BIO_SEX_VAR]: 'male',
    [INFO_IN_VAR]: true,
  });
  nonKin('childhoodfriend', {
    [NAME_VAR]: 'Beth',
    [BIO_SEX_VAR]: 'female',
    [FEELINGS_IN_VAR]: true,
    [FEELINGS_OUT_VAR]: true,
  });

  // --- Pedigree edges ---------------------------------------------------------
  const bioEdge = (uid: string, from: string, to: string) =>
    si.addManualEdge(familyEdge.id, uid, from, to, {
      [REL_TYPE_VAR]: ['biological'],
      [IS_ACTIVE_VAR]: true,
    });
  const partnerEdge = (uid: string, a: string, b: string) =>
    si.addManualEdge(familyEdge.id, uid, a, b, {
      [REL_TYPE_VAR]: ['partner'],
      [IS_ACTIVE_VAR]: true,
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

  const stageMetadata = {
    [FAMILY_PEDIGREE_STAGE_INDEX]: {
      isNetworkCommitted: true,
      nodes: pedigreeMembers,
    },
  };

  return { si, stageMetadata };
}

function CegrmWrapper({ seed, step }: { seed: number; step: number }) {
  const rawPayload = useMemo(() => {
    const { si, stageMetadata } = buildCegrmInterview(seed);
    return SuperJSON.stringify(
      si.getInterviewPayload({ currentStep: step, stageMetadata }),
    );
  }, [seed, step]);
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
};

/**
 * Jumps straight to the hereditary-cancer-risk view shown at the end of the
 * interview — the seeded family's cancer pathway, with the later-added friends
 * and colleagues excluded. Shortcut into the end of {@link FullWalkthrough}.
 */
export const HereditaryCancerRisk: Story = {
  render: () => <CegrmWrapper seed={11} step={4} />,
};
