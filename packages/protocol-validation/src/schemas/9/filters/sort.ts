import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';
import { protocolObjectId } from '../protocol-object-id.ts';

/**
 * The magic sort property meaning "the order the entities were nominated in"
 * rather than any attribute. Legal in every prompt-level sort rule and in the
 * roster's stage-level sort order, so it is never a codebook reference.
 */
export const NOMINATION_ORDER_SORT_KEY = '*';

const sortRuleWith = <Property extends z.ZodType>(property: Property) =>
  z.strictObject({
    id: protocolObjectId('sortRule'),
    property,
    direction: z.enum(['asc', 'desc']),
  });

/**
 * A sort key. Tagged as an entity-attribute reference so that a variable used
 * ONLY as a sort key is still discoverable as "in use" — before this tag the
 * sort key was the one variable path Architect had to collect by hand, in a
 * second key format its own usage display could not parse, which is how a
 * variable came to be undeletable with a blank "Used In" cell (#1392).
 *
 * `existence: 'unchecked'` because the interview runtime deliberately
 * tolerates a property with no matching variable definition (see
 * `processProtocolSortRule`). Collecting without existence-checking keeps
 * usage complete without making a protocol that has always worked newly
 * un-openable.
 */
export const SortRuleSchema = sortRuleWith(
  entityAttributeReference({
    subject: 'stageSubject',
    existence: 'unchecked',
    ignoreValues: [NOMINATION_ORDER_SORT_KEY],
  }),
);

export type SortRule = z.infer<typeof SortRuleSchema>;

export const SortOrderSchema = z.array(SortRuleSchema);

export type SortOrder = z.infer<typeof SortOrderSchema>;

/**
 * A sort rule on a stage that shows several node types: it sorts the nodes of
 * the one type it names, by an attribute of that type.
 */
export const NodeTypeSortRuleSchema = z.strictObject({
  id: protocolObjectId('sortRule'),
  type: entityTypeReference({ entity: 'node' }),
  property: entityAttributeReference({
    subject: { sibling: 'type', entity: 'node' },
    existence: 'unchecked',
    ignoreValues: [NOMINATION_ORDER_SORT_KEY],
  }),
  direction: z.enum(['asc', 'desc']),
});

export type NodeTypeSortRule = z.infer<typeof NodeTypeSortRuleSchema>;

export const NodeTypeSortOrderSchema = z.array(NodeTypeSortRuleSchema);

/**
 * The order the node types of a stage are listed in, before each type's own
 * sort rules apply. It names every one of the stage's node types once.
 */
export const NodeTypeOrderSchema = z.array(
  entityTypeReference({ entity: 'node' }),
);

/**
 * A sort order over the items of an external data source (a Name Generator
 * Roster's), whose sort keys are the source's columns: see
 * `dataSourceColumn`.
 */
export const DataSourceSortOrderSchema = z.array(
  sortRuleWith(
    entityAttributeReference({
      subject: 'stageSubject',
      existence: 'unchecked',
      dataSourceColumn: true,
      ignoreValues: [NOMINATION_ORDER_SORT_KEY],
    }),
  ),
);
