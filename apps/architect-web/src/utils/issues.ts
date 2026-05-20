import { compact, flatMap, isPlainObject } from 'es-toolkit/compat';

type FlattenedIssue = {
  issue: string;
  field: string;
};

const flattenIssues = (
  issues: Record<string, unknown>,
  path = '',
): FlattenedIssue[] =>
  compact(
    flatMap(issues, (issue: unknown, field: string) => {
      // field array
      if (Array.isArray(issue)) {
        const itemIssues = flatMap(issue, (item: unknown, index: number) =>
          flattenIssues(
            item as Record<string, unknown>,
            `${path}${field}[${index}].`,
          ),
        );
        // array-level errors live on a non-index `_error` prop that the element
        // iteration above skips
        const arrayError = (issue as { _error?: unknown })._error;
        if (arrayError !== undefined) {
          return [
            ...itemIssues,
            { issue: arrayError as string, field: `${path}${field}._error` },
          ];
        }
        return itemIssues;
      }
      // nested field
      if (isPlainObject(issue)) {
        return flattenIssues(
          issue as Record<string, unknown>,
          `${path}${field}.`,
        );
      }

      if (issue === undefined) {
        return null;
      }

      // we've found the issue node!
      return { issue: issue as string, field: `${path}${field}` };
    }),
  ) as FlattenedIssue[];

const getFieldId = (field: string) => {
  // Needs to be safe for urls and ids
  const safeFieldName = encodeURIComponent(field.replace(/\[|\]|\./g, '_'));
  return `field_${safeFieldName}`;
};

// Ordered candidate ids for an issue path: exact match first, then progressively
// trimmed ancestors (each also tried with `._error`), so the nearest mounted
// anchor can be found when the exact field isn't in the DOM.
const candidateIdsFor = (field: string): string[] => {
  const ids: string[] = [];
  const push = (p: string) => {
    ids.push(getFieldId(p));
    ids.push(getFieldId(`${p}._error`));
  };
  let path = field;
  push(path);
  while (/[.[]/.test(path)) {
    const next = path.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
    if (!next || next === path) {
      break;
    }
    path = next;
    push(path);
  }
  return ids;
};

export { candidateIdsFor, flattenIssues, getFieldId };
