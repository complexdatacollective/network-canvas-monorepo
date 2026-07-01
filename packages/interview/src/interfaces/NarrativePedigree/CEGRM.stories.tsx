import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

// ---------------------------------------------------------------------------
// The Colored Eco-Genetic Relationship Map (CEGRM; Kenen & Peters, J Genet
// Couns 2001) implemented in Network Canvas. The CEGRM overlays, on a cancer
// pedigree extended with non-blood ("fictive") and in-law ("affinal") kin, three
// ego↔member resource exchanges — information, material/services and emotion —
// each reciprocal or one-way, plus a disseminator/barrier role and cancer status.
//
// The mapping to Network Canvas interfaces:
//   • FamilyPedigree + NarrativePedigree  → the genetic layer (a hereditary
//     breast/ovarian cancer family; the pedigree is SEEDED to reduce burden).
//   • NameGenerator (QuickAdd)            → add fictive/affinal kin to the network.
//   • CategoricalBin ×3                   → the three resource exchanges captured
//     as a per-member attribute (reciprocal / one-way), since the exchange sits
//     between ego and each member (ego is never a node on the map).
//   • CategoricalBin (roles)              → disseminator (green star) / barrier.
//   • Sociogram                           → the member-to-member social network.
// Every network member is one "Person" node type so a single pass of each
// interpreter covers kin and non-kin alike.
// ---------------------------------------------------------------------------

const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';
const CANCER_VAR = 'hasCancer';
const KIN_TYPE_VAR = 'kinType';
const INFO_VAR = 'informationExchange';
const MATERIAL_VAR = 'materialExchange';
const EMOTION_VAR = 'emotionExchange';
const ROLE_VAR = 'cegrmRole';
const LAYOUT_VAR = 'socialLayout';

const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

// Exchange levels (CEGRM: large circle = reciprocal, small = one-way).
const EXCHANGE_OPTIONS = [
  { label: 'Reciprocal', value: 'reciprocal' },
  { label: 'One-way', value: 'oneWay' },
];

