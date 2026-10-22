import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { PedigreeSexAssignedAtBirth } from '@codaco/protocol-validation';

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
//
// The source stage is a Family Pedigree, which binds its own person and
// relationship attributes; the family is seeded through them, as the stage
// records a family the participant draws.

// One boolean person attribute per condition, each set by one of the Family
// Pedigree's nomination prompts.
const HD_VAR = 'hasHuntingtons'; // autosomal dominant
const CF_VAR = 'hasCysticFibrosis'; // autosomal recessive
const HAEM_VAR = 'hasHaemophilia'; // X-linked recessive
const XLH_VAR = 'hasHypophosphataemia'; // X-linked dominant
const YHL_VAR = 'hasYLinkedHearingLoss'; // Y-linked
const MITO_VAR = 'hasMitochondrialMyopathy'; // mitochondrial

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
 *    sibling Sam makes them obligate carriers and ego herself at-risk-affected
 *    (25%, a full sibling of the affected with both carrier parents recorded).
 *    The consanguinity is the lesson.
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
 *    maternal line (Nancy → Rose → ego → her children) is at risk.
 *
 * The stages are appended in order (FamilyPedigree then NarrativePedigree), so a
 * caller that prepends its own stages knows the resulting indices by construction.
 *
 * The default pedigree contains only structure a participant can actually build
 * on the Family Pedigree (at most one genetic parent recorded female at birth,
 * so one egg, per child). Mitochondrial replacement therapy (MRT) — a child
 * conceived from TWO eggs, the donor's supplying the mtDNA — is NOT reachable
 * through that participant interface; it is demonstrated only with seeded or
 * imported interview data, where a child has two genetic parents recorded female
 * at birth, one of them a donor. Pass `includeMrtBranch` to add that seeded/imported
 * contrast: ego's aunt Margaret (also at risk down the maternal line) conceives
 * Chloe by mitochondrial donation (a donor egg supplies the mtDNA), so Chloe
 * escapes the mito condition while still inheriting Margaret's autosomes (she stays
 * at risk for Huntington's).
 *
 * @param showAtRisk  Whether the NarrativePedigree stage shows the at-risk
 *   (probabilistic) statuses. Defaults to `true` so every status is visible.
 * @param includeMrtBranch  Whether to add the mitochondrial-donation (MRT) branch
 *   (donor Ivy, child Chloe, and the two-egg parentage edges). Defaults to `false`
 *   so the default pedigree stays participant-reachable; the dedicated MRT story
 *   sets it `true`.
 */
