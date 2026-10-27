import {
  type NodeColorSequence,
  NodeColors,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import { NodeShapes } from '@codaco/protocol-validation';

export const isNodeShape = (value: unknown): value is NodeShape =>
  NodeShapes.some((shape) => shape === value);

export const isNodeColorSequence = (
  value: unknown,
): value is NodeColorSequence => NodeColors.some((color) => color === value);
