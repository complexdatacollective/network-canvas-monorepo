import type { BiologicalSex, InheritancePattern } from '@codaco/shared-consts';

import type { ValueGenerator } from '../../constraints/ValueGenerator';
import type {
  FamilyPedigreePlan,
  FamilyPedigreeWeightedCount,
  PedigreeDisease,
  PedigreePerson,
  PedigreeRelationship,
  PedigreeRelationshipToEgo,
  ResolvedFamilyPedigreeGenerationOptions,
} from './types';

type MutablePerson = Omit<PedigreePerson, 'affectedVariables'> & {
  affectedVariables: Set<string>;
};

function sampleWeightedCount(
  valueGen: ValueGenerator,
  distribution: readonly FamilyPedigreeWeightedCount[],
  sizeBiased: boolean,
): number {
  const eligible = distribution.filter(
    ({ value, weight }) => weight > 0 && (!sizeBiased || value > 0),
  );
  const total = eligible.reduce(
    (sum, { value, weight }) =>
      sum + weight * (sizeBiased ? Math.max(value, 0) : 1),
    0,
  );
  if (total <= 0) return sizeBiased ? 1 : 0;

  let cursor = valueGen.randomFloat(0, total);
  for (const { value, weight } of eligible) {
    cursor -= weight * (sizeBiased ? value : 1);
    if (cursor <= 0) return Math.max(0, Math.round(value));
  }
  return Math.max(0, Math.round(eligible.at(-1)?.value ?? 0));
}

function sampledCountSupport(
  distribution: readonly FamilyPedigreeWeightedCount[],
  sizeBiased: boolean,
): number[] {
  const eligible = distribution.filter(
    ({ value, weight }) => weight > 0 && (!sizeBiased || value > 0),
  );
  if (eligible.length === 0) return [sizeBiased ? 1 : 0];
  return [
    ...new Set(eligible.map(({ value }) => Math.max(0, Math.round(value)))),
  ];
}

function nonnegativeProbability(probability: number): number {
  return Number.isNaN(probability) ? 0 : Math.max(0, probability);
}

function reachableScenarios(
  options: ResolvedFamilyPedigreeGenerationOptions,
): FamilyPedigreePlan['scenario'][] {
  if (options.scenario !== 'population') return [options.scenario];

  const reachable: FamilyPedigreePlan['scenario'][] = [];
  let probabilityBefore = 0;
  for (const [scenario, probability] of [
    ['adoption', options.population.scenarios.adoption],
    ['donorConception', options.population.scenarios.donorConception],
    ['surrogacy', options.population.scenarios.surrogacy],
  ] as const) {
    const normalizedProbability = nonnegativeProbability(probability);
    if (probabilityBefore < 1 && normalizedProbability > 0) {
      reachable.push(scenario);
    }
    probabilityBefore += normalizedProbability;
  }
  if (probabilityBefore < 1) reachable.push('none');
  return reachable;
}

function requiredNodesForScenario(
  scenario: FamilyPedigreePlan['scenario'],
): number {
  switch (scenario) {
    case 'none':
      return 7;
    case 'donorConception':
    case 'surrogacy':
      return 8;
    case 'adoption':
      return 9;
    default: {
      const exhaustive: never = scenario;
      throw new Error(`Unsupported pedigree scenario: ${String(exhaustive)}`);
    }
  }
}

