import type { z } from 'zod';

import {
  dynamicValuePathFor,
  parseDynamicValuePath,
} from '../schemas/9/dynamic-values.ts';
import { setValueAt, valueAt } from './protocolObjectIdRewrite.ts';
import {
  type EntityAttributeReferenceHit,
  isAttributeHit,
  isTypeHit,
  walkSchemaReferences,
} from './schemaReferenceWalk.ts';

/** The entity a set of codebook variables belongs to. */
export type VariableOwner =
  | Readonly<{ entity: 'ego' }>
  | Readonly<{ entity: 'node' | 'edge'; type: string }>;

export type CodebookIdRenames = {
  /**
   * The new id of the node or edge type stored under `typeId`. Absent, every
   * type keeps its id.
   */
  typeId?: (typeId: string, entity: 'node' | 'edge') => string;
  /**
   * The new id of the variable stored under `variableId` by `owner`, which
   * names the owning type by the id it had before. Absent, every variable
   * keeps its id.
   */
  variableId?: (variableId: string, owner: VariableOwner) => string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ownerKey = (owner: VariableOwner): string =>
  owner.entity === 'ego' ? 'ego' : `${owner.entity}/${owner.type}`;

type VariableRecord = {
  owner: VariableOwner;
  variables: Record<string, unknown>;
};

const ENTITIES = ['node', 'edge'] as const;

const variableRecordsOf = (codebook: unknown): VariableRecord[] => {
  if (!isRecord(codebook)) return [];
  const records: VariableRecord[] = [];
  for (const entity of ENTITIES) {
    const types = codebook[entity];
    if (!isRecord(types)) continue;
    for (const [type, definition] of Object.entries(types)) {
      if (isRecord(definition) && isRecord(definition.variables)) {
        records.push({
          owner: { entity, type },
          variables: definition.variables,
        });
      }
    }
  }
  const ego = codebook.ego;
  if (isRecord(ego) && isRecord(ego.variables)) {
    records.push({ owner: { entity: 'ego' }, variables: ego.variables });
  }
  return records;
};

/**
 * The entity a filter rule's attribute belongs to, read from the rule as the
 * filter checks read it: the participant for an `ego` rule, and otherwise
 * the codebook type the rule's `options.type` names.
 */
const filterRuleOwner = (
  root: unknown,
  attributePath: readonly (string | number)[],
): VariableOwner | undefined => {
  if (attributePath.at(-2) !== 'options') return undefined;
  const rule = valueAt(root, attributePath.slice(0, -2));
  if (!isRecord(rule) || !isRecord(rule.options)) return undefined;
  if (rule.type === 'ego') return { entity: 'ego' };
  const type = rule.options.type;
  if (
    (rule.type === 'node' || rule.type === 'edge') &&
    typeof type === 'string'
  ) {
    return { entity: rule.type, type };
  }
  return undefined;
};

const replacedValue = (
  current: unknown,
  hit: EntityAttributeReferenceHit,
  newId: string,
): string | undefined => {
  if (!hit.inDynamicValuePath) return newId;
  const parsed =
    typeof current === 'string' ? parseDynamicValuePath(current) : undefined;
  return parsed?.kind === 'attribute'
    ? dynamicValuePathFor(parsed.role, newId)
    : undefined;
};

/**
 * Renames the keys of `record` in place, keeping their order. Each entry is
 * defined rather than assigned, so a `__proto__` key stays an entry instead
 * of replacing the record's prototype.
 */
const renameKeys = (
  record: Record<string, unknown>,
  renames: ReadonlyMap<string, string>,
): void => {
  const entries = Object.entries(record);
  for (const key of Object.keys(record)) delete record[key];
  for (const [key, value] of entries) {
    Object.defineProperty(record, renames.get(key) ?? key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
};

/**
 * Gives every node type, edge type and variable in `root`'s codebook the id
 * `renames` names for it, and points every reference to each at its new id:
 * every site `schema` tags as an entity type reference or an entity
 * attribute reference, including the attribute a dynamic value's path names.
 * `root` is changed in place: it must be a copy the caller owns.
 *
 * Every reference is resolved against the document as it was before any
 * renaming, so a variable is renamed by the type that owned it under that
 * type's old id. A variable reference is renamed against the entity it
 * resolves to, as reference validation resolves it, so one key used by two
 * entities can be given two new ids. One whose entity cannot be resolved is
 * renamed only where exactly one entity has a variable with its key. A
 * reference that names nothing in the codebook, and a column of an external
 * data source (`dataSourceColumn`), are left as they are.
 */
export const rewriteCodebookIds = (
  schema: z.ZodType,
  root: Record<string, unknown>,
  renames: CodebookIdRenames,
): void => {
  const codebook = root.codebook;
  const typeRenames = new Map<string, Map<string, string>>();
  for (const entity of ENTITIES) {
    const types = isRecord(codebook) ? codebook[entity] : undefined;
    const rename = renames.typeId;
    if (!isRecord(types) || rename === undefined) continue;
    typeRenames.set(
      entity,
      new Map(Object.keys(types).map((type) => [type, rename(type, entity)])),
    );
  }

  const records = variableRecordsOf(codebook);
  const variableRenames = new Map<string, Map<string, string>>();
  const renameVariable = renames.variableId;
  if (renameVariable !== undefined) {
    for (const { owner, variables } of records) {
      variableRenames.set(
        ownerKey(owner),
        new Map(
          Object.keys(variables).map((key) => [
            key,
            renameVariable(key, owner),
          ]),
        ),
      );
    }
  }
  const uniqueVariableRename = (variableId: string): string | undefined => {
    const found = [...variableRenames.values()].flatMap((byKey) => {
      const renamed = byKey.get(variableId);
      return renamed === undefined ? [] : [renamed];
    });
    return found.length === 1 ? found[0] : undefined;
  };

  // Every new value is worked out before any is written, so that each
  // reference is resolved against the document as it was.
  const writes: { path: (string | number)[]; value: string }[] = [];
  for (const hit of walkSchemaReferences(schema, root)) {
    if (isTypeHit(hit)) {
      const renamed = typeRenames.get(hit.entity)?.get(hit.typeId);
      if (renamed !== undefined)
        writes.push({ path: hit.path, value: renamed });
      continue;
    }
    if (!isAttributeHit(hit) || hit.dataSourceColumn) continue;
    const owner = hit.subject ?? filterRuleOwner(root, hit.path);
    const renamed =
      owner === undefined
        ? uniqueVariableRename(hit.variableId)
        : variableRenames.get(ownerKey(owner))?.get(hit.variableId);
    const value =
      renamed === undefined
        ? undefined
        : replacedValue(valueAt(root, hit.path), hit, renamed);
    if (value !== undefined) writes.push({ path: hit.path, value });
  }
  for (const { path, value } of writes) setValueAt(root, path, value);

  for (const { owner, variables } of records) {
    const byKey = variableRenames.get(ownerKey(owner));
    if (byKey !== undefined) renameKeys(variables, byKey);
  }
  for (const entity of ENTITIES) {
    const types = isRecord(codebook) ? codebook[entity] : undefined;
    const byType = typeRenames.get(entity);
    if (isRecord(types) && byType !== undefined) renameKeys(types, byType);
  }
};
