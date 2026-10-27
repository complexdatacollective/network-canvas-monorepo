import {
  type NodeColorSequence,
  NodeColors,
  type NodeShape,
} from '@codaco/fresco-ui/Node';

const NODE_SHAPES: readonly NodeShape[] = ['circle', 'square', 'diamond'];

export const isNodeShape = (value: unknown): value is NodeShape =>
  NODE_SHAPES.some((shape) => shape === value);

export const isNodeColorSequence = (
  value: unknown,
): value is NodeColorSequence => NodeColors.some((color) => color === value);
