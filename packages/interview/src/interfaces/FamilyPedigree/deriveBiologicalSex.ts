import type { BiologicalSex } from '@codaco/shared-consts';

import type { CommitBatch, VariableConfig } from './store';

type BatchEdge = CommitBatch['edges'][number];

function readRelationshipType(
  attributes: Record<string, unknown>,
  relationshipTypeVariable: string,
): string | undefined {
  const value = attributes[relationshipTypeVariable];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
}

function isGeneticRelationship(relType: string | undefined): boolean {
  return relType === 'biological' || relType === 'donor';
}

/**
 * Infer a person's biological sex from the reproductive role they hold in the
 * pedigree, encoded in their outgoing edges:
 * - provides an egg (a genetic parent edge with gameteRole `'egg'`)  → female
 * - provides sperm (a genetic parent edge with gameteRole `'sperm'`) → male
 * - carried a pregnancy (an edge flagged gestational carrier)        → female
 * - otherwise                                                        → unknown
 */
function inferSexFromRole(
  tempId: string,
  edges: BatchEdge[],
  config: VariableConfig,
): BiologicalSex {
  let carried = false;
  for (const edge of edges) {
    if (edge.source !== tempId) continue;
    const attrs = edge.data.attributes;
    const relType = readRelationshipType(
      attrs,
      config.relationshipTypeVariable,
    );
    if (isGeneticRelationship(relType)) {
      // gameteRole is categorical, stored as a single-element array; tolerate a
      // bare string defensively.
      const rawRole = attrs[config.gameteRoleVariable];
      const role = Array.isArray(rawRole) ? rawRole[0] : rawRole;
      if (role === 'egg') return 'female';
      if (role === 'sperm') return 'male';
    }
    if (attrs[config.isGestationalCarrierVariable] === true) carried = true;
  }
  return carried ? 'female' : 'unknown';
}

/**
 * Return a copy of the commit batch in which every node carries a biological-sex
 * value. A node keeps the sex it was asked for; otherwise its sex is inferred
 * from its reproductive role, falling back to `'unknown'`. This guarantees the
 * attribute is populated on ALL pedigree nodes — so it is a first-class part of
 * the interview network and can drive node shape (or be left free for a gender
 * construct) — rather than only being derived at genetics-read time.
 */
export function withInferredBiologicalSex(
  batch: CommitBatch,
  config: VariableConfig,
): CommitBatch {
  const nodes = batch.nodes.map((node) => {
    const attributes = node.data.attributes;
    if (attributes[config.biologicalSexVariable] !== undefined) return node;
    return {
      ...node,
      data: {
        attributes: {
          ...attributes,
          // Stored as a single-element categorical array, matching every other
          // biologicalSex write and the categorical-attribute convention.
          [config.biologicalSexVariable]: [
            inferSexFromRole(node.tempId, batch.edges, config),
          ],
        },
      },
    };
  });
  return { nodes, edges: batch.edges };
}
