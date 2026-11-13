import { z } from 'zod';

import { CodebookNameSchema } from '@codaco/shared-consts';

import {
  EdgeColorReferenceSchema,
  NodeColorReferenceSchema,
  type EdgeColorReference,
  type NodeColorReference,
} from '../color-reference.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import {
  MAX_NODE_SHAPE_SVG_LENGTH,
  parseNodeShapeSvg,
} from '../node-shape-svg.ts';
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

const CustomNodeShapeSchema = z.strictObject({
  name: z.string().refine((value) => value.trim() !== '', {
    message: 'A custom shape name cannot be blank',
  }),
  svg: z
    .string()
    .max(MAX_NODE_SHAPE_SVG_LENGTH, {
      message: `The shape's SVG cannot be longer than ${MAX_NODE_SHAPE_SVG_LENGTH} characters`,
    })
    .superRefine((svg, ctx) => {
      const [issue] = parseNodeShapeSvg(svg).issues;
      if (issue) {
        ctx.addIssue({
          code: 'custom',
          message: `The shape's SVG image is not supported (${issue.code}: ${issue.detail})`,
        });
      }
    }),
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
});

export { NodeDefinitionSchema };
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export type EdgeColor = EdgeColorReference;

const EdgeDefinitionSchema = z.strictObject({
  name: CodebookNameSchema,
  color: EdgeColorReferenceSchema.optional(),
  variables: EdgeVariablesSchema.optional(),
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
