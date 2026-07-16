import type {
  SortableProperty,
  SortOptionValue,
  SortRule,
  SortType as CollectionSortType,
} from '@codaco/fresco-ui/collection/sorting/types';
import { entityAttributesProperty } from '@codaco/shared-consts';

import type { getNodeVariables } from '../../selectors/interface';
import { mapNCType } from '../../utils/createSorter';
import { convertNamesToUUIDs } from './helpers';

type NodeVariables = ReturnType<typeof getNodeVariables>;

type ProtocolSortRule = { property: string; direction: 'asc' | 'desc' };

type RosterSortOptions = {
  sortOrder?: ProtocolSortRule[];
  sortableProperties?: { label: string; variable: string }[];
};

/**
 * The ordered option values (rank) of an ordinal/categorical variable, used to
 * drive the Collection sorter's hierarchy/categorical comparators. Returns
 * undefined for variable types that do not carry options.
 */
const getHierarchy = (
  variableDef: NodeVariables[string] | undefined,
): SortOptionValue[] | undefined => {
  if (
    variableDef &&
    (variableDef.type === 'ordinal' || variableDef.type === 'categorical')
  ) {
    return variableDef.options.map((option) => option.value);
  }
  return undefined;
};

/**
 * Builds a Collection sort rule from a single protocol sort rule. A '*'
 * property is passed through as the scalar insertion-order property; everything
 * else is resolved to its attribute path and typed from the codebook (ordinal
 * and categorical variables carry their option order as `hierarchy`).
 */
const buildSortRule = (
  rule: ProtocolSortRule,
  nodeVariables: NodeVariables,
): SortRule => {
  if (rule.property === '*') {
    return { property: '*', direction: rule.direction, type: 'number' };
  }

  const uuid = convertNamesToUUIDs(nodeVariables, [rule.property])[0]!;
  const variableDef = nodeVariables[uuid];
  const type: CollectionSortType = mapNCType(variableDef?.type);
  const hierarchy = getHierarchy(variableDef);

  return {
    property: ['data', entityAttributesProperty, uuid],
    direction: rule.direction,
    type,
    ...(hierarchy ? { hierarchy } : {}),
  };
};

/**
 * Resolves a sortable property (participant-toggleable sort) to its attribute
 * path and codebook type, carrying option order for ordinal/categorical
 * variables.
 */
const buildSortableProperty = (
  { variable, label }: { label: string; variable: string },
  nodeVariables: NodeVariables,
): SortableProperty => {
  const uuid = convertNamesToUUIDs(nodeVariables, [variable])[0]!;
  const variableDef = nodeVariables[uuid];
  const type: CollectionSortType = mapNCType(variableDef?.type);
  const hierarchy = getHierarchy(variableDef);

  return {
    property: ['data', entityAttributesProperty, uuid],
    label,
    type,
    ...(hierarchy ? { hierarchy } : {}),
  };
};

/**
 * Derives the Collection sort configuration for a roster from its protocol
 * `sortOptions`.
 *
 * - When `sortOrder` is absent or empty, `initialSortRules` is undefined so the
 *   Collection preserves data-file (insertion) order rather than defaulting to
 *   a name sort.
 * - The full `sortOrder` array is mapped (multi-key tie-break sorting), not just
 *   the first rule.
 * - `sortableProperties` is computed independently of `sortOrder`.
 */
export const buildRosterSortConfig = (
  sortOptions: RosterSortOptions | undefined,
  nodeVariables: NodeVariables,
): {
  initialSortRules: SortRule[] | undefined;
  sortableProperties: SortableProperty[] | undefined;
} => {
  if (!sortOptions) {
    return { initialSortRules: undefined, sortableProperties: undefined };
  }

  const sortOrder = sortOptions.sortOrder ?? [];

  const initialSortRules =
    sortOrder.length > 0
      ? sortOrder.map((rule) => buildSortRule(rule, nodeVariables))
      : undefined;

  const sortableProperties = sortOptions.sortableProperties?.map((sortable) =>
    buildSortableProperty(sortable, nodeVariables),
  );

  return { initialSortRules, sortableProperties };
};
