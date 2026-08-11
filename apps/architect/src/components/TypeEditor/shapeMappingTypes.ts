import type { NodeDefinition } from '@codaco/protocol-validation';

type ShapeMapping = NonNullable<NodeDefinition['shape']['dynamic']>;
type DiscreteShapeMapping = Extract<ShapeMapping, { type: 'discrete' }>;
type BreakpointShapeMapping = Extract<ShapeMapping, { type: 'breakpoints' }>;

export type ShapeMappingType = ShapeMapping['type'];
export type DiscreteShapeMapEntry = DiscreteShapeMapping['map'][number];
export type ShapeThreshold = BreakpointShapeMapping['thresholds'][number];

// The editor holds shape.dynamic mid-edit, before it satisfies either mapping
// variant, so every field is optional and `type` may be unset.
export type ShapeMappingDraft = Partial<
  Omit<DiscreteShapeMapping, 'type'> & Omit<BreakpointShapeMapping, 'type'>
> & { type?: ShapeMappingType };
