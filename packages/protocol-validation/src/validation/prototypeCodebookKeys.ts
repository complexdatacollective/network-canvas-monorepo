import type { ProtocolValidationIssue } from './validate-protocol.ts';

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const PROTOTYPE_KEY = '__proto__';

const issueAt = (path: string[]): ProtocolValidationIssue => ({
  code: 'custom',
  path: [...path, PROTOTYPE_KEY],
  message: `An id cannot be ${PROTOTYPE_KEY}`,
});

const variablesIssues = (
  entity: unknown,
  path: string[],
): ProtocolValidationIssue[] => {
  if (!isRecord(entity) || !isRecord(entity.variables)) return [];
  return Object.hasOwn(entity.variables, PROTOTYPE_KEY)
    ? [issueAt([...path, 'variables'])]
    : [];
};

/**
 * Finds codebook ids of `__proto__` in a protocol as read from its file.
 *
 * Zod's records skip a `__proto__` key without consulting the key schema, so
 * the schema alone drops such an entry instead of refusing it. This reads the
 * raw document, before any schema has parsed it.
 */
export const findPrototypeCodebookKeys = (
  protocol: unknown,
): ProtocolValidationIssue[] => {
  if (!isRecord(protocol) || !isRecord(protocol.codebook)) return [];
  const { codebook } = protocol;
  const issues: ProtocolValidationIssue[] = [];
  for (const entity of ['node', 'edge'] as const) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    if (Object.hasOwn(types, PROTOTYPE_KEY)) {
      issues.push(issueAt(['codebook', entity]));
    }
    for (const [typeId, type] of Object.entries(types)) {
      issues.push(...variablesIssues(type, ['codebook', entity, typeId]));
    }
  }
  issues.push(...variablesIssues(codebook.ego, ['codebook', 'ego']));
  return issues;
};
