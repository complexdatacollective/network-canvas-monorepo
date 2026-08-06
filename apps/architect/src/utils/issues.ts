type FlattenedIssue = {
  issue: string;
  field: string;
};

/**
 * One entry per message in the form store's field errors.
 *
 * The store already keys errors by resolved field name (`prompts`,
 * `introductionPanel.title`) with an array of messages, so this only has to
 * pair each message with its field — the recursive walk this replaced existed
 * to unpick redux-form's nested error tree.
 */
const flattenIssues = (
  fieldErrors: Record<string, string[] | undefined>,
): FlattenedIssue[] =>
  Object.entries(fieldErrors).flatMap(([field, messages]) =>
    (messages ?? []).map((issue) => ({ issue, field })),
  );

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
    // Skip the synthetic `._error` variant when the path already targets an
    // `_error` node, which would otherwise yield a dead `..._error._error` id.
    if (!p.endsWith('._error')) {
      ids.push(getFieldId(`${p}._error`));
    }
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
