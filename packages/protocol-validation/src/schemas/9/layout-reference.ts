import { z } from 'zod';

const LAYOUT_REFERENCE = 'layoutReference' as const;

/**
 * A string field holding the id of a layout in `codebook.layouts`. Tagging the
 * schema node lets `collectLayoutReferences` find every stage setting that
 * names a layout, which is how a layout's usage, its deletion and its id
 * rewriting are decided, instead of each consumer keeping a list of paths.
 */
export const layoutReference = () =>
  z.string().meta({ [LAYOUT_REFERENCE]: true });

export const isLayoutReference = (schema: z.ZodType): boolean =>
  schema.meta()?.[LAYOUT_REFERENCE] === true;
