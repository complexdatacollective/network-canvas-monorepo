export type LayoutDimensions = {
  nodeWidth: number;
  nodeHeight: number;
  /** Gap between generations, as a multiple of the node height. */
  rowGapRatio?: number;
  /** Gap between neighbours in a generation, as a multiple of the node width. */
  columnGapRatio?: number;
};

/** The gaps Family Pedigree leaves between people: room around each person
 * for the add menu that appears beside, above and below them. */
export const FAMILY_PEDIGREE_GAPS = {
  rowGapRatio: 1.4,
  columnGapRatio: 1.4,
} as const;

export function computeLayoutMetrics(dims: LayoutDimensions) {
  const rowGap = Math.round(dims.nodeHeight * (dims.rowGapRatio ?? 1));
  const columnGap = Math.round(dims.nodeWidth * (dims.columnGapRatio ?? 0.6));
  const containerWidth = dims.nodeWidth;
  const containerHeight = dims.nodeHeight;
  const rowHeight = containerHeight + rowGap;
  const siblingSpacing = containerWidth + columnGap;
  const partnerSpacing = containerWidth + columnGap;

  return {
    containerWidth,
    containerHeight,
    rowGap,
    columnGap,
    rowHeight,
    siblingSpacing,
    partnerSpacing,
  };
}
