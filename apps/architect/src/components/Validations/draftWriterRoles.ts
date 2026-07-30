const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const variableIdsFromRows = (rows: unknown): ReadonlySet<string> => {
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    if (!isRecord(row) || typeof row.variable !== 'string') continue;
    ids.add(row.variable);
  }
  return ids;
};

export const draftFormFieldVariableIds = (
  fields: unknown,
): ReadonlySet<string> => variableIdsFromRows(fields);

export const draftAdditionalAttributeVariableIds = (
  prompts: unknown,
): ReadonlySet<string> => {
  const ids = new Set<string>();
  if (!Array.isArray(prompts)) return ids;
  for (const prompt of prompts) {
    if (!isRecord(prompt)) continue;
    for (const id of variableIdsFromRows(prompt.additionalAttributes)) {
      ids.add(id);
    }
  }
  return ids;
};
