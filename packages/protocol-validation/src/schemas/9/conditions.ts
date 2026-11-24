import { z } from 'zod';

import { DYNAMIC_VALUE_NAME } from '../../localization/dynamicValueMessages.ts';
import type { DynamicValueRole } from './dynamic-values.ts';
import { entityTypeReference } from './entity-type-reference.ts';
import { filterRuleSchema } from './filters/index.ts';
import { protocolObjectId } from './protocol-object-id.ts';

/**
 * How a count of edges is compared: against a number, or against the counts
 * of the other nodes of the same type (`MOST`, `FEWEST`), which take no
 * number. Nodes that tie for the most or the fewest all match, and none does
 * while every node of the type has the same count.
 */
export const EdgeCountComparisons = [
  'EXACTLY',
  'NOT',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'MOST',
  'FEWEST',
] as const;
export type EdgeCountComparison = (typeof EdgeCountComparisons)[number];

/** Whether a comparison is made against a number the rule gives. */
export const edgeCountNeedsValue = (comparison: EdgeCountComparison): boolean =>
  comparison !== 'MOST' && comparison !== 'FEWEST';

/**
 * A rule about how many edges join a node to others: every edge, or those of
 * one type. Only a condition holds one; a filter keeps or drops entities and
 * has no single node to count for.
 */
export const EdgeCountRuleSchema = z
  .strictObject({
    type: z.literal('edge'),
    id: protocolObjectId('rule'),
    options: z.strictObject({
      /** The one edge type counted; absent, every edge counts. */
      type: entityTypeReference({ entity: 'edge' }).optional(),
      count: z.enum(EdgeCountComparisons),
      value: z.number().int().min(0).optional(),
    }),
  })
  .superRefine((rule, ctx) => {
    const needsValue = edgeCountNeedsValue(rule.options.count);
    if (needsValue && rule.options.value === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'This comparison needs a number of edges to compare with.',
        path: ['options', 'value'],
      });
    }
    if (!needsValue && rule.options.value !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'The most and the fewest are judged against the other nodes, so they take no number.',
        path: ['options', 'value'],
      });
    }
  });

export type EdgeCountRule = z.infer<typeof EdgeCountRuleSchema>;

export const ConditionRuleSchema = z.union([
  EdgeCountRuleSchema,
  filterRuleSchema,
]);
export type ConditionRule = z.infer<typeof ConditionRuleSchema>;

/** Whether a condition's rule counts edges rather than comparing an answer. */
export const isEdgeCountRule = (rule: ConditionRule): rule is EdgeCountRule =>
  'count' in rule.options;

/** The roles a condition's node and edge rules can be asked of. */
export const CONDITION_ROLES = [
  'node',
  'edge',
  'dyadSource',
  'dyadTarget',
  'focal',
] as const satisfies readonly DynamicValueRole[];
export type ConditionRole = (typeof CONDITION_ROLES)[number];

/**
 * A test that text chooses its wording by: rules, and how they combine,
 * asked where the text is shown.
 *
 * - An ego rule compares one of the participant's attributes.
 * - A node rule compares an attribute of the node named by `about`.
 * - An edge rule asks about the edges that join that node to others: whether
 *   there is one of a type, whether one has an attribute that matches, or
 *   how many there are. Where `about` is the edge a form describes, an edge
 *   rule compares that edge's own attributes instead.
 *
 * `about` is required once a rule is about a node or an edge, and names
 * which entity on screen that is (the node a form describes, the first or
 * second node of a pair, and so on). A node type's label is about the node
 * it is on, `node`.
 */
export const ConditionSchema = z
  .strictObject({
    about: z.enum(CONDITION_ROLES).optional(),
    join: z.enum(['OR', 'AND']).optional(),
    rules: z.array(ConditionRuleSchema).min(1),
  })
  .superRefine((condition, ctx) => {
    if (condition.rules.length > 1 && condition.join === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'A condition with more than one rule must say how they combine, with a join of "AND" or "OR".',
        path: ['join'],
      });
    }
    const needsAbout = condition.rules.some((rule) => rule.type !== 'ego');
    if (needsAbout && condition.about === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'A condition with a node or edge rule must say which node or edge it is about.',
        path: ['about'],
      });
    }
  });

export type Condition = z.infer<typeof ConditionSchema>;

/**
 * Conditions by id; an id is an argument-like name.
 *
 * Declared with its type written out: every stage schema holds it, and left
 * to inference the stage union's type grows past what the compiler will
 * write into a declaration.
 */
export type Conditions = Record<string, Condition>;

export const ConditionsSchema: z.ZodType<Conditions> = z
  .record(z.string(), ConditionSchema)
  .superRefine((conditions, ctx) => {
    for (const id of Object.keys(conditions)) {
      if (!DYNAMIC_VALUE_NAME.test(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${id}" cannot identify a condition: use ASCII letters and digits, starting with a letter.`,
          path: [id],
        });
      }
    }
  });
