/**
 * Structural invariants of a family pedigree, in one place.
 *
 * These rules were previously enforced only inside the interview runtime's
 * pedigree store, which throws when one is broken. Nothing checked them
 * anywhere else, so a synthetic generator could — and did — produce pedigrees
 * with several probands, two-valued sexes, and children with a single parent,
 * all of which passed schema validation because the schema constrains variable
 * *types*, not the relationships between them.
 *
 * Keeping the rules here lets the generator, its tests, and the runtime agree
 * by construction rather than by resemblance.
 */

import { BIOLOGICAL_SEX_VALUES } from './family-pedigree.ts';

export type PedigreeStructureIssue = {
  code:
    | 'ego-count'
    | 'ego-parents'
    | 'biological-sex'
    | 'gamete-count'
    | 'gamete-role-placement'
    | 'gamete-sex-disagreement'
    | 'carrier-count'
    | 'duplicate-edge'
    | 'boundary-grandparents'
    | 'boundary-children-contributors';
  message: string;
  entityId?: string;
};

/**
 * An entity's attribute bag.
 *
 * An index signature rather than `Record<string, unknown>`: the declaration
 * bundler cannot follow the `Record` symbol out through an exported type and
 * fails the package build when it tries, which is why every other `Record` in
 * this package sits on a non-exported const.
 */
export type PedigreeEntityAttributes = { [key: string]: unknown };

export type PedigreeStructureInput = {
  nodes: { id: string; attributes: PedigreeEntityAttributes }[];
  edges: {
    id: string;
    from: string;
    to: string;
    attributes: PedigreeEntityAttributes;
  }[];
  config: {
    egoVariable?: string;
    biologicalSexVariable?: string;
    relationshipTypeVariable?: string;
    gameteRoleVariable?: string;
    isGestationalCarrierVariable?: string;
  };
  /**
   * The stage's completeness boundaries, if they should be checked. Only a
   * `required` boundary blocks the interface from finalizing, so only a
   * `required` boundary is an error here.
   */
  boundaries?: {
    requireGrandparents: 'required' | 'recommended' | 'off';
    requireChildrenContributors: 'required' | 'recommended' | 'off';
  };
  /** Whether ego affirmed having no children — the other way to satisfy it. */
  noChildrenAffirmed?: boolean;
};

/** Categorical values are stored as single-element arrays. */
function single(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length !== 1) return undefined;
  const [only] = value;
  return typeof only === 'string' ? only : undefined;
}

/** Parent → child edges are everything that is not a partnership. */
const PARENTAGE_TYPES = new Set([
  'biological',
  'social',
  'donor',
  'surrogate',
  'adoptive',
]);

/** The types that carry a gamete, and so transmit. */
const GENETIC_TYPES = new Set(['biological', 'donor']);

