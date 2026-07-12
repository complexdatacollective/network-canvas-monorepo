import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import { computeNodeDisplayLabels } from '~/interfaces/FamilyPedigree/pedigree-layout/components/PedigreeNode';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

// ---------------------------------------------------------------------------
// Constants matching the story setup (NarrativePedigree.stories.tsx)
// ---------------------------------------------------------------------------
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';
const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

const variableConfig: VariableConfig = {
  nodeType: 'Person',
  edgeType: 'Family',
  nodeLabelVariable: NAME_VAR,
  egoVariable: EGO_VAR,
  relationshipVariable: REL_TO_EGO_VAR,
  relationshipTypeVariable: REL_TYPE_VAR,
  isActiveVariable: IS_ACTIVE_VAR,
  isGestationalCarrierVariable: IS_GEST_VAR,
  gameteRoleVariable: GAMETE_ROLE_VAR,
  biologicalSexVariable: BIO_SEX_VAR,
};

function makeNode(
  uid: string,
  name: string,
  egoFlag: boolean,
  sex: string,
): NcNode {
  return {
    _uid: uid,
    type: 'Person',
    [entityAttributesProperty]: {
      [NAME_VAR]: name,
      [EGO_VAR]: egoFlag,
      [BIO_SEX_VAR]: sex,
    },
  };
}

function makeEdge(uid: string, from: string, to: string): NcEdge {
  return {
    _uid: uid,
    type: 'Family',
    from,
    to,
    [entityAttributesProperty]: {
      [REL_TYPE_VAR]: ['biological'],
      [IS_ACTIVE_VAR]: true,
    },
  };
}

/**
 * Builds the nodes/edges maps that NarrativePedigreeView would pass to
 * computeNodeDisplayLabels. The critical scenario: some non-ego nodes have
 * egoVariable=true, simulating what SyntheticInterview's random boolean
 * generation produces for unset attributes.
 *
 * Root cause of the bug: SyntheticInterview.getNetwork() calls
 * faker.datatype.boolean() for any boolean variable not in explicitAttributes.
 * When the egoVariable is unset for a non-ego node, it may become true.
 * The old computeNodeDisplayLabels excluded ALL nodes with egoVariable===true
 * from displayLabels, and the old labelFor fell back to 'You' for any node
 * with egoVariable===true whose id was missing from displayLabels.
 *
 * UIDs and names are a representative pedigree slice for the label logic; they
 * need not match any story fixture.
 */
function buildTestNetwork(): {
  nodesMap: Map<string, NcNode>;
  edgesMap: Map<string, NcEdge>;
  egoId: string;
} {
  // 'gm' and 'gf-pat' have egoFlag=true even though they are not ego.
  // This is the triggering condition for the bug.
  const nodes: NcNode[] = [
    makeNode('gm', 'Eleanor', true, 'female'),
    makeNode('gf', 'Arthur', false, 'male'),
    makeNode('gf-pat', 'Harold', true, 'male'),
    makeNode('gm-pat', 'Irene', false, 'female'),
    makeNode('mother', 'Rose', false, 'female'),
    makeNode('father', 'David', false, 'male'),
    makeNode('ego', 'You', true, 'female'),
    makeNode('partner', 'Chris', false, 'male'),
    makeNode('son', 'Leo', false, 'male'),
    makeNode('daughter', 'Mia', false, 'female'),
    makeNode('uncle', 'Frank', false, 'male'),
  ];

  const edges: NcEdge[] = [
    makeEdge('gm-mother', 'gm', 'mother'),
    makeEdge('gf-mother', 'gf', 'mother'),
    makeEdge('gm-uncle', 'gm', 'uncle'),
    makeEdge('gf-uncle', 'gf', 'uncle'),
    makeEdge('gfp-father', 'gf-pat', 'father'),
    makeEdge('gmp-father', 'gm-pat', 'father'),
    makeEdge('mother-ego', 'mother', 'ego'),
    makeEdge('father-ego', 'father', 'ego'),
    makeEdge('ego-son', 'ego', 'son'),
    makeEdge('partner-son', 'partner', 'son'),
    makeEdge('ego-daughter', 'ego', 'daughter'),
    makeEdge('partner-daughter', 'partner', 'daughter'),
  ];

  const nodesMap = new Map(nodes.map((n) => [n._uid, n]));
  const edgesMap = new Map(edges.map((e) => [e._uid, e]));

  return { nodesMap, edgesMap, egoId: 'ego' };
}

/**
 * Replicates the labelFor logic from NarrativePedigreeView.tsx after the fix:
 * checks node.id === egoId instead of node.attributes[egoVariable] === true.
 */
function labelFor(
  nodeId: string,
  egoId: string,
  displayLabels: Map<string, string>,
): string {
  if (nodeId === egoId) return 'You';
  return displayLabels.get(nodeId) ?? '';
}

describe('NarrativePedigree node labels', () => {
  describe('named nodes show their seeded names', () => {
    const namedNodes: [string, string][] = [
      ['gm', 'Eleanor'],
      ['gf', 'Arthur'],
      ['gf-pat', 'Harold'],
      ['gm-pat', 'Irene'],
      ['mother', 'Rose'],
      ['father', 'David'],
      ['partner', 'Chris'],
      ['son', 'Leo'],
      ['daughter', 'Mia'],
      ['uncle', 'Frank'],
    ];

    it.each(namedNodes)(
      'node %s shows label "%s" even when egoVariable is true on non-ego nodes',
      (nodeId, expectedName) => {
        const { nodesMap, edgesMap, egoId } = buildTestNetwork();

        const displayLabels = computeNodeDisplayLabels(
          nodesMap,
          edgesMap,
          variableConfig,
          'gamete',
          egoId,
        );

        expect(labelFor(nodeId, egoId, displayLabels)).toBe(expectedName);
      },
    );
  });

  describe('ego identification', () => {
    it('exactly one node shows "You" (the ego)', () => {
      const { nodesMap, edgesMap, egoId } = buildTestNetwork();

      const displayLabels = computeNodeDisplayLabels(
        nodesMap,
        edgesMap,
        variableConfig,
        'gamete',
        egoId,
      );

      const youNodes: string[] = [];
      for (const [id] of nodesMap) {
        if (labelFor(id, egoId, displayLabels) === 'You') {
          youNodes.push(id);
        }
      }

      expect(youNodes).toHaveLength(1);
      expect(youNodes[0]).toBe('ego');
    });

    it('no non-ego node shows "You" even when its egoVariable attribute is true', () => {
      const { nodesMap, edgesMap, egoId } = buildTestNetwork();

      const displayLabels = computeNodeDisplayLabels(
        nodesMap,
        edgesMap,
        variableConfig,
        'gamete',
        egoId,
      );

      // 'gm' and 'gf-pat' have egoVariable=true but are NOT ego.
      // They must show their seeded names, not 'You'.
      expect(labelFor('gm', egoId, displayLabels)).toBe('Eleanor');
      expect(labelFor('gf-pat', egoId, displayLabels)).toBe('Harold');
    });
  });
});