export function attainableFamilyPedigreeNodeCeiling(
  options: ResolvedFamilyPedigreeGenerationOptions,
  requiresMaleSibling: boolean,
  requireChildrenContributors: boolean,
): number {
  const familySizeSupport = sampledCountSupport(
    options.population.completedFamilySize,
    true,
  );
  const childCountSupport = sampledCountSupport(
    options.population.completedFamilySize,
    false,
  );
  const sampledSiblingCeiling = Math.max(Math.max(...familySizeSupport) - 1, 0);
  const auntUncleCeiling = sampledSiblingCeiling;
  const cousinCeiling = Math.max(...childCountSupport);
  const collateralCeiling =
    2 * auntUncleCeiling * (1 + (cousinCeiling > 0 ? 1 + cousinCeiling : 0));
  const addWithinSafetyCap = (count: number, additions: number) =>
    Math.max(count, Math.min(options.maxNodes, count + additions));

  return Math.max(
    ...familyPedigreeBranchOutcomes(
      options,
      familySizeSupport,
      childCountSupport,
      requiresMaleSibling,
      requireChildrenContributors,
    ).map(({ count }) => addWithinSafetyCap(count, collateralCeiling)),
  );
}

type FamilyPedigreeBranchOutcome = {
  count: number;
  hasEgoChildren: boolean;
};

/**
 * Every attainable sibling/child prefix before collateral branches are added.
 *
 * Siblings and children are independent population draws. Maximising siblings
 * first can consume just enough of the safety cap to suppress a larger child
 * branch that a smaller supported sibling draw would admit, so ceilings and
 * child-branch feasibility both enumerate their compatible combinations here.
 */
function familyPedigreeBranchOutcomes(
  options: ResolvedFamilyPedigreeGenerationOptions,
  familySizeSupport: readonly number[],
  childCountSupport: readonly number[],
  requiresMaleSibling: boolean,
  requireChildrenContributors: boolean,
): FamilyPedigreeBranchOutcome[] {
  const requiredSiblingCount = requiresMaleSibling ? 1 : 0;
  const contributorAncestry = requireChildrenContributors ? 6 : 0;
  const addWithinSafetyCap = (count: number, additions: number) =>
    Math.max(count, Math.min(options.maxNodes, count + additions));
  const outcomes: FamilyPedigreeBranchOutcome[] = [];

  for (const scenario of reachableScenarios(options)) {
    for (const familySize of familySizeSupport) {
      const sampledSiblingCount = Math.max(familySize - 1, 0);
      const requiredCount =
        requiredNodesForScenario(scenario) + requiredSiblingCount;
      const countWithSiblings = addWithinSafetyCap(
        requiredCount,
        Math.max(sampledSiblingCount - requiredSiblingCount, 0),
      );

      for (const childCount of childCountSupport) {
        if (childCount > 0) {
          const additions = 1 + childCount + contributorAncestry;
          const fits = countWithSiblings + additions <= options.maxNodes;
          outcomes.push({
            count: fits ? countWithSiblings + additions : countWithSiblings,
            hasEgoChildren: fits,
          });
          continue;
        }

        const partnerFits =
          options.population.childlessPartnerProbability > 0 &&
          countWithSiblings < options.maxNodes;
        outcomes.push({
          count: countWithSiblings + (partnerFits ? 1 : 0),
          hasEgoChildren: false,
        });
      }
    }
  }

  return outcomes;
}

function sexFor(valueGen: ValueGenerator, femaleProbability: number) {
  return valueGen.randomFloat(0, 1) < femaleProbability ? 'female' : 'male';
}

function oppositeSex(sex: BiologicalSex): BiologicalSex {
  return sex === 'female' ? 'male' : 'female';
}

export function sampleFamilyPedigreeScenario(
  valueGen: ValueGenerator,
  options: ResolvedFamilyPedigreeGenerationOptions,
): FamilyPedigreePlan['scenario'] {
  if (options.scenario !== 'population') return options.scenario;

  const { adoption, donorConception, surrogacy } = options.population.scenarios;
  const adoptionProbability = nonnegativeProbability(adoption);
  const donorProbability = nonnegativeProbability(donorConception);
  const surrogacyProbability = nonnegativeProbability(surrogacy);
  const draw = valueGen.randomFloat(0, 1);
  if (draw < adoptionProbability) return 'adoption';
  if (draw < adoptionProbability + donorProbability) {
    return 'donorConception';
  }
  if (draw < adoptionProbability + donorProbability + surrogacyProbability) {
    return 'surrogacy';
  }
  return 'none';
}

