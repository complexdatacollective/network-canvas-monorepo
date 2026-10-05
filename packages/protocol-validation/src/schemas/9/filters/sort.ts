import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';

/**
 * The magic sort property meaning "the order the entities were nominated in"
 * rather than any attribute. Legal in every prompt-level sort rule and in the
 * roster's stage-level sort order, so it is never a codebook reference.
 */
export const NOMINATION_ORDER_SORT_KEY = '*';

export const SortRuleSchema = z.strictObject({
  /**
   * A sort key. Tagged as an entity-attribute reference so that a variable used
   * ONLY as a sort key is still discoverable as "in use" — before this tag the
   * sort key was the one variable path Architect had to collect by hand, in a
   * second key format its own usage display could not parse, which is how a
   * variable came to be undeletable with a blank "Used In" cell (#1392).
   *
   * `existence: 'unchecked'` because the value is not guaranteed to name a
   * codebook variable: on a NameGeneratorRoster it is a data-source column,
   * and the interview runtime deliberately tolerates a property with no
   * matching variable definition (see `processProtocolSortRule`). Collecting
   * without existence-checking keeps usage complete without making a protocol
   * that has always worked newly un-openable.
   */
  property: entityAttributeReference({
    subject: 'stageSubject',
    existence: 'unchecked',
    ignoreValues: [NOMINATION_ORDER_SORT_KEY],
  }),
  direction: z.enum(['asc', 'desc']),
});

export type SortRule = z.infer<typeof SortRuleSchema>;

export const SortOrderSchema = z.array(SortRuleSchema);

export type SortOrder = z.infer<typeof SortOrderSchema>;