export function addComprehensivePedigree(
  si: SyntheticInterview,
  showAtRisk = true,
  includeMrtBranch = false,
): void {
  const people = si.addNodeType({ name: 'Person' });

  const fpStage = si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    subject: { entity: 'node', type: people.id },
    framing: 'gamete',
    prompt: 'Build your family pedigree.',
    nominationPrompts: [
      { text: "Who has Huntington's disease?", variableName: HD_VAR },
      { text: 'Who has cystic fibrosis?', variableName: CF_VAR },
      { text: 'Who has haemophilia?', variableName: HAEM_VAR },
      { text: 'Who has X-linked hypophosphataemia?', variableName: XLH_VAR },
      { text: 'Who has Y-linked hearing loss?', variableName: YHL_VAR },
      { text: 'Who has mitochondrial myopathy?', variableName: MITO_VAR },
    ],
  });
  const [hd, cf, haem, xlh, yhl, mito] = fpStage.nominations;
  if (!hd || !cf || !haem || !xlh || !yhl || !mito) {
    throw new Error('The Family Pedigree is missing a nomination prompt');
  }
  // Circles for women, squares for men, diamonds for anyone else, as the
  // researcher might map the person type's shape in the codebook.
  const genderIdentity = fpStage.genderIdentity;
  if (genderIdentity) {
    people.setShape({
      default: 'diamond',
      dynamic: {
        variable: genderIdentity,
        type: 'discrete',
        map: [
          { value: 'woman', shape: 'circle' },
          { value: 'man', shape: 'square' },
        ],
      },
    });
  }

  si.addStage('NarrativePedigree', {
    label: 'Inheritance Pathways',
    sourceStageId: fpStage.id,
    showAtRiskStatuses: showAtRisk,
    diseases: [
      {
        id: 'huntingtons',
        label: "Huntington's Disease",
        color: 'node-color-seq-1',
        attribute: hd,
        inheritancePattern: 'autosomalDominant',
      },
      {
        id: 'cysticFibrosis',
        label: 'Cystic Fibrosis',
        color: 'node-color-seq-3',
        attribute: cf,
        inheritancePattern: 'autosomalRecessive',
      },
      {
        id: 'haemophilia',
        label: 'Haemophilia A',
        color: 'node-color-seq-6',
        attribute: haem,
        inheritancePattern: 'xLinkedRecessive',
      },
      {
        id: 'hypophosphataemia',
        label: 'X-linked Hypophosphataemia',
        color: 'node-color-seq-4',
        attribute: xlh,
        inheritancePattern: 'xLinkedDominant',
      },
      {
        id: 'yLinkedHearingLoss',
        label: 'Y-linked Hearing Loss',
        color: 'node-color-seq-7',
        attribute: yhl,
        inheritancePattern: 'yLinked',
      },
      {
        id: 'mitochondrial',
        label: 'Mitochondrial Myopathy',
        color: 'node-color-seq-5',
        attribute: mito,
        inheritancePattern: 'mitochondrial',
      },
    ],
  });

  // The condition each attribute marks, for seeding who is affected.
  const conditions = {
    [HD_VAR]: hd,
    [CF_VAR]: cf,
    [HAEM_VAR]: haem,
    [XLH_VAR]: xlh,
    [YHL_VAR]: yhl,
    [MITO_VAR]: mito,
  };
  // SyntheticInterview.getNetwork() may fill an unset boolean on a manual node,
  // so every condition flag (and the participant marker) is seeded false by
  // default and only the affected people and the participant override it —
  // keeping the pedigree deterministic.
  const boolDefaults = {
    [fpStage.ego]: false,
    ...Object.fromEntries(Object.values(conditions).map((id) => [id, false])),
  };

  type Seed = {
    name: string;
    sex: PedigreeSexAssignedAtBirth;
    gender: 'woman' | 'man';
    isEgo?: boolean;
    affected?: (keyof typeof conditions)[];
  };
  const person = (uid: string, seed: Seed) =>
    si.addManualNode(fpStage.id, people.id, uid, {
      ...boolDefaults,
      [fpStage.name]: seed.name,
      [fpStage.sexAssignedAtBirth]: [seed.sex],
      ...(genderIdentity ? { [genderIdentity]: [seed.gender] } : {}),
      ...(seed.isEgo ? { [fpStage.ego]: true } : {}),
      ...Object.fromEntries(
        (seed.affected ?? []).map((condition) => [conditions[condition], true]),
      ),
    });

  // --- Gen I: the shared Marsh great-grandparents --------------------------
  // Eleanor founds the mitochondrial line. Arthur + Eleanor are the common
  // ancestors that make ego's parents first cousins (the CF consanguinity).
  person('ggf', {
    name: 'Arthur Marsh',
    sex: 'male',
    gender: 'man',
  });
  person('ggm', {
    name: 'Eleanor Marsh',
    sex: 'female',
    gender: 'woman',
    affected: [MITO_VAR],
  });

  // --- Gen II: ego's grandparents (a Marsh sibling pair + married-in spouses)
  // Nancy (Eleanor's daughter) and Frank (Eleanor's son) are siblings; their
  // children Rose and David marry, which is the consanguineous union.
  person('mgm', {
    name: 'Nancy Bauer',
    sex: 'female',
    gender: 'woman',
  }); // née Marsh
  person('mgf', {
    name: 'George Bauer',
    sex: 'male',
    gender: 'man',
    affected: [HD_VAR],
  });
  person('pgf', {
    name: 'Frank Marsh',
    sex: 'male',
    gender: 'man',
  });
  person('pgm', {
    name: 'Irene Marsh',
    sex: 'female',
    gender: 'woman',
  });

  // --- Gen III: ego's parents (first cousins), aunt, uncle, partner's parents
  person('mother', {
    name: 'Rose Marsh',
    sex: 'female',
    gender: 'woman',
    affected: [HD_VAR],
  }); // née Bauer
  person('father', {
    name: 'David Marsh',
    sex: 'male',
    gender: 'man',
    affected: [XLH_VAR],
  });
  // Ego's maternal aunt Margaret — at risk down the maternal (mito) line. In the
  // MRT branch she conceives Chloe by mitochondrial donation.
  person('maunt', {
    name: 'Margaret Nolan',
    sex: 'female',
    gender: 'woman',
  }); // née Bauer
  person('mhusb', {
    name: 'Paul Nolan',
    sex: 'male',
    gender: 'man',
  });
  // Ego's maternal uncles Thomas and Robert — two affected haemophiliac brothers,
  // which makes their mother Nancy an OBLIGATE carrier (the classic pattern).
  person('muncle', {
    name: 'Thomas Bauer',
    sex: 'male',
    gender: 'man',
    affected: [HAEM_VAR],
  });
  person('muncle2', {
    name: 'Robert Bauer',
    sex: 'male',
    gender: 'man',
    affected: [HAEM_VAR],
  });
  // The mitochondrial-egg donor (an unaffected outsider) — MRT branch only.
  if (includeMrtBranch) {
    person('donor', {
      name: 'Ivy Brooks',
      sex: 'female',
      gender: 'woman',
    });
  }
  // Partner's Adler line — Y-linked hearing loss.
  person('pf', {
    name: 'Walter Adler',
    sex: 'male',
    gender: 'man',
    affected: [YHL_VAR],
  });
  person('pm', {
    name: 'Diane Adler',
    sex: 'female',
    gender: 'woman',
  });

  // --- Gen IV: ego's household + ego's affected sibling (MRT child below) ---
  person('ego', {
    name: 'You',
    sex: 'female',
    gender: 'woman',
    isEgo: true,
  });
  // Ego's brother Sam is affected with cystic fibrosis (autozygous via the
  // cousin union), making Rose & David obligate carriers and ego at-risk.
  person('sib', {
    name: 'Sam Marsh',
    sex: 'male',
    gender: 'man',
    affected: [CF_VAR],
  });
  person('partner', {
    name: 'Chris Adler',
    sex: 'male',
    gender: 'man',
    affected: [YHL_VAR],
  });
  // Chloe — Margaret's daughter by mitochondrial donation (MRT branch only).
  // Nucleus from Margaret, mtDNA from the donor Ivy, sperm from Paul.
  if (includeMrtBranch) {
    person('mrtchild', {
      name: 'Chloe Nolan',
      sex: 'female',
      gender: 'woman',
    });
  }

  // --- Gen V: ego's children -----------------------------------------------
  person('son', {
    name: 'Noah Adler',
    sex: 'male',
    gender: 'man',
  });
  person('daughter', {
    name: 'Ava Adler',
    sex: 'female',
    gender: 'woman',
  });

  // --- Edges ---------------------------------------------------------------
  const parentEdge = (
    uid: string,
    from: string,
    to: string,
    kind: 'biological' | 'donor' = 'biological',
  ) =>
    si.addManualEdge(fpStage.edgeType, uid, from, to, {
      [fpStage.kind]: [kind],
      [fpStage.gestationalCarrier]: false,
    });
  const bioEdge = (uid: string, from: string, to: string) =>
    parentEdge(uid, from, to);
  const partnerEdge = (uid: string, a: string, b: string) =>
    si.addManualEdge(fpStage.edgeType, uid, a, b, {
      [fpStage.kind]: ['partner'],
      [fpStage.currentPartner]: true,
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

  // Mitochondrial donation → Chloe (MRT branch only). The intended mother
  // Margaret supplies the egg NUCLEUS (a biological parent), the donor Ivy
  // supplies the egg CYTOPLASM / mtDNA (a donor), Paul supplies the sperm. Both
  // women are recorded female at birth, so each gave an egg; with two eggs the
  // genetics engine routes Chloe's mtDNA down the donor's line while her nuclear
  // genome comes from Margaret + Paul. A participant cannot give a child two
  // genetic parents recorded female on the Family Pedigree, so this branch is
  // seeded/imported only.
  if (includeMrtBranch) {
    bioEdge('e-maunt-chloe', 'maunt', 'mrtchild');
    parentEdge('e-donor-chloe', 'donor', 'mrtchild', 'donor');
    bioEdge('e-paul-chloe', 'mhusb', 'mrtchild');
  }

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
 *
 * @param includeMrtBranch  Forwarded to `addComprehensivePedigree`; defaults to
 *   `false` so the built pedigree is participant-reachable.
 */
export function buildComprehensivePedigree(
  seed: number,
  showAtRisk = true,
  includeMrtBranch = false,
) {
  const si = new SyntheticInterview(seed);
  addComprehensivePedigree(si, showAtRisk, includeMrtBranch);
  return si;
}