class PlanBuilder {
  readonly people: MutablePerson[] = [];
  readonly relationships: PedigreeRelationship[] = [];
  private readonly peopleByKey = new Map<string, MutablePerson>();
  private readonly relationshipKeys = new Set<string>();
  private readonly maxNodes: number;

  constructor(maxNodes: number) {
    this.maxNodes = maxNodes;
  }

  person(key: string): MutablePerson | undefined {
    return this.peopleByKey.get(key);
  }

  addPerson(
    key: string,
    generation: number,
    relationshipToEgo: PedigreeRelationshipToEgo | undefined,
    biologicalSex: BiologicalSex,
    required = false,
  ): MutablePerson | undefined {
    const existing = this.peopleByKey.get(key);
    if (existing) return existing;
    if (!required && this.people.length >= this.maxNodes) return undefined;

    const person: MutablePerson = {
      key,
      generation,
      relationshipToEgo,
      biologicalSex,
      affectedVariables: new Set<string>(),
    };
    this.people.push(person);
    this.peopleByKey.set(key, person);
    return person;
  }

  addRelationship(relationship: PedigreeRelationship): void {
    const endpoints =
      relationship.relationshipType === 'partner'
        ? [relationship.from, relationship.to].toSorted().join('::')
        : `${relationship.from}->${relationship.to}`;
    const key = `${relationship.relationshipType}:${endpoints}`;
    if (this.relationshipKeys.has(key)) return;
    this.relationshipKeys.add(key);
    this.relationships.push(relationship);
  }

  addPartner(a: string, b: string, isActive = true): void {
    this.addRelationship({
      from: a,
      to: b,
      relationshipType: 'partner',
      isActive,
    });
  }

  addParentage(eggParent: string, spermParent: string, child: string): void {
    this.addPartner(eggParent, spermParent);
    this.addRelationship({
      from: eggParent,
      to: child,
      relationshipType: 'biological',
      isActive: true,
      isGestationalCarrier: true,
      gameteRole: 'egg',
    });
    this.addRelationship({
      from: spermParent,
      to: child,
      relationshipType: 'biological',
      isActive: true,
      gameteRole: 'sperm',
    });
  }
}

