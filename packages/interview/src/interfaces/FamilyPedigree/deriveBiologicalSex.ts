import type { BiologicalSex } from '@codaco/protocol-validation';

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
 * Provide a legacy/completeness fallback when a flow did not capture the
 * person's sex recorded at birth. Reproductive role and recorded sex are
 * captured independently by current flows; see REPRODUCTIVE_ROLE_AND_SEX.md.
 * The fallback uses outgoing pedigree edges:
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
 * value. A node always keeps the answer that was captured. The reproductive-role
 * fallback exists only for legacy or defensive completeness; current creation
 * flows ask the full question independently. This guarantees the attribute is
 * populated on all pedigree nodes rather than only being derived at
 * genetics-read time.
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
