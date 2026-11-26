import { z } from 'zod';

import { CodebookNameSchema } from '@codaco/shared-consts';

import { assetReference } from '../asset-reference.ts';
import {
  EdgeColorReferenceSchema,
  NodeColorReferenceSchema,
  type EdgeColorReference,
  type NodeColorReference,
} from '../color-reference.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { NodeLabelSchema } from '../node-label.ts';
import {
  EdgeVariablesSchema,
  EgoVariablesSchema,
  VariablesSchema,
} from '../variables/index.ts';

export type NodeColor = NodeColorReference;

export const NodeShapes = ['circle', 'square', 'diamond'] as const;
export type NodeShape = (typeof NodeShapes)[number];

const CUSTOM_SHAPE_PREFIX = 'custom:';
const CustomShapeIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/, {
  message:
    'A custom shape id may contain only letters, digits, hyphens and underscores',
});

const NodeShapeReferenceSchema = z.union([
  z.enum(NodeShapes),
  z.templateLiteral([CUSTOM_SHAPE_PREFIX, CustomShapeIdSchema]),
]);
export type NodeShapeReference = z.infer<typeof NodeShapeReferenceSchema>;

export const isCustomShapeReference = (
  reference: NodeShapeReference,
): reference is `custom:${string}` => reference.startsWith(CUSTOM_SHAPE_PREFIX);

export const getCustomShapeId = (reference: `custom:${string}`) =>
  reference.slice(CUSTOM_SHAPE_PREFIX.length);

/** What a shape reference resolves to: a built-in shape, or the SVG text of a
 *  custom shape's drawing. */
export type ResolvedNodeShape = NodeShape | { svg: string };

/** Resolves a codebook shape reference. `customShapes` is the node type's
 *  codebook entries, each naming the asset that holds its drawing, and
 *  `shapeSvgs` maps those asset ids to the drawing's SVG text. A `custom:<id>`
 *  that the node type does not define, or whose drawing is not in `shapeSvgs`,
 *  falls back to 'circle'. */
export function resolveNodeShapeReference(
  reference: NodeShapeReference | undefined,
  customShapes: Readonly<Record<string, { asset: string }>> | undefined,
  shapeSvgs: Readonly<Record<string, string>>,
): ResolvedNodeShape {
  if (reference === undefined) return 'circle';
  if (!isCustomShapeReference(reference)) return reference;
  const id = getCustomShapeId(reference);
  // Own entries only: an id such as `constructor` must not reach the
  // prototype.
  const custom =
    customShapes && Object.hasOwn(customShapes, id)
      ? customShapes[id]
      : undefined;
  const svg =
    custom && Object.hasOwn(shapeSvgs, custom.asset)
      ? shapeSvgs[custom.asset]
      : undefined;
  return typeof svg === 'string' ? { svg } : 'circle';
}

const CustomNodeShapeSchema = z.strictObject({
  name: z.string().refine((value) => value.trim() !== '', {
    message: 'A custom shape name cannot be blank',
  }),
  asset: assetReference(),
});
export type CustomNodeShape = z.infer<typeof CustomNodeShapeSchema>;

const CustomShapesSchema = z
  .record(CustomShapeIdSchema, CustomNodeShapeSchema)
  .superRefine((shapes, ctx) => {
    const seen = new Set<string>();
    for (const [id, shape] of Object.entries(shapes)) {
      const key = shape.name.trim().toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Custom shape names must be unique within a node type, but "${shape.name.trim()}" is used more than once`,
          path: [id, 'name'],
        });
      }
      seen.add(key);
    }
  });

const DiscreteShapeMappingSchema = z.strictObject({
  variable: entityAttributeReference({ subject: 'owningVariable' }),
  type: z.literal('discrete'),
  map: z
    .array(
      z.strictObject({
        value: z.union([z.string(), z.number(), z.boolean()]),
        shape: NodeShapeReferenceSchema,
      }),
    )
    .refine(
      (items) => {
        const values = items.map((item) => JSON.stringify(item.value));
        return new Set(values).size === values.length;
      },
      { message: 'Discrete shape mapping values must be unique' },
    ),
});

const BreakpointShapeMappingSchema = z.strictObject({
  variable: entityAttributeReference({ subject: 'owningVariable' }),
  type: z.literal('breakpoints'),
  thresholds: z
    .array(
      z.strictObject({
        value: z.number(),
        shape: NodeShapeReferenceSchema,
      }),
    )
    .min(1)
    .max(2)
    .refine(
      (items) =>
        items.every(
          (item, i, arr) =>
            i === 0 ||
            item.value > (arr[i - 1]?.value ?? Number.NEGATIVE_INFINITY),
        ),
      {
        message:
          'Breakpoint thresholds must be sorted ascending with no duplicates',
      },
    ),
});

const ShapeMappingSchema = z.union([
  DiscreteShapeMappingSchema,
  BreakpointShapeMappingSchema,
]);

const ShapeSchema = z.strictObject({
  default: NodeShapeReferenceSchema,
  dynamic: ShapeMappingSchema.optional(),
});

const NodeDefinitionSchema = z.strictObject({
  name: CodebookNameSchema,
  icon: z.string().optional(),
  variables: VariablesSchema.optional(),
  color: NodeColorReferenceSchema,
  customShapes: CustomShapesSchema.optional(),
  shape: ShapeSchema,
  /**
   * How nodes of this type are labelled, when the type says so itself;
   * absent, the interview chooses each node's label by its own rules.
   */
  dynamicLabel: NodeLabelSchema.optional(),
});

export { NodeDefinitionSchema };
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export type EdgeColor = EdgeColorReference;

/**
 * A pair of node types an edge type may connect: source then target for a
 * directed type, an unordered pair for an undirected one. The same type on
 * both ends allows two different nodes of that type.
 */
const EndpointRuleSchema = z.strictObject({
  sourceType: entityTypeReference({ entity: 'node' }),
  targetType: entityTypeReference({ entity: 'node' }),
});

export type EndpointRule = z.infer<typeof EndpointRuleSchema>;

const EdgeDefinitionSchema = z.strictObject({
  name: CodebookNameSchema,
  color: EdgeColorReferenceSchema.optional(),
  variables: EdgeVariablesSchema.optional(),
  // Stored only when true: an undirected type carries no `directed` key.
  directed: z.literal(true).optional(),
  // Absent means any two nodes may connect.
  endpointRules: z.array(EndpointRuleSchema).min(1).optional(),
});

export { EdgeDefinitionSchema };
export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;

const EgoDefinitionSchema = z.strictObject({
  variables: EgoVariablesSchema.optional(),
});

export { EgoDefinitionSchema };
export type EgoDefinition = z.infer<typeof EgoDefinitionSchema>;

export const EntityDefinition = z.union([
  NodeDefinitionSchema,
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
]);

export type EntityDefinition = z.infer<typeof EntityDefinition>;

type AllKeys<T> = T extends unknown ? keyof T : never;
export type NodeDefinitionKeys = AllKeys<NodeDefinition>;
export type EdgeDefinitionKeys = AllKeys<EdgeDefinition>;
export type EgoDefinitionKeys = AllKeys<EgoDefinition>;
export type EntityDefinitionKeys = AllKeys<EntityDefinition>;
