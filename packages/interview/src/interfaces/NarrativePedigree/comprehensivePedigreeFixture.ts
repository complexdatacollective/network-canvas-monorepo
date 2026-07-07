import { SyntheticInterview } from '@codaco/protocol-utilities';

// Shared fixture for the NarrativePedigree examples: one integrated five-
// generation family whose six conditions all reach ego's own household, so the
// interface reads as a single lived pedigree rather than six disjoint demos.
// Kept separate from any *.stories file so it can be composed into different
// stage sequences (the interface's own default story, its capture story, and
// the FamilyPedigree→NarrativePedigree flow example).
//
// Names follow North-American patrilineal convention — a wife takes her
// husband's surname, children take their father's, a married-in spouse brings
// their own. That convention is itself part of the demonstration: ego's parents
// are first cousins BORN with different surnames (Marsh vs Bauer) because one
// descends through a son and the other through a daughter of the shared Marsh
// great-grandparents. (Rose's displayed name is her married surname "Marsh",
// which coincidentally matches David's; the "Bauer" birth surname shows only in
// the `née Bauer` annotations below, not in the rendered pedigree.)

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

// SyntheticInterview.getNetwork() may fill an unset boolean on a manual node, so
// every condition flag (and the ego flag) is seeded false by default and only
// the affected/ego nodes override it — keeping the pedigree deterministic.
const BOOL_DEFAULTS = {
  [EGO_VAR]: false,
  [HD_VAR]: false,
  [CF_VAR]: false,
  [HAEM_VAR]: false,
  [XLH_VAR]: false,
  [YHL_VAR]: false,
  [MITO_VAR]: false,
};

