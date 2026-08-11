import { z } from 'zod';

import { VariableNameSchema } from '@codaco/shared-consts';

import {
  findDuplicateName,
  getAllEntityNames,
} from '../../../utils/validation-helpers.ts';
import {
  type EdgeDefinition,
  EdgeDefinitionSchema,
  type EgoDefinition,
  EgoDefinitionSchema,
  type NodeDefinition,
  NodeDefinitionSchema,
} from './definitions.ts';

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
  });

export type Codebook = z.infer<typeof CodebookSchema>;

/**
 * A structural view of {@link Codebook} that relaxes each entity definition's
 * strict requirements (a node's `name`/`color`/`shape`, an edge's `name`).
 *
 * Consumers that assemble or receive a codebook before it is schema-validated —
 * e.g. synthetic network generation, which only ever reads each entity's
 * `variables` — need to accept these partially-populated codebooks. Deriving the
 * per-entity shapes from the canonical definitions with `Partial` (rather than
 * re-describing them structurally) keeps the `variables` typing in lock-step
 * with the schema.
 */
export type StructuralCodebook = {
  node?: Record<string, Partial<NodeDefinition>>;
  edge?: Record<string, Partial<EdgeDefinition>>;
  ego?: Partial<EgoDefinition>;
};
