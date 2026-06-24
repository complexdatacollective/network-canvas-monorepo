import { VariableNameSchema } from '@codaco/shared-consts';
import {
  getEdgeTypeId,
  getNodeTypeId,
  getNodeVariableId,
} from '~/utils/mock-seeds';
import {
  findDuplicateName,
  getAllEntityNames,
} from '~/utils/validation-helpers';
import { z } from '~/utils/zod-mock-extension';

import {
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
  NodeDefinitionSchema,
} from './definitions';

export const CodebookSchema = z
  .strictObject({
    node: z.record(VariableNameSchema, NodeDefinitionSchema).optional(),
    edge: z.record(VariableNameSchema, EdgeDefinitionSchema).optional(),
    ego: EgoDefinitionSchema.optional(),
  })
  .superRefine((codebook, ctx) => {
    // Check for duplicate entity names across all entity types
    const entityNames = getAllEntityNames(codebook);
    const duplicateEntityName = findDuplicateName(entityNames);
    if (duplicateEntityName) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Duplicate entity name "${duplicateEntityName}"`,
        path: [],
      });
    }

    // Variable record keys must be unique across all entity types. The
    // interview flattens every entity's variables into a single key->variable
    // map, so a key reused under a different entity type silently overwrites the
    // other entity's definition and resolves to the wrong type at runtime.
    const seenRecordKeys = new Set<string>();
    const collectKeys = (variables?: Record<string, unknown>) => {
      if (!variables) {
        return;
      }
      for (const key of Object.keys(variables)) {
        if (seenRecordKeys.has(key)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Variable record key "${key}" is reused across entity types`,
            path: [],
          });
        }
        seenRecordKeys.add(key);
      }
    };

    Object.values(codebook.node ?? {}).forEach((entity) =>
      collectKeys(entity.variables),
    );
    Object.values(codebook.edge ?? {}).forEach((entity) =>
      collectKeys(entity.variables),
    );
    collectKeys(codebook.ego?.variables);
  })
  .generateMock(() => {
    const personNode = NodeDefinitionSchema.generateMock();
    const orgNode = NodeDefinitionSchema.generateMock();
    const friendshipEdge = EdgeDefinitionSchema.generateMock();
    const worksWithEdge = EdgeDefinitionSchema.generateMock();
    const ego = EgoDefinitionSchema.generateMock();

    // Pin specific seeded node variables to fixed types so stage mocks that
    // reference them by index resolve to the type their logic validation
    // requires: index 0 -> layout (sociogram/narrative layoutVariable),
    // index 1 -> ordinal (OrdinalBin), index 2 -> categorical (CategoricalBin),
    // index 3 -> location (Geospatial prompt variable).
    const personVariables = {
      ...personNode.variables,
      [getNodeVariableId(0)]: {
        name: 'Layout_Position',
        type: 'layout' as const,
      },
      [getNodeVariableId(1)]: {
        name: 'Ordinal_Rank',
        type: 'ordinal' as const,
        options: [
          { label: 'Low', value: 1 },
          { label: 'High', value: 2 },
        ],
      },
      [getNodeVariableId(2)]: {
        name: 'Category',
        type: 'categorical' as const,
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      },
      [getNodeVariableId(3)]: {
        name: 'Home_Location',
        type: 'location' as const,
      },
    };

    // The variable mock generators key by deterministic seeds, so the two node
    // mocks (and the two edge mocks) would otherwise share record keys. Record
    // keys must be unique across entity types, and stage mocks only reference
    // the primary entities' variables, so the secondary entities carry none.
    return {
      node: {
        [getNodeTypeId(0)]: {
          ...personNode,
          name: 'Person',
          variables: personVariables,
        },
        [getNodeTypeId(1)]: {
          ...orgNode,
          name: 'Organization',
          variables: undefined,
        },
      },
      edge: {
        [getEdgeTypeId(0)]: { ...friendshipEdge, name: 'Friendship' },
        [getEdgeTypeId(1)]: {
          ...worksWithEdge,
          name: 'WorksWith',
          variables: undefined,
        },
      },
      ego: ego,
    };
  });

export type Codebook = z.infer<typeof CodebookSchema>;
