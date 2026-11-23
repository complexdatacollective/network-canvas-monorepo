import { v4, v5 } from 'uuid';
import { z } from 'zod';

/**
 * The keys the codebook stores its entries under, and so the ids everything
 * that refers to an entry holds: a node type, an edge type or a variable is
 * named by a UUID. Like a protocol object id, it is opaque, and says nothing
 * about the entry's name or position.
 *
 * Unbranded, unlike `ProtocolObjectIdSchema`: these are the keys of the
 * codebook's records, which every host reads and writes as
 * `Record<string, …>`, and a branded key would make each read and write cast.
 */
const codebookId = (what: string) => {
  const schema = z.uuid({ error: `A ${what} id must be a UUID.` });
  return {
    schema,
    /** Whether a value is usable as an id of this kind. */
    is: (value: unknown): boolean => schema.safeParse(value).success,
    /** A new, random id, for an entry being created. */
    create: (): string => schema.parse(v4()),
    /**
     * A function that names ids by label within `namespace` (a UUID), for a
     * generator that must give the same entries the same ids every time it
     * runs. Changing the namespace changes every id it gives.
     */
    deterministic:
      (namespace: string) =>
      (label: string): string =>
        schema.parse(v5(label, namespace)),
  };
};

const variableId = codebookId('variable');
const entityTypeId = codebookId('node or edge type');

export const VariableIdSchema = variableId.schema;
export const isVariableId = variableId.is;
export const createVariableId = variableId.create;
export const deterministicVariableId = variableId.deterministic;

export const EntityTypeIdSchema = entityTypeId.schema;
export const isEntityTypeId = entityTypeId.is;
export const createEntityTypeId = entityTypeId.create;
export const deterministicEntityTypeId = entityTypeId.deterministic;

/**
 * A codebook record keyed by `key`, refusing a key that is not an id with a
 * message that names it, where zod would only say the key is invalid. `what`
 * names the entries, as in "variable" or "node type".
 */
export const codebookRecord = <Value extends z.ZodType>(
  key: typeof VariableIdSchema,
  value: Value,
  what: string,
) =>
  z.record(key, value, {
    error: (issue) =>
      issue.code === 'invalid_key'
        ? `The ${what} id ${JSON.stringify(issue.input)} is not a UUID. Every ${what} id must be a UUID.`
        : undefined,
  });
