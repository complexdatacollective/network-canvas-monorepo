import type { NodeTypeSortRule } from './sort.ts';

type SortingIssue = { path: (string | number)[]; message: string };

/**
 * The problems with a stage's sorting by node type: each typed rule must be
 * about one of the stage's node types, and a node type order must name each
 * of them exactly once.
 */
export const findNodeTypeSortingProblems = ({
  nodeTypeNames,
  nodeTypes,
  rules,
  rulesPath,
  order,
  orderPath,
}: {
  nodeTypeNames: Readonly<Record<string, { name?: string } | undefined>>;
  nodeTypes: readonly string[];
  rules: readonly NodeTypeSortRule[] | undefined;
  rulesPath: readonly (string | number)[];
  order: readonly string[] | undefined;
  orderPath: readonly (string | number)[];
}): SortingIssue[] => {
  const nameOf = (type: string) =>
    Object.hasOwn(nodeTypeNames, type)
      ? (nodeTypeNames[type]?.name ?? type)
      : type;
  const issues: SortingIssue[] = [];
  rules?.forEach((rule, index) => {
    if (nodeTypes.includes(rule.type)) return;
    issues.push({
      path: [...rulesPath, index, 'type'],
      message: `A sort rule is about node type "${nameOf(rule.type)}", which this stage does not show.`,
    });
  });
  if (order === undefined) return issues;
  const seen = new Set<string>();
  order.forEach((type, index) => {
    if (!nodeTypes.includes(type)) {
      issues.push({
        path: [...orderPath, index],
        message: `The node type order names node type "${nameOf(type)}", which this stage does not show.`,
      });
    } else if (seen.has(type)) {
      issues.push({
        path: [...orderPath, index],
        message: `The node type order names node type "${nameOf(type)}" more than once.`,
      });
    }
    seen.add(type);
  });
  for (const type of nodeTypes) {
    if (seen.has(type)) continue;
    issues.push({
      path: [...orderPath],
      message: `The node type order does not name node type "${nameOf(type)}".`,
    });
  }
  return issues;
};
