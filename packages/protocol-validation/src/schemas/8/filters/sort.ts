import { z } from 'zod';

export const SortRuleSchema = z.strictObject({
  // A sort key: a roster data-source column, a magic sort key (e.g. '*'), or
  // a codebook variable depending on the stage. Not a guaranteed codebook
  // reference, so it is not existence-validated as one.
  property: z.string(),
  direction: z.enum(['asc', 'desc']),
});

export type SortRule = z.infer<typeof SortRuleSchema>;

export const SortOrderSchema = z.array(SortRuleSchema);

export type SortOrder = z.infer<typeof SortOrderSchema>;
