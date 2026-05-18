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
        return flatMap(issue, (item: unknown, index: number) =>
          flattenIssues(
            item as Record<string, unknown>,
            `${path}${field}[${index}].`,
          ),
        );
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

export { flattenIssues, getFieldId };
