import type { NcEntity } from '@codaco/shared-consts';

import type { ExportCodebook } from '../input';
import { getEntityAttributes, getOwn } from './general';

type LayoutEntry = readonly [layoutId: string, layout: { name: string }];

/**
 * The layouts a node type is exported with, in codebook order: each layout a
 * stage sets for the type, and each layout one of `rows` holds a position
 * in, so a position is never exported as an undeclared attribute.
 */
export const layoutsOfNodeType = (
  codebook: ExportCodebook,
  nodeType: string,
  rows: readonly NcEntity[],
): LayoutEntry[] =>
  Object.entries(codebook.layouts ?? {}).filter(
    ([layoutId]) =>
      getOwn(codebook.layoutNodeTypes, layoutId)?.includes(nodeType) === true ||
      rows.some((row) => Object.hasOwn(getEntityAttributes(row), layoutId)),
  );

/** A stored position's coordinates, or undefined for anything else. */
export const positionOf = (
  value: unknown,
): { x: number; y: number } | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const x: unknown = 'x' in value ? value.x : undefined;
  const y: unknown = 'y' in value ? value.y : undefined;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
};
