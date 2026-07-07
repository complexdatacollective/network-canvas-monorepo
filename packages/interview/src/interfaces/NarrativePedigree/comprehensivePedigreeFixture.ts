import { SyntheticInterview } from '@codaco/protocol-utilities';

// Shared fixture for the NarrativePedigree examples: one integrated five-
// generation family whose six conditions each get a self-contained, genetically
// realistic branch. Kept separate from any *.stories file so it can be composed
// into different stage sequences (the interface's own default story, its capture
// story, and the FamilyPedigree→NarrativePedigree flow example).
//
// Names follow North-American patrilineal convention — a wife takes her
// husband's surname, children take their father's, and a married-in spouse
// brings their own — which is itself part of the demonstration (e.g. the two CF
// cousins carry DIFFERENT surnames because one descends through a son and the
// other through a daughter of the shared Marsh grandparents).

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
 * seeded five-generation network. Each condition manifests on its own branch so
 * that, viewed one condition at a time, the pattern reads cleanly:
 *
 *  - Huntington's (autosomal dominant): Arthur → Rose affected; the whole
 *    maternal descent (ego, her children, the cousins) is at risk — a late-onset
 *    dominant sweeping down a line.
 *  - Mitochondrial myopathy (mitochondrial): Eleanor affected → the maternal line
 *    is at risk. Built-in contrast: Frank and George (at-risk males) do NOT pass
 *    it on, but their sister Nancy passes it to Laura and onward.
 *  - Y-linked hearing loss (Y-linked): the Sullivan male line Harold → David →
 *    Ben is affected; the youngest boy Owen is inferred "will develop it". Ego's
 *    own son escapes — his Y comes from Chris, not the Sullivan line.
 *  - Haemophilia A (X-linked recessive): two affected Marsh brothers make their
 *    mother Eleanor an OBLIGATE carrier; the carrier-female line reaches ego (may
 *    carry) and her son (may develop).
 *  - X-linked hypophosphataemia (X-linked dominant): Walter Adler → all of his
 *    daughters affected (Paula "will develop it"), his son Chris spared — so ego's
 *    children are spared too. The signature male→every-daughter pattern.
 *  - Cystic fibrosis (autosomal recessive): a consanguineous first-cousin union
 *    (Michael Marsh × Laura Doyle, sharing the Marsh grandparents) → Sophie
 *    affected; her unaffected brother Daniel carries the "two copies" homozygous
 *    at-risk marker.
 *
 * One egg-donation branch (Margaret Marsh, at risk down the maternal line,
 * conceives via an unaffected egg donor) shows a child — Chloe — escaping the
 * family's mitochondrial (and every other maternal-line) risk, because her genes
 * come from the donor, not her social mother.
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
  // addNodeType auto-seeds a "name" text variable keyed by a generated UID.
  // Re-declaring it dedupes to that variable, so capture the returned id and use
  // it for both the label config and the seeded attributes — otherwise the label
  // would be stored under the literal key "name" that no codebook variable owns.
  const nameVarId = nodeType.addVariable({ name: NAME_VAR, type: 'text' }).id;
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
    // 'social' and 'donor' are needed by the egg-donation branch: the donor edge
    // carries the genes, while the social (gestational) mother's edge does not.
    options: [
      { label: 'biological', value: 'biological' },
      { label: 'partner', value: 'partner' },
      { label: 'social', value: 'social' },
      { label: 'donor', value: 'donor' },
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
      nodeLabelVariable: nameVarId,
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

  // --- Sullivan paternal line — Y-linked hearing loss ----------------------
  // An unbroken male line. Harold, David and Ben are nominated; Owen (a child)
  // is left un-nominated so the engine infers he "will develop it".
  person('pgf', {
    [nameVarId]: 'Harold Sullivan',
    [BIO_SEX_VAR]: 'male',
    [YHL_VAR]: true,
  });
  person('pgm', { [nameVarId]: 'Irene Sullivan', [BIO_SEX_VAR]: 'female' });
  person('father', {
    [nameVarId]: 'David Sullivan',
    [BIO_SEX_VAR]: 'male',
    [YHL_VAR]: true,
  });
  person('brother', {
    [nameVarId]: 'Ben Sullivan',
    [BIO_SEX_VAR]: 'male',
    [YHL_VAR]: true,
  });
  person('bwife', { [nameVarId]: 'Kate Sullivan', [BIO_SEX_VAR]: 'female' });
  person('nephew', { [nameVarId]: 'Owen Sullivan', [BIO_SEX_VAR]: 'male' });

  // --- Marsh maternal line -------------------------------------------------
  // Arthur founds the Huntington's line; Eleanor the mitochondrial line and,
  // as mother of two affected haemophilia sons, the X-linked carrier line.
  person('mgf', {
    [nameVarId]: 'Arthur Marsh',
    [BIO_SEX_VAR]: 'male',
    [HD_VAR]: true,
  });
  person('mgm', {
    [nameVarId]: 'Eleanor Marsh',
    [BIO_SEX_VAR]: 'female',
    [MITO_VAR]: true,
  });
  // Rose married David Sullivan (takes his surname); she is ego's mother.
  person('mother', {
    [nameVarId]: 'Rose Sullivan',
    [BIO_SEX_VAR]: 'female',
    [HD_VAR]: true,
  });
  person('unc1', {
    [nameVarId]: 'Frank Marsh',
    [BIO_SEX_VAR]: 'male',
    [HAEM_VAR]: true,
  });
  person('unc2', {
    [nameVarId]: 'George Marsh',
    [BIO_SEX_VAR]: 'male',
    [HAEM_VAR]: true,
  });
  person('aunt', { [nameVarId]: 'Nancy Doyle', [BIO_SEX_VAR]: 'female' }); // née Marsh
  person('fwife', { [nameVarId]: 'Wendy Marsh', [BIO_SEX_VAR]: 'female' });
  person('dhusb', { [nameVarId]: 'Robert Doyle', [BIO_SEX_VAR]: 'male' });
  // Margaret is at risk down the maternal line; she conceives via an egg donor.
  person('maunt2', { [nameVarId]: 'Margaret Marsh', [BIO_SEX_VAR]: 'female' });

  // --- Cystic fibrosis — the consanguineous first-cousin union -------------
  // Michael (via Frank, a son of the Marsh grandparents) and Laura (via Nancy,
  // a daughter) are first cousins who partner; their shared Marsh ancestry
  // makes Sophie autozygous, and her unaffected brother Daniel at-risk-homozygous.
  person('c1', { [nameVarId]: 'Michael Marsh', [BIO_SEX_VAR]: 'male' });
  person('c2', { [nameVarId]: 'Laura Doyle', [BIO_SEX_VAR]: 'female' });
  person('cfchild', {
    [nameVarId]: 'Sophie Marsh',
    [BIO_SEX_VAR]: 'female',
    [CF_VAR]: true,
  });
  person('cfsib', { [nameVarId]: 'Daniel Marsh', [BIO_SEX_VAR]: 'male' });

  // --- Egg-donation branch -------------------------------------------------
  // Margaret + Paul use an unaffected egg donor (Ivy). Chloe's genes come from
  // Paul and Ivy; Margaret is her gestational/social mother but contributes no
  // genes — so Chloe escapes the maternal-line conditions Margaret is at risk for.
  person('mhusb', { [nameVarId]: 'Paul Nolan', [BIO_SEX_VAR]: 'male' });
  person('donor', { [nameVarId]: 'Ivy Brooks', [BIO_SEX_VAR]: 'female' });
  person('eggchild', { [nameVarId]: 'Chloe Nolan', [BIO_SEX_VAR]: 'female' });

  // --- Ego household -------------------------------------------------------
  person('ego', {
    [nameVarId]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });
  person('partner', { [nameVarId]: 'Chris Adler', [BIO_SEX_VAR]: 'male' });
  person('son', { [nameVarId]: 'Noah Adler', [BIO_SEX_VAR]: 'male' });
  person('daughter', { [nameVarId]: 'Ava Adler', [BIO_SEX_VAR]: 'female' });

  // --- Adler line — X-linked hypophosphataemia -----------------------------
  // Walter (affected male) passes his single X to every daughter and none to his
  // son, so Paula "will develop it" while Chris — and thus ego's children — are
  // spared. Paula transmits onward to Ethan (at risk).
  person('pf', {
    [nameVarId]: 'Walter Adler',
    [BIO_SEX_VAR]: 'male',
    [XLH_VAR]: true,
  });
  person('pm', { [nameVarId]: 'Diane Adler', [BIO_SEX_VAR]: 'female' });
  person('psis', { [nameVarId]: 'Paula Adler', [BIO_SEX_VAR]: 'female' });
  person('psishusb', { [nameVarId]: 'Greg Foster', [BIO_SEX_VAR]: 'male' });
  person('pnephew', { [nameVarId]: 'Ethan Foster', [BIO_SEX_VAR]: 'male' });

  // --- Edges ---------------------------------------------------------------
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

  // Unions.
  partnerEdge('u-pgf-pgm', 'pgf', 'pgm');
  partnerEdge('u-mgf-mgm', 'mgf', 'mgm');
  partnerEdge('u-mother-father', 'mother', 'father');
  partnerEdge('u-ben-kate', 'brother', 'bwife');
  partnerEdge('u-frank-wendy', 'unc1', 'fwife');
  partnerEdge('u-nancy-robert', 'aunt', 'dhusb');
  partnerEdge('u-c1-c2', 'c1', 'c2'); // the consanguineous first-cousin union
  partnerEdge('u-margaret-paul', 'maunt2', 'mhusb');
  partnerEdge('u-ego-partner', 'ego', 'partner');
  partnerEdge('u-pf-pm', 'pf', 'pm');
  partnerEdge('u-paula-greg', 'psis', 'psishusb');

  // Sullivan descent.
  bioEdge('b-pgf-father', 'pgf', 'father');
  bioEdge('b-pgm-father', 'pgm', 'father');
  bioEdge('b-father-brother', 'father', 'brother');
  bioEdge('b-mother-brother', 'mother', 'brother');
  bioEdge('b-father-ego', 'father', 'ego');
  bioEdge('b-mother-ego', 'mother', 'ego');
  bioEdge('b-brother-nephew', 'brother', 'nephew');
  bioEdge('b-bwife-nephew', 'bwife', 'nephew');

  // Marsh descent.
  bioEdge('b-mgf-mother', 'mgf', 'mother');
  bioEdge('b-mgm-mother', 'mgm', 'mother');
  bioEdge('b-mgf-unc1', 'mgf', 'unc1');
  bioEdge('b-mgm-unc1', 'mgm', 'unc1');
  bioEdge('b-mgf-unc2', 'mgf', 'unc2');
  bioEdge('b-mgm-unc2', 'mgm', 'unc2');
  bioEdge('b-mgf-aunt', 'mgf', 'aunt');
  bioEdge('b-mgm-aunt', 'mgm', 'aunt');
  bioEdge('b-mgf-maunt2', 'mgf', 'maunt2');
  bioEdge('b-mgm-maunt2', 'mgm', 'maunt2');

  // CF cousins.
  bioEdge('b-unc1-c1', 'unc1', 'c1');
  bioEdge('b-fwife-c1', 'fwife', 'c1');
  bioEdge('b-aunt-c2', 'aunt', 'c2');
  bioEdge('b-dhusb-c2', 'dhusb', 'c2');
  bioEdge('b-c1-cfchild', 'c1', 'cfchild');
  bioEdge('b-c2-cfchild', 'c2', 'cfchild');
  bioEdge('b-c1-cfsib', 'c1', 'cfsib');
  bioEdge('b-c2-cfsib', 'c2', 'cfsib');

  // Egg donation: Paul is the genetic father (sperm), Ivy the genetic mother
  // (egg, via a donor edge — genetic but not social), Margaret the gestational/
  // social mother (a social edge, which the genetics engine does not follow).
  si.addManualEdge(edgeType.id, 'b-paul-chloe', 'mhusb', 'eggchild', {
    [REL_TYPE_VAR]: ['biological'],
    [IS_ACTIVE_VAR]: true,
    [GAMETE_ROLE_VAR]: 'sperm',
  });
  si.addManualEdge(edgeType.id, 'd-ivy-chloe', 'donor', 'eggchild', {
    [REL_TYPE_VAR]: ['donor'],
    [IS_ACTIVE_VAR]: true,
    [GAMETE_ROLE_VAR]: 'egg',
  });
  si.addManualEdge(edgeType.id, 's-margaret-chloe', 'maunt2', 'eggchild', {
    [REL_TYPE_VAR]: ['social'],
    [IS_ACTIVE_VAR]: true,
    [IS_GEST_VAR]: true,
  });

  // Ego's children.
  bioEdge('b-ego-son', 'ego', 'son');
  bioEdge('b-partner-son', 'partner', 'son');
  bioEdge('b-ego-daughter', 'ego', 'daughter');
  bioEdge('b-partner-daughter', 'partner', 'daughter');

  // Adler descent.
  bioEdge('b-pf-partner', 'pf', 'partner');
  bioEdge('b-pm-partner', 'pm', 'partner');
  bioEdge('b-pf-psis', 'pf', 'psis');
  bioEdge('b-pm-psis', 'pm', 'psis');
  bioEdge('b-psis-pnephew', 'psis', 'pnephew');
  bioEdge('b-psishusb-pnephew', 'psishusb', 'pnephew');
}

/**
 * Convenience wrapper: a fresh SyntheticInterview seeded with the comprehensive
 * pedigree. Used by the interface's default story, its capture story and the
 * genetics tests; the mutator form above is used where a caller needs to prepend
 * its own stages (the flow example adds an intro screen first).
 */
export function buildComprehensivePedigree(seed: number, showAtRisk = true) {
  const si = new SyntheticInterview(seed);
  addComprehensivePedigree(si, showAtRisk);
  return si;
}
