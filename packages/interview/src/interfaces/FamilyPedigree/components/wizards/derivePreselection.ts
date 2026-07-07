import type { RelationshipType } from '@codaco/shared-consts';
import type {
  FamilyEdge,
  GameteRole,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';

import type { BioTriadConfig } from './steps/BioTriadStep';

function readGameteRole(value: unknown): GameteRole | undefined {
  // Stored as a single-element categorical array; also tolerate a bare string.
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'egg' || v === 'sperm' ? v : undefined;
}

export function derivePreselection(
  anchorNodeId: string,
  edges: Map<string, FamilyEdge>,
  variableConfig: VariableConfig,
): BioTriadConfig['preselection'] {
  const parentEdges: {
    source: string;
    relationshipType: RelationshipType | undefined;
    gameteRole?: GameteRole;
  }[] = [];

  for (const edge of edges.values()) {
    const relationshipType = getEdgeRelationshipType(
      edge,
      variableConfig.relationshipTypeVariable,
    );
    if (edge.to === anchorNodeId && relationshipType !== 'partner') {
      parentEdges.push({
        source: edge.from,
        relationshipType,
        gameteRole: readGameteRole(
          edge.attributes[variableConfig.gameteRoleVariable],
        ),
      });
    }
  }

  const geneticEdges = parentEdges.filter(
    (e) =>
      e.relationshipType === 'biological' || e.relationshipType === 'donor',
  );
  const surrogateEdge = parentEdges.find(
    (e) => e.relationshipType === 'surrogate',
  );

  // Identify the egg and sperm parents by their recorded gamete role, falling
  // back to positional order when the role isn't set. A *separate* gestational
  // carrier is a distinct `surrogate` edge (handled below) — never a genetic
  // parent — so it is no longer mistaken for the egg parent.
  const eggEdge =
    geneticEdges.find((e) => e.gameteRole === 'egg') ?? geneticEdges[0];
  const spermEdge =
    geneticEdges.find((e) => e.gameteRole === 'sperm') ??
    geneticEdges.find((e) => e !== eggEdge);

  const preselection: BioTriadConfig['preselection'] = {};

  if (eggEdge) preselection.eggSource = eggEdge.source;
  if (spermEdge) preselection.spermSource = spermEdge.source;

  if (surrogateEdge) {
    // Someone other than the egg parent carried the pregnancy.
    preselection.eggParentCarried = false;
    preselection.carrier = surrogateEdge.source;
  }

  return preselection;
}
