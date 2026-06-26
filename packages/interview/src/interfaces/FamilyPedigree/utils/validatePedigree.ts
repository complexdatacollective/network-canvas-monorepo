import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { VariableConfig } from '../store';
import { getEdgeRelationshipType } from './edgeUtils';

export type ValidationIssue = {
  nodeId: string;
  nodeName: string;
  message: string;
  severity: 'required' | 'recommended';
};

export type Boundaries = {
  requireGrandparents: 'required' | 'recommended' | 'off';
  requireChildrenContributors: 'required' | 'recommended' | 'off';
};

// Ego's parents for the structural minimum: any parent-child relationship
// except a step/foster ('social') parent or a partner edge. Adoptive, donor,
// surrogate and biological parents all count toward "you have parents defined".
function getEgoParentIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): string[] {
  const parentIds: string[] = [];
  for (const edge of edges.values()) {
    const relType = getEdgeRelationshipType(
      edge,
      variableConfig.relationshipTypeVariable,
    );
    if (edge.to === nodeId && relType !== 'partner' && relType !== 'social') {
      parentIds.push(edge.from);
    }
  }
  return parentIds;
}

/**
 * Returns the IDs of genetic parents of a node: only biological or donor edges
 * pointing TO the node count. Adoptive, social, and partner edges are excluded.
 */
export function geneticParentIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): string[] {
  const parentIds: string[] = [];
  for (const edge of edges.values()) {
    if (edge.to !== nodeId) continue;
    const relType = getEdgeRelationshipType(
      edge,
      variableConfig.relationshipTypeVariable,
    );
    if (relType === 'biological' || relType === 'donor') {
      parentIds.push(edge.from);
    }
  }
  return parentIds;
}

/**
 * Evaluates configurable boundary rules beyond the base minimum. Returns issues
 * for every violated boundary, with severity matching the rule's config value.
 * Boundaries configured as 'off' are skipped entirely.
 */
export function evaluateBoundaries(
  egoId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  boundaries: Boundaries,
  hasNoChildrenAffirmation: boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (boundaries.requireGrandparents !== 'off') {
    const egoGeneticParents = geneticParentIds(egoId, edges, variableConfig);
    const isUnmet = egoGeneticParents.some(
      (parentId) =>
        geneticParentIds(parentId, edges, variableConfig).length < 2,
    );

    if (isUnmet) {
      issues.push({
        nodeId: egoId,
        nodeName: 'You',
        message: 'Each of your parents needs at least two parents recorded.',
        severity: boundaries.requireGrandparents,
      });
    }
  }

  if (boundaries.requireChildrenContributors !== 'off') {
    const egoGeneticChildren = [...nodes.keys()].filter((nodeId) =>
      geneticParentIds(nodeId, edges, variableConfig).includes(egoId),
    );

    let isUnmet = false;

    if (egoGeneticChildren.length === 0 && !hasNoChildrenAffirmation) {
      isUnmet = true;
    } else {
      // For each genetic child, find co-parents (genetic parents that are not ego),
      // then check that each co-parent has ≥2 genetic parents, and each of those
      // parents also has ≥2 genetic parents (depth-2 check).
      for (const childId of egoGeneticChildren) {
        const coParents = geneticParentIds(
          childId,
          edges,
          variableConfig,
        ).filter((id) => id !== egoId);

        for (const coParentId of coParents) {
          const coParentGenParents = geneticParentIds(
            coParentId,
            edges,
            variableConfig,
          );
          if (coParentGenParents.length < 2) {
            isUnmet = true;
            break;
          }
          for (const gpId of coParentGenParents) {
            if (geneticParentIds(gpId, edges, variableConfig).length < 2) {
              isUnmet = true;
              break;
            }
          }
          if (isUnmet) break;
        }
        if (isUnmet) break;
      }
    }

    if (isUnmet) {
      issues.push({
        nodeId: egoId,
        nodeName: 'You',
        message:
          "Each of your children's other parents needs their own parents and grandparents recorded.",
        severity: boundaries.requireChildrenContributors,
      });
    }
  }

  return issues;
}

export function validatePedigreeCompleteness(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  boundaries: Boundaries,
  hasNoChildrenAffirmation: boolean,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const egoEntry = [...nodes.entries()].find(
    ([, node]) => node.attributes[variableConfig.egoVariable] === true,
  );
  if (!egoEntry) return issues;

  const [egoId] = egoEntry;

  // Hard minimum: ego must have at least two parents (of any type except partner/social).
  const egoParentIds = getEgoParentIds(egoId, edges, variableConfig);
  if (egoParentIds.length < 2) {
    issues.push({
      nodeId: egoId,
      nodeName: 'You',
      message: 'You must have at least two parents defined.',
      severity: 'required',
    });
  }

  // Only required-severity boundary issues block completion.
  const boundaryIssues = evaluateBoundaries(
    egoId,
    nodes,
    edges,
    variableConfig,
    boundaries,
    hasNoChildrenAffirmation,
  );
  for (const issue of boundaryIssues) {
    if (issue.severity === 'required') {
      issues.push(issue);
    }
  }

  return issues;
}