export function validatePedigreeStructure(
  input: PedigreeStructureInput,
): PedigreeStructureIssue[] {
  const { nodes, edges, config } = input;
  const issues: PedigreeStructureIssue[] = [];

  const egoVariable = config.egoVariable;
  const sexVariable = config.biologicalSexVariable;
  const typeVariable = config.relationshipTypeVariable;
  const gameteVariable = config.gameteRoleVariable;
  const carrierVariable = config.isGestationalCarrierVariable;

  // Exactly one proband.
  if (egoVariable) {
    const egos = nodes.filter((node) => node.attributes[egoVariable] === true);
    if (egos.length !== 1) {
      issues.push({
        code: 'ego-count',
        message: `A pedigree must have exactly one proband, found ${egos.length}`,
      });
    }
  }

  // Sex is one canonical value, never several.
  if (sexVariable) {
    for (const node of nodes) {
      const raw = node.attributes[sexVariable];
      if (raw === undefined || raw === null) continue;
      const value = single(raw);
      if (
        value === undefined ||
        !BIOLOGICAL_SEX_VALUES.includes(value as never)
      ) {
        issues.push({
          code: 'biological-sex',
          entityId: node.id,
          message: `Biological sex must be a single canonical value, found ${JSON.stringify(raw)}`,
        });
      }
    }
  }

  const relationshipOf = (
    attributes: PedigreeEntityAttributes,
  ): string | undefined =>
    typeVariable ? single(attributes[typeVariable]) : undefined;

  const parentageEdges = edges.filter((edge) => {
    const type = relationshipOf(edge.attributes);
    return type !== undefined && PARENTAGE_TYPES.has(type);
  });

  // Ego needs at least two parents that are neither partnerships nor purely
  // social, or the interface refuses to finalize.
  if (egoVariable) {
    const ego = nodes.find((node) => node.attributes[egoVariable] === true);
    if (ego) {
      const qualifying = parentageEdges.filter(
        (edge) =>
          edge.to === ego.id && relationshipOf(edge.attributes) !== 'social',
      );
      if (qualifying.length < 2) {
        issues.push({
          code: 'ego-parents',
          entityId: ego.id,
          message: `The proband needs at least two parents, found ${qualifying.length}`,
        });
      }
    }
  }

  const sexById = new Map(
    nodes.map((node) => [
      node.id,
      sexVariable ? single(node.attributes[sexVariable]) : undefined,
    ]),
  );

  const eggCount = new Map<string, number>();
  const spermCount = new Map<string, number>();
  const carrierCount = new Map<string, number>();

  for (const edge of parentageEdges) {
    const type = relationshipOf(edge.attributes);
    const role = gameteVariable
      ? single(edge.attributes[gameteVariable])
      : undefined;

    if (role !== undefined && type !== undefined && !GENETIC_TYPES.has(type)) {
      issues.push({
        code: 'gamete-role-placement',
        entityId: edge.id,
        message: `A "${type}" parent contributes no gamete, but carries the role "${role}"`,
      });
    }

    if (role === 'egg') {
      eggCount.set(edge.to, (eggCount.get(edge.to) ?? 0) + 1);
      if (sexById.get(edge.from) === 'male') {
        issues.push({
          code: 'gamete-sex-disagreement',
          entityId: edge.id,
          message: 'An egg contributor is recorded male',
        });
      }
    }
    if (role === 'sperm') {
      spermCount.set(edge.to, (spermCount.get(edge.to) ?? 0) + 1);
      if (sexById.get(edge.from) === 'female') {
        issues.push({
          code: 'gamete-sex-disagreement',
          entityId: edge.id,
          message: 'A sperm contributor is recorded female',
        });
      }
    }

    if (carrierVariable && edge.attributes[carrierVariable] === true) {
      carrierCount.set(edge.to, (carrierCount.get(edge.to) ?? 0) + 1);
    }
  }

  for (const [childId, count] of eggCount) {
    if (count > 1) {
      issues.push({
        code: 'gamete-count',
        entityId: childId,
        message: `A person has ${count} egg contributors`,
      });
    }
  }
  for (const [childId, count] of spermCount) {
    if (count > 1) {
      issues.push({
        code: 'gamete-count',
        entityId: childId,
        message: `A person has ${count} sperm contributors`,
      });
    }
  }
  for (const [childId, count] of carrierCount) {
    if (count > 1) {
      issues.push({
        code: 'carrier-count',
        entityId: childId,
        message: `A person has ${count} gestational carriers`,
      });
    }
  }

  // Boundary rules. `requireGrandparents` reaches only ego's *genetic* parents,
  // so an adopted ego — who has none — satisfies it vacuously. That is not a
  // loophole: an adoptee's genetic line is genuinely absent, and a donor's
  // parents are essentially never known.
  const geneticParentsOf = (childId: string): string[] =>
    parentageEdges
      .filter((edge) => {
        const type = relationshipOf(edge.attributes);
        return (
          edge.to === childId && type !== undefined && GENETIC_TYPES.has(type)
        );
      })
      .map((edge) => edge.from);

  const egoId = egoVariable
    ? nodes.find((node) => node.attributes[egoVariable] === true)?.id
    : undefined;

  if (input.boundaries?.requireGrandparents === 'required' && egoId) {
    for (const parentId of geneticParentsOf(egoId)) {
      if (geneticParentsOf(parentId).length < 2) {
        issues.push({
          code: 'boundary-grandparents',
          entityId: parentId,
          message:
            'requireGrandparents is required, but a genetic parent of the proband has fewer than two genetic parents',
        });
      }
    }
  }

  if (
    input.boundaries?.requireChildrenContributors === 'required' &&
    egoId &&
    input.noChildrenAffirmed !== true
  ) {
    const children = nodes
      .map((node) => node.id)
      .filter((id) => geneticParentsOf(id).includes(egoId));

    if (children.length === 0) {
      issues.push({
        code: 'boundary-children-contributors',
        entityId: egoId,
        message:
          'requireChildrenContributors is required, but the proband has no genetic children and did not affirm having none',
      });
    }

    for (const childId of children) {
      for (const coParent of geneticParentsOf(childId).filter(
        (id) => id !== egoId,
      )) {
        const coParentParents = geneticParentsOf(coParent);
        const deepEnough =
          coParentParents.length >= 2 &&
          coParentParents.every((id) => geneticParentsOf(id).length >= 2);
        if (!deepEnough) {
          issues.push({
            code: 'boundary-children-contributors',
            entityId: coParent,
            message:
              "requireChildrenContributors is required, but a child's other parent lacks two generations of recorded parents",
          });
        }
      }
    }
  }

  // The runtime store throws on a second edge of one relationship type between
  // the same pair, in either direction.
  const seen = new Set<string>();
  for (const edge of edges) {
    const type = relationshipOf(edge.attributes) ?? 'unknown';
    const [left, right] = [edge.from, edge.to].toSorted();
    const key = `${type}\n${left}\n${right}`;
    if (seen.has(key)) {
      issues.push({
        code: 'duplicate-edge',
        entityId: edge.id,
        message: `Duplicate "${type}" edge between the same pair`,
      });
    }
    seen.add(key);
  }

  return issues;
}