function plantDiseases(
  builder: PlanBuilder,
  diseases: readonly PedigreeDisease[],
  diseaseMode: ResolvedFamilyPedigreeGenerationOptions['diseaseMode'],
): void {
  if (diseaseMode === 'none') return;

  const firstMaleSibling = builder.people.find(
    (person) =>
      person.key.startsWith('sibling-') && person.biologicalSex === 'male',
  );

  const mark = (variable: string, ...keys: (string | undefined)[]) => {
    for (const key of keys) {
      if (!key) continue;
      builder.person(key)?.affectedVariables.add(variable);
    }
  };
  const keysMatching = (
    predicate: (person: MutablePerson) => boolean,
  ): string[] => builder.people.filter(predicate).map((person) => person.key);
  const ego = builder.person('ego');
  const siblingKeys = keysMatching((person) =>
    person.key.startsWith('sibling-'),
  );
  const femaleSiblingKeys = keysMatching(
    (person) =>
      person.key.startsWith('sibling-') && person.biologicalSex === 'female',
  );
  const maleSiblingKeys = keysMatching(
    (person) =>
      person.key.startsWith('sibling-') && person.biologicalSex === 'male',
  );
  const childKeys = keysMatching((person) => person.key.startsWith('child-'));
  const maleChildKeys = keysMatching(
    (person) =>
      person.key.startsWith('child-') && person.biologicalSex === 'male',
  );
  const isGeneticParent = (parent: string, child: string) =>
    builder.relationships.some(
      (relationship) =>
        relationship.from === parent &&
        relationship.to === child &&
        (relationship.relationshipType === 'biological' ||
          relationship.relationshipType === 'donor'),
    );
  const femaleGeneticChildrenOfFather = femaleSiblingKeys.filter((key) =>
    isGeneticParent('father', key),
  );
  const maleGeneticChildrenOfFather = maleSiblingKeys.filter((key) =>
    isGeneticParent('father', key),
  );

  for (const { variable, inheritancePattern } of diseases) {
    switch (inheritancePattern) {
      case 'autosomalDominant':
        mark(variable, 'maternal-grandmother', 'mother', 'ego');
        break;
      case 'autosomalRecessive':
        mark(variable, 'maternal-grandfather', firstMaleSibling?.key ?? 'ego');
        break;
      case 'xLinkedRecessive':
        mark(
          variable,
          'maternal-grandfather',
          firstMaleSibling?.key ??
            (builder.person('ego')?.biologicalSex === 'male'
              ? 'ego'
              : undefined),
        );
        break;
      case 'xLinkedDominant':
        mark(
          variable,
          'paternal-grandmother',
          'father',
          ego?.biologicalSex === 'female' ? 'ego' : undefined,
          ...femaleGeneticChildrenOfFather,
        );
        break;
      case 'yLinked':
        mark(
          variable,
          'paternal-grandfather',
          'father',
          ego?.biologicalSex === 'male' ? 'ego' : undefined,
          ...maleGeneticChildrenOfFather,
          ...(ego?.biologicalSex === 'male' ? maleChildKeys : []),
        );
        break;
      case 'mitochondrial':
        mark(
          variable,
          'maternal-grandmother',
          'mother',
          'ego',
          ...siblingKeys,
          ...(ego?.biologicalSex === 'female' ? childKeys : []),
        );
        break;
      case 'multifactorial':
      case 'unknown':
        mark(variable, 'maternal-grandmother', 'mother', 'ego');
        break;
      default: {
        const exhaustive: never = inheritancePattern;
        throw new Error(
          `Unsupported inheritance pattern: ${String(exhaustive)}`,
        );
      }
    }
  }
}

function hasPattern(
  diseases: readonly PedigreeDisease[],
  pattern: InheritancePattern,
): boolean {
  return diseases.some((disease) => disease.inheritancePattern === pattern);
}

