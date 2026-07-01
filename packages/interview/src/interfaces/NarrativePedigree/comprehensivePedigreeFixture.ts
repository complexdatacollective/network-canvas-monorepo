import type { SyntheticInterview } from '@codaco/protocol-utilities';

// Shared fixture for the NarrativePedigree examples: a compact four-generation
// pedigree whose six conditions collectively exercise every inheritance pattern
// and every Sticker status, with a consanguineous cousin union. Kept separate
// from any *.stories file so it can be composed into different stage sequences
// (the all-pathways explorer and the FamilyPedigree→NarrativePedigree flow).

const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';

const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

// One boolean node attribute per condition.
const HD_VAR = 'hasHuntingtons'; // autosomal dominant
const CF_VAR = 'hasCysticFibrosis'; // autosomal recessive
const HAEM_VAR = 'hasHaemophilia'; // X-linked recessive
const XLH_VAR = 'hasHypophosphataemia'; // X-linked dominant
const YHL_VAR = 'hasYLinkedHearingLoss'; // Y-linked
const MITO_VAR = 'hasMitochondrialMyopathy'; // mitochondrial

/**
 * Add the shared comprehensive pedigree to `si`: the Person node type and Family
 * edge type, a FamilyPedigree source stage, a NarrativePedigree stage, and the
 * seeded four-generation network.
 *
 *   Eleanor (F) ── Arthur (M)              Harold (M) ── Irene (F)
 *        └─────┬─────┘                          └────┬────┬────┘
 *      Rose (F)   Frank (M)              David (M)  Martin (M) ── Grace (F)
 *        └────────────────┬──────────────────┘              └──┬──┘
 *                 ego "You" (F) ══════════════════════════ Chris (M)   Alex (NB)
 *                        └───────────────┬───────────────┘
 *                                  Leo (M)   Mia (F)
 *
 * ══ is the consanguineous union: Chris is Martin's son, so he and ego (David's
 * daughter) are paternal first cousins.
 *
 * Conditions and the status each surfaces:
 *  - Huntington's (autosomal dominant): Arthur + Rose affected → ego and her
 *    children AT RISK down the maternal line.
 *  - Cystic fibrosis (autosomal recessive): Mia affected → ego and cousin-partner
 *    Chris are OBLIGATE CARRIERS and Leo is at risk; the consanguineous union
 *    makes the children autozygous (the homozygous-risk "?" shows on Leo).
 *  - Haemophilia A (X-linked recessive): David and his brother Martin affected →
 *    Irene and ego are OBLIGATE CARRIERS.
 *  - X-linked hypophosphataemia (X-linked dominant): David affected → his
 *    daughter ego is OBLIGATE-AFFECTED ("will develop it"), her children at risk.
 *  - Y-linked hearing loss (Y-linked): Harold affected → the paternal male line
 *    David/Martin/Chris and ego's son Leo are OBLIGATE-AFFECTED.
 *  - Mitochondrial myopathy (mitochondrial): Eleanor affected → the maternal line
 *    Rose → ego → Leo & Mia is at risk.
 *
 * The stages are appended in order (FamilyPedigree then NarrativePedigree), so a
 * caller that prepends its own stages knows the resulting indices by construction.
 *
 * @param showAtRisk  Whether the NarrativePedigree stage shows the at-risk
 *   (probabilistic) statuses. Defaults to `true` so every status is visible.
 */
