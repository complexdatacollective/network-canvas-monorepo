/**
 * Renders an abstract pedigree into the nodes, edges and stage metadata the
 * FamilyPedigree interface would have produced.
 *
 * This is the only module here that knows about Network Canvas. Everything
 * upstream is demography and genetics, which keeps both testable without a
 * codebook.
 *
 * The output is deliberately what the *interface* writes, not merely what the
 * schema accepts: the committed membership list, the computed kinship terms,
 * and the single-element categorical arrays are all part of the contract that
 * `NarrativePedigree` and the pedigree layout read back.
 */

import {
  BIOLOGICAL_SEX_VALUES,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { chance, type PedigreeDemography, type Rng } from './demography.ts';
import type { AbstractPedigree, AbstractPerson } from './kinship.ts';

export type PedigreeVariableConfig = {
  nodeType: string;
  edgeType: string;
  nodeLabelVariable?: string;
  egoVariable?: string;
  relationshipVariable?: string;
  biologicalSexVariable?: string;
  relationshipTypeVariable?: string;
  isActiveVariable?: string;
  isGestationalCarrierVariable?: string;
  gameteRoleVariable?: string;
};

export type PedigreeRenderResult = {
  nodes: NcNode[];
  edges: NcEdge[];
  metadata: {
    isNetworkCommitted: true;
    nodes: { id: string; label: string; isEgo: boolean }[];
    edges: {
      id: string;
      from: string;
      to: string;
      attributes: Record<string, VariableValue>;
    }[];
  };
};

/**
 * Kinship terms, computed from the structure rather than drawn.
 *
 * The interface writes this variable itself at finalize, from a breadth-first
 * classification. Generating a random string here instead — which is what
 * happened before — produces people labelled "Grandparent" who are nobody's
 * grandparent, and any filter or export keyed on the term is then wrong.
 */
function relationshipTerms(pedigree: AbstractPedigree): Map<string, string> {
  const terms = new Map<string, string>();
  const parentsOf = (id: string) =>
    (pedigree.parents.get(id) ?? []).map((link) => link.parent);

  const egoParents = new Set(parentsOf(pedigree.egoId));
  const egoGrandparents = new Set(
    [...egoParents].flatMap((parent) => parentsOf(parent)),
  );
  const partnersOfEgo = new Set(
    pedigree.unions
      .filter((union) => union.a === pedigree.egoId || union.b === pedigree.egoId)
      .map((union) => (union.a === pedigree.egoId ? union.b : union.a)),
  );

  for (const person of pedigree.people) {
    if (person.id === pedigree.egoId) continue;

    if (egoParents.has(person.id)) {
      terms.set(person.id, 'Parent');
    } else if (egoGrandparents.has(person.id)) {
      terms.set(person.id, 'Grandparent');
    } else if (partnersOfEgo.has(person.id)) {
      terms.set(person.id, 'Partner');
    } else if (parentsOf(person.id).some((id) => egoParents.has(id))) {
      terms.set(person.id, 'Sibling');
    } else if (parentsOf(person.id).some((id) => egoGrandparents.has(id))) {
      terms.set(person.id, 'Aunt/Uncle');
    } else if (
      parentsOf(person.id).some((id) => parentsOf(id).some((g) => egoGrandparents.has(g)))
    ) {
      terms.set(person.id, 'Cousin');
    } else if (parentsOf(person.id).includes(pedigree.egoId)) {
      terms.set(person.id, 'Child');
    } else {
      terms.set(person.id, 'Family Member');
    }
  }

  return terms;
}

/**
 * The value written to the locked biological-sex categorical.
 *
 * Always a single-element array: the model stores one value, and the genetics
 * engine's `resolveSex` cannot interpret two. Gamete contributors take the sex
 * their role implies, because the interface infers it exactly that way and a
 * disagreement would make the pedigree contradict itself. Everyone else may
 * carry one of the rarer values, which the engine must keep handling.
 */
function biologicalSexFor(
  rng: Rng,
  demography: PedigreeDemography,
  person: AbstractPerson,
  contributesGamete: boolean,
): string[] {
  if (contributesGamete) return [person.sex];
  if (!chance(rng, demography.sexNotRecordedRate)) return [person.sex];

  const rare = BIOLOGICAL_SEX_VALUES.filter(
    (value) => value !== 'female' && value !== 'male',
  );
  return [rare[rng.randomInt(0, rare.length - 1)] ?? 'unknown'];
}

export type PedigreeRenderOptions = {
  rng: Rng;
  demography: PedigreeDemography;
  pedigree: AbstractPedigree;
  config: PedigreeVariableConfig;
  /** Ids for nodes and edges, in creation order. */
  nextId: () => string;
  /** Display names, in creation order. */
  nextName: () => string;
  /** Nomination-prompt variable → the people it should mark. */
  nominations: { variable: string; affected: Set<string> }[];
  stageId: string;
};

export function renderPedigree(
  options: PedigreeRenderOptions,
): PedigreeRenderResult {
  const { rng, demography, pedigree, config, nextId, nextName, stageId } =
    options;

  const terms = relationshipTerms(pedigree);
  const gameteContributors = new Set<string>();
  for (const links of pedigree.parents.values()) {
    for (const link of links) {
      if (link.gameteRole) gameteContributors.add(link.parent);
    }
  }

  const networkIdByPerson = new Map<string, string>();
  const labelByPerson = new Map<string, string>();
  const nodes: NcNode[] = [];

  for (const person of pedigree.people) {
    const id = nextId();
    const label = nextName();
    networkIdByPerson.set(person.id, id);
    labelByPerson.set(person.id, label);

    const attributes: Record<string, VariableValue> = {};
    if (config.nodeLabelVariable) attributes[config.nodeLabelVariable] = label;
    if (config.egoVariable) attributes[config.egoVariable] = person.isEgo;
    if (config.relationshipVariable) {
      attributes[config.relationshipVariable] = person.isEgo
        ? ''
        : (terms.get(person.id) ?? 'Family Member');
    }
    if (config.biologicalSexVariable) {
      attributes[config.biologicalSexVariable] = biologicalSexFor(
        rng,
        demography,
        person,
        gameteContributors.has(person.id),
      );
    }
    for (const { variable, affected } of options.nominations) {
      attributes[variable] = affected.has(person.id);
    }

    nodes.push({
      [entityPrimaryKeyProperty]: id,
      type: config.nodeType,
      [entityAttributesProperty]: attributes,
      stageId,
    });
  }

  const edges: NcEdge[] = [];
  const metadataEdges: PedigreeRenderResult['metadata']['edges'] = [];

  const pushEdge = (
    fromPerson: string,
    toPerson: string,
    attributes: Record<string, VariableValue>,
  ): void => {
    const from = networkIdByPerson.get(fromPerson);
    const to = networkIdByPerson.get(toPerson);
    if (!from || !to) return;

    const id = nextId();
    edges.push({
      [entityPrimaryKeyProperty]: id,
      type: config.edgeType,
      from,
      to,
      [entityAttributesProperty]: attributes,
    });
    metadataEdges.push({ id, from, to, attributes });
  };

  // Parentage. `from` is the parent and `to` the child — the adapter reads
  // direction, not a variable, to tell parentage from partnership.
  for (const [childId, links] of pedigree.parents) {
    for (const link of links) {
      const attributes: Record<string, VariableValue> = {};
      if (config.relationshipTypeVariable) {
        attributes[config.relationshipTypeVariable] = [link.relationshipType];
      }
      if (config.gameteRoleVariable && link.gameteRole) {
        attributes[config.gameteRoleVariable] = [link.gameteRole];
      }
      if (config.isGestationalCarrierVariable) {
        attributes[config.isGestationalCarrierVariable] =
          link.isGestationalCarrier === true;
      }
      // Runtime-faithful: every parent-child edge the interview commits carries
      // `isActive: true`. The flag only ever distinguishes current from past on
      // a partnership, but `buildChildParentage`, `egoCellTransform`,
      // `siblingCellTransform`, `buildParentageBatch`, `AddParentWizard` and
      // `PedigreeView` all write the literal, so a pedigree that omitted it
      // would be one no interview could produce.
      if (config.isActiveVariable) {
        attributes[config.isActiveVariable] = true;
      }
      pushEdge(link.parent, childId, attributes);
    }
  }

  // Partnerships. `isActive` distinguishes a current union from a past one, and
  // is meaningful only here.
  for (const union of pedigree.unions) {
    const attributes: Record<string, VariableValue> = {};
    if (config.relationshipTypeVariable) {
      attributes[config.relationshipTypeVariable] = ['partner'];
    }
    if (config.isActiveVariable) {
      attributes[config.isActiveVariable] = union.isActive;
    }
    pushEdge(union.a, union.b, attributes);
  }

  return {
    nodes,
    edges,
    metadata: {
      isNetworkCommitted: true,
      // The committed membership list. Without it `pedigreeMemberIds` returns
      // null and NarrativePedigree falls back to every node of the pedigree's
      // type — sweeping alters named by later stages onto the family tree.
      nodes: pedigree.people.map((person) => ({
        id: networkIdByPerson.get(person.id) ?? person.id,
        label: labelByPerson.get(person.id) ?? '',
        isEgo: person.isEgo,
      })),
      edges: metadataEdges,
    },
  };
}
