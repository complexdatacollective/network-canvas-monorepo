import type { z } from 'zod';

import {
  dynamicValueNameFor,
  parseDynamicValueName,
  rewriteDynamicValueReferences,
} from '../schemas/9/dynamic-values.ts';
import { renameKeys, setValueAt, valueAt } from './protocolObjectIdRewrite.ts';
import {
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
   * names the owning type by the id it had before. Called once for each
   * variable, in codebook order: the node types' variables, then the edge
   * types', then the ego's. Absent, every variable keeps its id.
   */
  variableId?: (variableId: string, owner: VariableOwner) => string;
  /**
   * The new id of the layout stored under `layoutId`. Called once for each
   * layout, in codebook order, before `variableId` is called for any
   * variable, so a caller giving out ids can let layouts claim theirs first.
   * Absent, every layout keeps its id.
   */
  layoutId?: (layoutId: string) => string;
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

/**
 * The name text uses for the attribute `name` names, once that attribute's
 * id is `newId`, or undefined when `name` names no attribute.
 */
const renamedAttributeName = (
  name: string,
  newId: string,
): string | undefined => {
  const parsed = parseDynamicValueName(name);
  return parsed?.kind === 'attribute'
    ? dynamicValueNameFor({ ...parsed, variableId: newId })
    : undefined;
};

/**
 * Gives every node type, edge type, variable and layout in `root`'s codebook
 * the id `renames` names for it, and points every reference to each type and
 * variable at its new id: every site `schema` tags as an entity type
 * reference or an entity attribute reference, including each attribute text
 * that shows dynamic values names (`ego_<id>`), whose name in the text is
 * rewritten. No stage refers to a layout yet, so a layout is renamed in the
 * codebook alone. `root` is changed in place: it must be a copy the caller
 * owns.
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

  const layouts = isRecord(codebook) ? codebook.layouts : undefined;
  const renameLayout = renames.layoutId;
  const layoutRenames =
    isRecord(layouts) && renameLayout !== undefined
      ? new Map(Object.keys(layouts).map((key) => [key, renameLayout(key)]))
      : undefined;

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
  // The new name of each attribute a translation names, by the translation's
  // path: one translation can name several, so each is rewritten once.
  const messageRenames = new Map<
    string,
    { path: (string | number)[]; names: Map<string, string> }
  >();
  for (const hit of walkSchemaReferences(schema, root, {
    readAssetBlocks: false,
  })) {
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
    if (renamed === undefined) continue;
    if (hit.inMessage === undefined) {
      writes.push({ path: hit.path, value: renamed });
      continue;
    }
    const newName = renamedAttributeName(hit.inMessage.name, renamed);
    if (newName === undefined) continue;
    const key = JSON.stringify(hit.path);
    const entry = messageRenames.get(key) ?? {
      path: hit.path,
      names: new Map<string, string>(),
    };
    entry.names.set(hit.inMessage.name, newName);
    messageRenames.set(key, entry);
  }
  for (const { path, names } of messageRenames.values()) {
    const message = valueAt(root, path);
    if (typeof message !== 'string') continue;
    writes.push({
      path,
      value: rewriteDynamicValueReferences(message, {
        name: (name) => names.get(name),
      }),
    });
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
  if (isRecord(layouts) && layoutRenames !== undefined) {
    renameKeys(layouts, layoutRenames);
  }
};
