import { z } from 'zod';

import {
  CodebookNameSchema,
  findLayoutExportColumnConflicts,
  normalizeForComparison,
} from '@codaco/shared-consts';

import {
  findDuplicateName,
  getAllEntityNames,
} from '../../../utils/validation-helpers.ts';
import {
  codebookRecord,
  EntityTypeIdSchema,
  VariableIdSchema,
} from '../codebook-ids.ts';
import {
  type EdgeDefinition,
  EdgeDefinitionSchema,
  type EgoDefinition,
  EgoDefinitionSchema,
  type NodeDefinition,
  NodeDefinitionSchema,
} from './definitions.ts';

/**
 * A layout: positions on a canvas, which every node a stage places is given
 * under the layout's id. Shared by every node type such a stage includes.
 */
export const LayoutDefinitionSchema = z.strictObject({
  name: CodebookNameSchema,
});

export type LayoutDefinition = z.infer<typeof LayoutDefinitionSchema>;

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
    // A layout id is a variable id: positions are stored on each node under it.
    layouts: codebookRecord(
      VariableIdSchema,
      LayoutDefinitionSchema,
      'layout',
    ).optional(),
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
    // Layout ids join them, since positions are stored on nodes beside
    // their variables, under the layout's id.
    const layoutKeys = new Set(Object.keys(codebook.layouts ?? {}));
    const seenRecordKeys = new Set<string>();
    const collectKeys = (variables?: Record<string, unknown>) => {
      if (!variables) {
        return;
      }
      for (const key of Object.keys(variables)) {
        if (layoutKeys.has(key)) {
          ctx.addIssue({
            code: 'custom' as const,
            message: `Attribute record key "${key}" is also the id of a layout`,
            path: [],
          });
        } else if (seenRecordKeys.has(key)) {
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

    findLayoutNameProblems(codebook, ctx);

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

type CodebookLayoutView = {
  node?: Record<
    string,
    { name: string; variables?: Record<string, { name: string; type: string }> }
  >;
  layouts?: Record<string, LayoutDefinition>;
};

/**
 * A layout's name is unique among layouts and is never the name of a node
 * type's variable, and none of the columns an export writes for it (see
 * `findLayoutExportColumnConflicts`) is a column a node variable or another
 * layout writes: a layout's positions are exported as columns of every node
 * type that has it.
 */
const findLayoutNameProblems = (
  codebook: CodebookLayoutView,
  ctx: z.RefinementCtx,
) => {
  const layouts = codebook.layouts ?? {};
  const nodeTypes = codebook.node ?? {};
  const seenNames = new Set<string>();
  for (const [layoutId, { name }] of Object.entries(layouts)) {
    const path = ['layouts', layoutId, 'name'];
    const comparable = normalizeForComparison(name);
    if (seenNames.has(comparable)) {
      ctx.addIssue({
        code: 'custom' as const,
        message: `Duplicate layout name "${name}"`,
        path,
      });
    }
    seenNames.add(comparable);
    for (const definition of Object.values(nodeTypes)) {
      const variable = Object.values(definition.variables ?? {}).find(
        (candidate) => normalizeForComparison(candidate.name) === comparable,
      );
      if (variable !== undefined) {
        ctx.addIssue({
          code: 'custom' as const,
          message: `Layout "${name}" has the name of the attribute "${variable.name}" of node type "${definition.name}"`,
          path,
        });
      }
    }
  }
  const nodeVariablesByType = Object.fromEntries(
    Object.entries(nodeTypes).map(([type, definition]) => [
      type,
      definition.variables ?? {},
    ]),
  );
  for (const { layoutId, conflict } of findLayoutExportColumnConflicts(
    layouts,
    nodeVariablesByType,
  )) {
    const layoutName = layouts[layoutId]?.name ?? layoutId;
    const clashesWith =
      conflict.kind === 'reserved'
        ? `the export's own column "${conflict.reservedColumn}"`
        : conflict.kind === 'own'
          ? `its own column "${conflict.otherColumn}"`
          : conflict.sibling.nodeType === undefined
            ? `the layout "${conflict.sibling.name}"`
            : `the attribute "${conflict.sibling.name}" of node type "${nodeTypes[conflict.sibling.nodeType]?.name ?? conflict.sibling.nodeType}"`;
    ctx.addIssue({
      code: 'custom' as const,
      message: `Layout "${layoutName}" would be exported to a column called "${conflict.column}", which ${clashesWith} is also exported to`,
      path: ['layouts', layoutId, 'name'],
    });
  }
};

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
