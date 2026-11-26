import { z } from 'zod';

import {
  findDuplicateName,
  getAllEntityNames,
} from '../../../utils/validation-helpers.ts';
import { codebookRecord, EntityTypeIdSchema } from '../codebook-ids.ts';
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
    node: codebookRecord(
      EntityTypeIdSchema,
      NodeDefinitionSchema,
      'node type',
    ).optional(),
    edge: codebookRecord(
      EntityTypeIdSchema,
      EdgeDefinitionSchema,
      'edge type',
    ).optional(),
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
            message: `Attribute record key "${key}" is reused across entity types`,
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

    const nodeTypeName = (type: string) =>
      Object.hasOwn(codebook.node ?? {}, type)
        ? (codebook.node?.[type]?.name ?? type)
        : type;
    for (const [edgeType, definition] of Object.entries(codebook.edge ?? {})) {
      const seenRules = new Set<string>();
      definition.endpointRules?.forEach((rule, ruleIndex) => {
        for (const end of ['sourceType', 'targetType'] as const) {
          if (!Object.hasOwn(codebook.node ?? {}, rule[end])) {
            ctx.addIssue({
              code: 'custom' as const,
              message: `Edge type "${definition.name}" has a connection rule naming node type "${rule[end]}", which does not exist.`,
              path: ['edge', edgeType, 'endpointRules', ruleIndex, end],
            });
          }
        }
        const pair = [rule.sourceType, rule.targetType];
        const key = JSON.stringify(
          definition.directed ? pair : pair.toSorted(),
        );
        if (seenRules.has(key)) {
          const source = nodeTypeName(rule.sourceType);
          const target = nodeTypeName(rule.targetType);
          ctx.addIssue({
            code: 'custom' as const,
            message: definition.directed
              ? `Edge type "${definition.name}" allows connections from "${source}" to "${target}" more than once.`
              : `Edge type "${definition.name}" allows connections between "${source}" and "${target}" more than once.`,
            path: ['edge', edgeType, 'endpointRules', ruleIndex],
          });
        }
        seenRules.add(key);
      });
    }
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