export function generateFamilyPedigreePlan(
  valueGen: ValueGenerator,
  options: ResolvedFamilyPedigreeGenerationOptions,
  diseases: readonly PedigreeDisease[],
  requireChildrenContributors: boolean,
  egoBiologicalSex?: BiologicalSex,
): FamilyPedigreePlan {
  const builder = new PlanBuilder(options.maxNodes);
  const { population } = options;
  const drawSex = () => sexFor(valueGen, population.femaleAtBirthProbability);
  const scenario = sampleFamilyPedigreeScenario(valueGen, options);

  // The seven-person core guarantees two genetic parents and two genetic
  // parents for each of them, satisfying the interface's hard minimum and its
  // grandparent boundary independently of any optional collateral branches.
  builder.addPerson('maternal-grandmother', -2, 'Grandparent', 'female', true);
  builder.addPerson('maternal-grandfather', -2, 'Grandparent', 'male', true);
  builder.addPerson('paternal-grandmother', -2, 'Grandparent', 'female', true);
  builder.addPerson('paternal-grandfather', -2, 'Grandparent', 'male', true);
  builder.addPerson('mother', -1, 'Parent', 'female', true);
  builder.addPerson(
    'father',
    -1,
    scenario === 'donorConception' ? 'Donor' : 'Parent',
    'male',
    true,
  );
  const egoSex = egoBiologicalSex ?? drawSex();
  builder.addPerson('ego', 0, undefined, egoSex, true);

  builder.addParentage(
    'maternal-grandmother',
    'maternal-grandfather',
    'mother',
  );
  builder.addParentage(
    'paternal-grandmother',
    'paternal-grandfather',
    'father',
  );
  let siblingSpermParent = 'father';
  if (scenario === 'donorConception') {
    builder.addPerson('intended-father', -1, 'Social Parent', 'male', true);
    builder.addPartner('mother', 'intended-father');
    builder.addRelationship({
      from: 'mother',
      to: 'ego',
      relationshipType: 'biological',
      isActive: true,
      isGestationalCarrier: true,
      gameteRole: 'egg',
    });
    builder.addRelationship({
      from: 'father',
      to: 'ego',
      relationshipType: 'donor',
      isActive: true,
      gameteRole: 'sperm',
    });
    siblingSpermParent = 'intended-father';
  } else {
    builder.addParentage('mother', 'father', 'ego');
  }

  if (scenario === 'adoption') {
    builder.addPerson('adoptive-mother', -1, 'Parent', 'female', true);
    builder.addPerson('adoptive-father', -1, 'Parent', 'male', true);
    builder.addPartner('adoptive-mother', 'adoptive-father');
    for (const key of ['adoptive-mother', 'adoptive-father']) {
      builder.addRelationship({
        from: key,
        to: 'ego',
        relationshipType: 'adoptive',
        isActive: true,
      });
    }
  } else if (scenario === 'donorConception') {
    // The intended father is the mother's partner and the siblings' genetic
    // father, but is a social parent to this donor-conceived ego. The donor's
    // own parents are the paternal grandparents in the genetic pedigree.
    builder.addRelationship({
      from: 'intended-father',
      to: 'ego',
      relationshipType: 'social',
      isActive: true,
    });
  } else if (scenario === 'surrogacy') {
    builder.addPerson('gestational-surrogate', -1, 'Surrogate', 'female', true);
    const maternalEdge = builder.relationships.find(
      (edge) =>
        edge.from === 'mother' &&
        edge.to === 'ego' &&
        edge.relationshipType === 'biological',
    );
    if (maternalEdge) delete maternalEdge.isGestationalCarrier;
    builder.addRelationship({
      from: 'gestational-surrogate',
      to: 'ego',
      relationshipType: 'surrogate',
      isActive: true,
      isGestationalCarrier: true,
    });
  }

  const siblingFamilySize = sampleWeightedCount(
    valueGen,
    population.completedFamilySize,
    true,
  );
  let siblingIndex = 0;

  // A female ego cannot display an X-linked recessive transmission with only
  // the seven-person core. Add one affected brother before optional siblings
  // so the scenario remains coherent even at a tight node budget.
  if (
    options.diseaseMode === 'visualization' &&
    hasPattern(diseases, 'xLinkedRecessive') &&
    egoSex !== 'male'
  ) {
    const sibling = builder.addPerson(
      `sibling-${String(siblingIndex++)}`,
      0,
      'Sibling',
      'male',
      true,
    );
    if (sibling)
      builder.addParentage('mother', siblingSpermParent, sibling.key);
  }

  const alreadyAddedSiblings = siblingIndex;
  const sampledSiblings = Math.max(siblingFamilySize - 1, 0);
  for (let i = alreadyAddedSiblings; i < sampledSiblings; i++) {
    const sibling = builder.addPerson(
      `sibling-${String(siblingIndex++)}`,
      0,
      'Sibling',
      drawSex(),
    );
    if (!sibling) break;
    builder.addParentage('mother', siblingSpermParent, sibling.key);
  }

  const egoChildCount = sampleWeightedCount(
    valueGen,
    population.completedFamilySize,
    false,
  );
  let egoPartner: MutablePerson | undefined;
  const requiredContributorAncestry = requireChildrenContributors ? 6 : 0;
  const completeChildBranchFits =
    egoChildCount > 0 &&
    builder.people.length + 1 + egoChildCount + requiredContributorAncestry <=
      options.maxNodes;
  const addChildlessPartner =
    egoChildCount === 0 &&
    valueGen.randomFloat(0, 1) < population.childlessPartnerProbability;

  if (completeChildBranchFits || addChildlessPartner) {
    egoPartner = builder.addPerson(
      'ego-partner',
      0,
      'Partner',
      oppositeSex(egoSex),
    );
    if (egoPartner) builder.addPartner('ego', egoPartner.key);
  }

  // A required children-contributors boundary follows the co-parent up two
  // generations. `completeChildBranchFits` admits children only when this
  // entire ancestry can fit, so the generated interview never stops halfway
  // through a required boundary.
  if (egoPartner && egoChildCount > 0 && requireChildrenContributors) {
    builder.addPerson('partner-mother', -1, undefined, 'female');
    builder.addPerson('partner-father', -1, undefined, 'male');
    builder.addPerson('partner-maternal-grandmother', -2, undefined, 'female');
    builder.addPerson('partner-maternal-grandfather', -2, undefined, 'male');
    builder.addPerson('partner-paternal-grandmother', -2, undefined, 'female');
    builder.addPerson('partner-paternal-grandfather', -2, undefined, 'male');
    builder.addParentage(
      'partner-maternal-grandmother',
      'partner-maternal-grandfather',
      'partner-mother',
    );
    builder.addParentage(
      'partner-paternal-grandmother',
      'partner-paternal-grandfather',
      'partner-father',
    );
    builder.addParentage('partner-mother', 'partner-father', egoPartner.key);
  }

  if (egoPartner) {
    for (let i = 0; i < egoChildCount; i++) {
      const child = builder.addPerson(
        `child-${String(i)}`,
        1,
        'Child',
        drawSex(),
      );
      if (!child) continue;
      if (egoSex === 'female')
        builder.addParentage('ego', egoPartner.key, child.key);
      else builder.addParentage(egoPartner.key, 'ego', child.key);
    }
  }

  const addCollateralBranch = (
    side: 'maternal' | 'paternal',
    eggGrandparent: string,
    spermGrandparent: string,
  ) => {
    const familySize = sampleWeightedCount(
      valueGen,
      population.completedFamilySize,
      true,
    );
    const auntUncleCount = Math.max(familySize - 1, 0);

    for (let i = 0; i < auntUncleCount; i++) {
      const relative = builder.addPerson(
        `${side}-aunt-uncle-${String(i)}`,
        -1,
        'Aunt/Uncle',
        drawSex(),
      );
      if (!relative) break;
      builder.addParentage(eggGrandparent, spermGrandparent, relative.key);

      const cousinCount = sampleWeightedCount(
        valueGen,
        population.completedFamilySize,
        false,
      );
      if (cousinCount === 0) continue;

      const partner = builder.addPerson(
        `${side}-aunt-uncle-partner-${String(i)}`,
        -1,
        undefined,
        oppositeSex(relative.biologicalSex),
      );
      if (!partner) continue;
      builder.addPartner(relative.key, partner.key);

      for (let childIndex = 0; childIndex < cousinCount; childIndex++) {
        const cousin = builder.addPerson(
          `${side}-cousin-${String(i)}-${String(childIndex)}`,
          0,
          'Cousin',
          drawSex(),
        );
        if (!cousin) break;
        if (relative.biologicalSex === 'female') {
          builder.addParentage(relative.key, partner.key, cousin.key);
        } else {
          builder.addParentage(partner.key, relative.key, cousin.key);
        }
      }
    }
  };

  addCollateralBranch(
    'maternal',
    'maternal-grandmother',
    'maternal-grandfather',
  );
  addCollateralBranch(
    'paternal',
    'paternal-grandmother',
    'paternal-grandfather',
  );

  plantDiseases(builder, diseases, options.diseaseMode);

  const ego = builder.person('ego');
  const orderedPeople = ego
    ? [ego, ...builder.people.filter((person) => person.key !== 'ego')]
    : builder.people;

  return {
    people: orderedPeople,
    relationships: builder.relationships,
    egoKey: 'ego',
    scenario,
    hasEgoChildren: builder.people.some((person) =>
      person.key.startsWith('child-'),
    ),
  };
}