/**
 * Build the CEGRM demonstration interview. The pedigree is a hereditary
 * breast/ovarian cancer (HBOC) family whose cancer descends the maternal line
 * (autosomal dominant); the ego "Jane" is at risk. Resource exchanges,
 * disseminator/barrier roles and non-blood kin are seeded to mirror the paper's
 * worked example so every stage opens already populated.
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
  // label (CategoricalBin, Sociogram, NameGenerator cards) resolves to the name
  // rather than falling through to another text variable (e.g. biological sex).
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
  for (const id of [INFO_VAR, MATERIAL_VAR, EMOTION_VAR]) {
    person.addVariable({
      id,
      name: id,
      type: 'categorical',
      options: EXCHANGE_OPTIONS,
    });
  }
  person.addVariable({
    id: ROLE_VAR,
    name: ROLE_VAR,
    type: 'categorical',
    options: [
      { label: 'Disseminator', value: 'disseminator' },
      { label: 'Barrier', value: 'barrier' },
    ],
  });
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

  // --- Stage 2: narrative pedigree (the cancer pathway) -----------------------
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

  // --- Stage 3: add non-blood kin --------------------------------------------
  const ng = si.addStage('NameGeneratorQuickAdd', {
    label: 'People in your life',
    subject: { entity: 'node', type: person.id },
    quickAdd: NAME_VAR,
  });
  ng.addPrompt({
    text: 'Add the friends, colleagues and others who are important to you.',
  });

  // --- Stages 4–6: the three resource exchanges -------------------------------
  const infoBin = si.addStage('CategoricalBin', {
    label: 'Sharing information',
    subject: { entity: 'node', type: person.id },
  });
  infoBin.addPrompt({
    text: 'Who do you share genetic and health information with — and is it two-way (reciprocal) or one-way?',
    variable: INFO_VAR,
  });

  const materialBin = si.addStage('CategoricalBin', {
    label: 'Practical support',
    subject: { entity: 'node', type: person.id },
  });
  materialBin.addPrompt({
    text: 'Who exchanges practical help with you — for example, coming to an appointment or minding your children?',
    variable: MATERIAL_VAR,
  });

  const emotionBin = si.addStage('CategoricalBin', {
    label: 'Sharing feelings',
    subject: { entity: 'node', type: person.id },
  });
  emotionBin.addPrompt({
    text: 'Who do you share your feelings about cancer in the family with?',
    variable: EMOTION_VAR,
  });

  // --- Stage 7: disseminator / barrier roles ----------------------------------
  const roleBin = si.addStage('CategoricalBin', {
    label: 'Talking about risk',
    subject: { entity: 'node', type: person.id },
  });
  roleBin.addPrompt({
    text: 'Who helps the family talk about its cancer risk (a disseminator), and who discourages it (a barrier)?',
    variable: ROLE_VAR,
  });

  // --- Stage 8: member-to-member social network -------------------------------
  const sociogram = si.addStage('Sociogram', {
    label: 'How they know each other',
    subject: { entity: 'node', type: person.id },
  });
  sociogram.addPrompt({
    text: 'Draw a line between any two people who know one another.',
    layout: { layoutVariable: LAYOUT_VAR },
    edges: { create: socialEdge.id, display: [socialEdge.id] },
  });

  // --- Seed the network -------------------------------------------------------
  const fpId = fpStage.id;
  const ngId = ng.id;

  // Sociogram positions (normalised 0–1) so the member-to-member network opens
  // already laid out with its ties drawn, rather than as an empty placement task.
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
  const nonKin = (uid: string, attrs: Attrs) =>
    si.addManualNode(ngId, person.id, uid, {
      [KIN_TYPE_VAR]: ['fictive'],
      ...(POS[uid] ? { [LAYOUT_VAR]: POS[uid] } : {}),
      ...attrs,
    });

  // Generation 1 — grandparents. The maternal grandmother founds the HBOC line;
  // the paternal grandmother is a key information disseminator (green star).
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
    [ROLE_VAR]: ['disseminator'],
    [INFO_VAR]: ['reciprocal'],
    [MATERIAL_VAR]: ['reciprocal'],
    [EMOTION_VAR]: ['reciprocal'],
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
    [ROLE_VAR]: ['barrier'],
  });
  kin('father', {
    [NAME_VAR]: 'David',
    [BIO_SEX_VAR]: 'male',
    [KIN_TYPE_VAR]: ['biological'],
    [INFO_VAR]: ['reciprocal'],
    [MATERIAL_VAR]: ['reciprocal'],
    [EMOTION_VAR]: ['reciprocal'],
  });
  kin('aunt', {
    [NAME_VAR]: 'Carol',
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [EMOTION_VAR]: ['reciprocal'],
  });

  // Generation 3 — ego, her sister, and her (affinal, married-in) husband.
  kin('ego', {
    [NAME_VAR]: 'Jane',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [ROLE_VAR]: ['disseminator'],
  });
  kin('sister', {
    [NAME_VAR]: 'Cynthia',
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [CANCER_VAR]: true,
    [INFO_VAR]: ['reciprocal'],
    [EMOTION_VAR]: ['reciprocal'],
  });
  kin('husband', {
    [NAME_VAR]: 'Mark',
    [BIO_SEX_VAR]: 'male',
    [KIN_TYPE_VAR]: ['affinal'],
    [INFO_VAR]: ['reciprocal'],
    [MATERIAL_VAR]: ['reciprocal'],
    [EMOTION_VAR]: ['reciprocal'],
  });

  // Generation 4 — ego's children (at risk).
  kin('daughter', {
    [NAME_VAR]: 'Ada',
    [BIO_SEX_VAR]: 'female',
    [KIN_TYPE_VAR]: ['biological'],
    [MATERIAL_VAR]: ['oneWay'],
  });
  kin('son', {
    [NAME_VAR]: 'Sam',
    [BIO_SEX_VAR]: 'male',
    [KIN_TYPE_VAR]: ['biological'],
  });

  // Non-blood ("fictive") kin — the friends and colleagues CEGRM adds alongside
  // the family. Jane confides fully in her best friend, shares feelings with a
  // childhood friend, and gets one-way information from a colleague.
  nonKin('bestfriend', {
    [NAME_VAR]: 'Priya',
    [BIO_SEX_VAR]: 'female',
    [INFO_VAR]: ['reciprocal'],
    [MATERIAL_VAR]: ['reciprocal'],
    [EMOTION_VAR]: ['reciprocal'],
  });
  nonKin('colleague', {
    [NAME_VAR]: 'Tom',
    [BIO_SEX_VAR]: 'male',
    [INFO_VAR]: ['oneWay'],
  });
  nonKin('childhoodfriend', {
    [NAME_VAR]: 'Beth',
    [BIO_SEX_VAR]: 'female',
    [EMOTION_VAR]: ['reciprocal'],
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

  return si;
}

function CegrmWrapper({ seed, step }: { seed: number; step: number }) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildCegrmInterview(seed).getInterviewPayload({ currentStep: step }),
      ),
    [seed, step],
  );
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
 * through the pedigree, the cancer-risk view, adding non-family members, the
 * three resource-exchange interpreters, the disseminator/barrier roles and the
 * member-to-member social network.
 */
export const FullWalkthrough: Story = {
  render: () => <CegrmWrapper seed={11} step={0} />,
};

/**
 * Jumps straight to the first resource-exchange interpreter (information
 * sharing). Use Back/Next to move between the information, practical-support,
 * feelings and disseminator/barrier interpreters — each pre-sorted from the
 * seeded data. Shortcut into the middle of {@link FullWalkthrough}.
 */
export const ResourceExchanges: Story = {
  render: () => <CegrmWrapper seed={11} step={4} />,
};

/**
 * Jumps straight to the member-to-member social network — the family and the
 * non-kin laid out together with their social ties drawn. Shortcut into the end
 * of {@link FullWalkthrough}.
 */
export const SocialNetwork: Story = {
  render: () => <CegrmWrapper seed={11} step={8} />,
};
