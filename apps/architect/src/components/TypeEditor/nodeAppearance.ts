import { type NodeColorSequence, NodeColors } from '@codaco/fresco-ui/Node';

export const isNodeColorSequence = (
  value: unknown,
): value is NodeColorSequence => NodeColors.some((color) => color === value);
