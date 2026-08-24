import { z } from 'zod';

import {
  EdgeColorReferenceSchema,
  NodeColorReferenceSchema,
  type EdgeColorReference,
  type NodeColorReference,
} from '../color-reference.ts';
import { entityAttributeReference } from '../entity-attribute-reference.ts';
import {
  EdgeVariablesSchema,
  EgoVariablesSchema,
  VariablesSchema,
} from '../variables/index.ts';

export type NodeColor = NodeColorReference;

export const NodeShapes = ['circle', 'square', 'diamond'] as const;
export type NodeShape = (typeof NodeShapes)[number];

const DiscreteShapeMappingSchema = z.strictObject({
  variable: entityAttributeReference({ subject: 'owningVariable' }),
  type: z.literal('discrete'),
  map: z
    .array(
      z.strictObject({
        value: z.union([z.string(), z.number(), z.boolean()]),
        shape: z.enum(NodeShapes),
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
        shape: z.enum(NodeShapes),
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
  default: z.enum(NodeShapes),
  dynamic: ShapeMappingSchema.optional(),
});

const NodeDefinitionSchema = z.strictObject({
  name: z.string(),
  icon: z.string().optional(),
  variables: VariablesSchema.optional(),
  color: NodeColorReferenceSchema,
  shape: ShapeSchema,
});

export { NodeDefinitionSchema };
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export type EdgeColor = EdgeColorReference;

const EdgeDefinitionSchema = z.strictObject({
  name: z.string(),
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