/**
 * Add the shared comprehensive pedigree to `si`: the Person node type and Family
 * edge type, a FamilyPedigree source stage, a NarrativePedigree stage, and the
 * seeded five-generation network. Every condition is routed so it reaches ego,
 * her partner, or her children — the pedigree is deliberately ego-centric:
 *
 *  - Huntington's (autosomal dominant): George Bauer → Rose affected; the whole
 *    maternal descent (ego and her children) is at risk — a late-onset dominant
 *    sweeping down a line.
 *  - Cystic fibrosis (autosomal recessive): ego's parents Rose & David are FIRST
 *    COUSINS (both descend from the Marsh great-grandparents), so ego's affected
 *    sibling Sam makes them obligate carriers and ego herself at-risk-homozygous.
 *    The consanguinity is the lesson. NOTE: because ego's parents are obligate
 *    carriers, the engine also marks BOTH grandparents (Nancy + George) as
 *    at-risk carriers, which makes ego's aunt/uncles (Margaret, Thomas, Robert)
 *    show the at-risk-homozygous marker too — a known over-flag of the
 *    research-gated homozygous rule (it fires on any child of two at-risk-carrier
 *    parents, regardless of how certain that carriage is). This is pre-existing
 *    engine behaviour, not specific to this fixture.
 *  - Haemophilia A (X-linked recessive): ego's maternal uncle Thomas is affected,
 *    making his mother Nancy an OBLIGATE carrier; the carrier-female line reaches
 *    Rose, ego (may carry) and her son Noah (may develop).
 *  - X-linked hypophosphataemia (X-linked dominant): ego's father David is an
 *    affected male, so every daughter — ego — "will develop it"; ego then
 *    transmits it to both of her children.
 *  - Y-linked hearing loss (Y-linked): the partner's Adler male line Walter →
 *    Chris is affected, so ego's son Noah "will develop it"; ego's daughter (no
 *    Y) is untouched.
 *  - Mitochondrial myopathy (mitochondrial): Eleanor Marsh affected → the whole
 *    maternal line (Nancy → Rose → ego → her children) is at risk. Built-in
 *    contrast: ego's aunt Margaret, also at risk, conceives Chloe by MITOCHONDRIAL
 *    DONATION (a donor egg supplies the mtDNA) — so Chloe escapes the mito
 *    condition while still inheriting Margaret's autosomes (she stays at risk for
 *    Huntington's).
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
    // 'social' and 'donor' are needed by the mitochondrial-donation branch: the
    // donor egg carries mtDNA, the intended mother's egg carries the nucleus.
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
    si.addManualNode(fpId, nodeType.id, uid, { ...BOOL_DEFAULTS, ...attrs });

  // --- Gen I: the shared Marsh great-grandparents --------------------------
  // Eleanor founds the mitochondrial line. Arthur + Eleanor are the common
  // ancestors that make ego's parents first cousins (the CF consanguinity).
  person('ggf', { [nameVarId]: 'Arthur Marsh', [BIO_SEX_VAR]: 'male' });
  person('ggm', {
    [nameVarId]: 'Eleanor Marsh',
    [BIO_SEX_VAR]: 'female',
    [MITO_VAR]: true,
  });

  // --- Gen II: ego's grandparents (a Marsh sibling pair + married-in spouses)
  // Nancy (Eleanor's daughter) and Frank (Eleanor's son) are siblings; their
  // children Rose and David marry, which is the consanguineous union.
  person('mgm', { [nameVarId]: 'Nancy Bauer', [BIO_SEX_VAR]: 'female' }); // née Marsh
  person('mgf', {
    [nameVarId]: 'George Bauer',
    [BIO_SEX_VAR]: 'male',
    [HD_VAR]: true,
  });
  person('pgf', { [nameVarId]: 'Frank Marsh', [BIO_SEX_VAR]: 'male' });
  person('pgm', { [nameVarId]: 'Irene Marsh', [BIO_SEX_VAR]: 'female' });

  // --- Gen III: ego's parents (first cousins), aunt, uncle, partner's parents
  person('mother', {
    [nameVarId]: 'Rose Marsh',
    [BIO_SEX_VAR]: 'female',
    [HD_VAR]: true,
  }); // née Bauer
  person('father', {
    [nameVarId]: 'David Marsh',
    [BIO_SEX_VAR]: 'male',
    [XLH_VAR]: true,
  });
  // Ego's maternal aunt Margaret — at risk down the maternal (mito) line; she
  // conceives by mitochondrial donation.
  person('maunt', { [nameVarId]: 'Margaret Nolan', [BIO_SEX_VAR]: 'female' }); // née Bauer
  person('mhusb', { [nameVarId]: 'Paul Nolan', [BIO_SEX_VAR]: 'male' });
  // Ego's maternal uncles Thomas and Robert — two affected haemophiliac brothers,
  // which makes their mother Nancy an OBLIGATE carrier (the classic pattern).
  person('muncle', {
    [nameVarId]: 'Thomas Bauer',
    [BIO_SEX_VAR]: 'male',
    [HAEM_VAR]: true,
  });
  person('muncle2', {
    [nameVarId]: 'Robert Bauer',
    [BIO_SEX_VAR]: 'male',
    [HAEM_VAR]: true,
  });
  // The mitochondrial-egg donor (an unaffected outsider).
  person('donor', { [nameVarId]: 'Ivy Brooks', [BIO_SEX_VAR]: 'female' });
  // Partner's Adler line — Y-linked hearing loss.
  person('pf', {
    [nameVarId]: 'Walter Adler',
    [BIO_SEX_VAR]: 'male',
    [YHL_VAR]: true,
  });
  person('pm', { [nameVarId]: 'Diane Adler', [BIO_SEX_VAR]: 'female' });

  // --- Gen IV: ego's household, ego's affected sibling, the MRT child -------
  person('ego', {
    [nameVarId]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });
  // Ego's brother Sam is affected with cystic fibrosis (autozygous via the
  // cousin union), making Rose & David obligate carriers and ego at-risk.
  person('sib', {
    [nameVarId]: 'Sam Marsh',
    [BIO_SEX_VAR]: 'male',
    [CF_VAR]: true,
  });
  person('partner', {
    [nameVarId]: 'Chris Adler',
    [BIO_SEX_VAR]: 'male',
    [YHL_VAR]: true,
  });
  // Chloe — Margaret's daughter by mitochondrial donation. Nucleus from
  // Margaret, mtDNA from the donor Ivy, sperm from Paul.
  person('mrtchild', { [nameVarId]: 'Chloe Nolan', [BIO_SEX_VAR]: 'female' });

  // --- Gen V: ego's children -----------------------------------------------
  person('son', { [nameVarId]: 'Noah Adler', [BIO_SEX_VAR]: 'male' });
  person('daughter', { [nameVarId]: 'Ava Adler', [BIO_SEX_VAR]: 'female' });

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
  partnerEdge('u-ggf-ggm', 'ggf', 'ggm');
  partnerEdge('u-mgm-mgf', 'mgm', 'mgf');
  partnerEdge('u-pgf-pgm', 'pgf', 'pgm');
  partnerEdge('u-mother-father', 'mother', 'father'); // consanguineous first cousins
  partnerEdge('u-maunt-paul', 'maunt', 'mhusb');
  partnerEdge('u-ego-partner', 'ego', 'partner');
  partnerEdge('u-pf-pm', 'pf', 'pm');

  // Gen I → II: Eleanor + Arthur's two children (Nancy and Frank).
  bioEdge('b-ggf-mgm', 'ggf', 'mgm');
  bioEdge('b-ggm-mgm', 'ggm', 'mgm');
  bioEdge('b-ggf-pgf', 'ggf', 'pgf');
  bioEdge('b-ggm-pgf', 'ggm', 'pgf');

  // Gen II → III: Rose + Margaret + Thomas via Nancy & George; David via Frank
  // & Irene.
  bioEdge('b-mgm-mother', 'mgm', 'mother');
  bioEdge('b-mgf-mother', 'mgf', 'mother');
  bioEdge('b-mgm-maunt', 'mgm', 'maunt');
  bioEdge('b-mgf-maunt', 'mgf', 'maunt');
  bioEdge('b-mgm-muncle', 'mgm', 'muncle');
  bioEdge('b-mgf-muncle', 'mgf', 'muncle');
  bioEdge('b-mgm-muncle2', 'mgm', 'muncle2');
  bioEdge('b-mgf-muncle2', 'mgf', 'muncle2');
  bioEdge('b-pgf-father', 'pgf', 'father');
  bioEdge('b-pgm-father', 'pgm', 'father');

  // Gen III → IV: ego + Sam via Rose & David; Chris via Walter & Diane.
  bioEdge('b-mother-ego', 'mother', 'ego');
  bioEdge('b-father-ego', 'father', 'ego');
  bioEdge('b-mother-sib', 'mother', 'sib');
  bioEdge('b-father-sib', 'father', 'sib');
  bioEdge('b-pf-partner', 'pf', 'partner');
  bioEdge('b-pm-partner', 'pm', 'partner');

  // Mitochondrial donation → Chloe. The intended mother Margaret supplies the
  // egg NUCLEUS (a biological egg), the donor Ivy supplies the egg CYTOPLASM /
  // mtDNA (a donor egg), Paul supplies the sperm. Because two egg edges reach
  // Chloe, the genetics engine routes her mtDNA down the donor's line while her
  // nuclear genome comes from Margaret + Paul.
  si.addManualEdge(edgeType.id, 'e-maunt-chloe', 'maunt', 'mrtchild', {
    [REL_TYPE_VAR]: ['biological'],
    [IS_ACTIVE_VAR]: true,
    [GAMETE_ROLE_VAR]: 'egg',
  });
  si.addManualEdge(edgeType.id, 'e-donor-chloe', 'donor', 'mrtchild', {
    [REL_TYPE_VAR]: ['donor'],
    [IS_ACTIVE_VAR]: true,
    [GAMETE_ROLE_VAR]: 'egg',
  });
  si.addManualEdge(edgeType.id, 'e-paul-chloe', 'mhusb', 'mrtchild', {
    [REL_TYPE_VAR]: ['biological'],
    [IS_ACTIVE_VAR]: true,
    [GAMETE_ROLE_VAR]: 'sperm',
  });

  // Gen IV → V: ego's children.
  bioEdge('b-ego-son', 'ego', 'son');
  bioEdge('b-partner-son', 'partner', 'son');
  bioEdge('b-ego-daughter', 'ego', 'daughter');
  bioEdge('b-partner-daughter', 'partner', 'daughter');
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