export function addComprehensivePedigree(
  si: SyntheticInterview,
  showAtRisk = true,
): void {
  const nodeType = si.addNodeType({
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
  nodeType.addVariable({ id: NAME_VAR, name: NAME_VAR, type: 'text' });
  nodeType.addVariable({ id: EGO_VAR, name: EGO_VAR, type: 'boolean' });
  nodeType.addVariable({ id: BIO_SEX_VAR, name: BIO_SEX_VAR, type: 'text' });
  nodeType.addVariable({
    id: REL_TO_EGO_VAR,
    name: REL_TO_EGO_VAR,
    type: 'text',
  });
  for (const id of [HD_VAR, CF_VAR, HAEM_VAR, XLH_VAR, YHL_VAR, MITO_VAR]) {
    nodeType.addVariable({ id, name: id, type: 'boolean' });
  }

  const edgeType = si.addEdgeType({ name: 'Family' });
  edgeType.addVariable({
    id: REL_TYPE_VAR,
    name: REL_TYPE_VAR,
    type: 'categorical',
    options: [
      { label: 'biological', value: 'biological' },
      { label: 'partner', value: 'partner' },
    ],
  });
  edgeType.addVariable({
    id: IS_ACTIVE_VAR,
    name: IS_ACTIVE_VAR,
    type: 'boolean',
  });
  edgeType.addVariable({ id: IS_GEST_VAR, name: IS_GEST_VAR, type: 'boolean' });
  edgeType.addVariable({
    id: GAMETE_ROLE_VAR,
    name: GAMETE_ROLE_VAR,
    type: 'text',
  });

  const fpStage = si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: NAME_VAR,
      egoVariable: EGO_VAR,
      relationshipVariable: REL_TO_EGO_VAR,
      biologicalSexVariable: BIO_SEX_VAR,
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: REL_TYPE_VAR,
      isActiveVariable: IS_ACTIVE_VAR,
      isGestationalCarrierVariable: IS_GEST_VAR,
      gameteRoleVariable: GAMETE_ROLE_VAR,
    },
    censusPrompt: 'Build your family pedigree.',
    nominationPrompts: [
      { id: 'nom-hd', text: "Who has Huntington's disease?", variable: HD_VAR },
      { id: 'nom-cf', text: 'Who has cystic fibrosis?', variable: CF_VAR },
      { id: 'nom-hm', text: 'Who has haemophilia?', variable: HAEM_VAR },
      {
        id: 'nom-xlh',
        text: 'Who has X-linked hypophosphataemia?',
        variable: XLH_VAR,
      },
      {
        id: 'nom-yhl',
        text: 'Who has Y-linked hearing loss?',
        variable: YHL_VAR,
      },
      {
        id: 'nom-mt',
        text: 'Who has mitochondrial myopathy?',
        variable: MITO_VAR,
      },
    ],
  });

  si.addStage('NarrativePedigree', {
    label: 'Inheritance Pathways',
    sourceStageId: fpStage.id,
    showAtRiskStatuses: showAtRisk,
    diseases: [
      {
        id: 'huntingtons',
        label: "Huntington's Disease",
        color: '#e53e3e',
        variable: HD_VAR,
        inheritancePattern: 'autosomalDominant',
      },
      {
        id: 'cysticFibrosis',
        label: 'Cystic Fibrosis',
        color: '#805ad5',
        variable: CF_VAR,
        inheritancePattern: 'autosomalRecessive',
      },
      {
        id: 'haemophilia',
        label: 'Haemophilia A',
        color: '#3182ce',
        variable: HAEM_VAR,
        inheritancePattern: 'xLinkedRecessive',
      },
      {
        id: 'hypophosphataemia',
        label: 'X-linked Hypophosphataemia',
        color: '#dd6b20',
        variable: XLH_VAR,
        inheritancePattern: 'xLinkedDominant',
      },
      {
        id: 'yLinkedHearingLoss',
        label: 'Y-linked Hearing Loss',
        color: '#d53f8c',
        variable: YHL_VAR,
        inheritancePattern: 'yLinked',
      },
      {
        id: 'mitochondrial',
        label: 'Mitochondrial Myopathy',
        color: '#38a169',
        variable: MITO_VAR,
        inheritancePattern: 'mitochondrial',
      },
    ],
  });

  const fpId = fpStage.id;
  const person = (uid: string, attrs: Record<string, unknown>) =>
    si.addManualNode(fpId, nodeType.id, uid, attrs);

  // Generation 1 — maternal grandparents (Huntington's + mitochondrial founders).
  person('gm', {
    [NAME_VAR]: 'Eleanor',
    [BIO_SEX_VAR]: 'female',
    [MITO_VAR]: true,
  });
  person('gf', { [NAME_VAR]: 'Arthur', [BIO_SEX_VAR]: 'male', [HD_VAR]: true });

  // Generation 1 — paternal grandparents (haemophilia carrier + Y-linked founder).
  person('gf-pat', {
    [NAME_VAR]: 'Harold',
    [BIO_SEX_VAR]: 'male',
    [YHL_VAR]: true,
  });
  person('gm-pat', { [NAME_VAR]: 'Irene', [BIO_SEX_VAR]: 'female' });

  // Generation 2 — maternal.
  person('mother', {
    [NAME_VAR]: 'Rose',
    [BIO_SEX_VAR]: 'female',
    [HD_VAR]: true,
  });
  person('uncle', { [NAME_VAR]: 'Frank', [BIO_SEX_VAR]: 'male' });

  // Generation 2 — paternal. David is affected with two X-linked conditions
  // (recessive haemophilia AND dominant hypophosphataemia) and, as Harold's son,
  // is on the Y-linked male line. Martin (David's brother) is the second affected
  // haemophilia son — making their mother Irene an obligate carrier — and is
  // Chris's father, forming the cousin union.
  person('father', {
    [NAME_VAR]: 'David',
    [BIO_SEX_VAR]: 'male',
    [HAEM_VAR]: true,
    [XLH_VAR]: true,
  });
  person('uncle-pat', {
    [NAME_VAR]: 'Martin',
    [BIO_SEX_VAR]: 'male',
    [HAEM_VAR]: true,
  });
  person('cm', { [NAME_VAR]: 'Grace', [BIO_SEX_VAR]: 'female' });

  // Generation 3.
  person('ego', {
    [NAME_VAR]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });
  person('sibling', { [NAME_VAR]: 'Alex', [BIO_SEX_VAR]: 'other' });
  // Chris — ego's partner AND her paternal first cousin (Martin's son).
  person('partner', { [NAME_VAR]: 'Chris', [BIO_SEX_VAR]: 'male' });

  // Generation 4 — ego's children.
  person('son', { [NAME_VAR]: 'Leo', [BIO_SEX_VAR]: 'male' });
  person('daughter', {
    [NAME_VAR]: 'Mia',
    [BIO_SEX_VAR]: 'female',
    [CF_VAR]: true,
  });

  const bioEdge = (uid: string, from: string, to: string) =>
    si.addManualEdge(edgeType.id, uid, from, to, {
      [REL_TYPE_VAR]: ['biological'],
      [IS_ACTIVE_VAR]: true,
    });
  const partnerEdge = (uid: string, a: string, b: string) =>
    si.addManualEdge(edgeType.id, uid, a, b, {
      [REL_TYPE_VAR]: ['partner'],
      [IS_ACTIVE_VAR]: true,
    });

  // Maternal grandparents → Rose + Frank.
  bioEdge('gm-mother', 'gm', 'mother');
  bioEdge('gf-mother', 'gf', 'mother');
  bioEdge('gm-uncle', 'gm', 'uncle');
  bioEdge('gf-uncle', 'gf', 'uncle');
  partnerEdge('gm-gf', 'gm', 'gf');

  // Paternal grandparents → David + Martin.
  bioEdge('gfp-father', 'gf-pat', 'father');
  bioEdge('gmp-father', 'gm-pat', 'father');
  bioEdge('gfp-unclepat', 'gf-pat', 'uncle-pat');
  bioEdge('gmp-unclepat', 'gm-pat', 'uncle-pat');
  partnerEdge('gfp-gmp', 'gf-pat', 'gm-pat');

  // Martin + Grace → Chris (making Chris ego's paternal first cousin).
  bioEdge('unclepat-partner', 'uncle-pat', 'partner');
  bioEdge('cm-partner', 'cm', 'partner');
  partnerEdge('unclepat-cm', 'uncle-pat', 'cm');

  // Rose + David → ego + Alex.
  bioEdge('mother-ego', 'mother', 'ego');
  bioEdge('father-ego', 'father', 'ego');
  bioEdge('mother-sibling', 'mother', 'sibling');
  bioEdge('father-sibling', 'father', 'sibling');
  partnerEdge('mother-father', 'mother', 'father');

  // ego + Chris → Leo + Mia (the consanguineous union).
  bioEdge('ego-son', 'ego', 'son');
  bioEdge('partner-son', 'partner', 'son');
  bioEdge('ego-daughter', 'ego', 'daughter');
  bioEdge('partner-daughter', 'partner', 'daughter');
  partnerEdge('ego-partner', 'ego', 'partner');
}
