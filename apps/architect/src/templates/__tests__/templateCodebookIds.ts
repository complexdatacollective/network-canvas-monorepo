import type { CurrentProtocol } from '@codaco/protocol-validation';

const keyNamed = (
  record: Readonly<Record<string, { name: string }>> | undefined,
  name: string,
): string | undefined =>
  Object.entries(record ?? {}).find(([, entry]) => entry.name === name)?.[0];

/**
 * The id a bundled protocol keeps its node or edge type called `name` under.
 * Its codebook ids are generated UUIDs, so a test names a type by its name.
 */
export function templateTypeId(
  protocol: CurrentProtocol,
  entity: 'node' | 'edge',
  name: string,
): string {
  const key = keyNamed(protocol.codebook[entity], name);
  if (key === undefined) {
    throw new Error(`The protocol has no ${entity} type "${name}".`);
  }
  return key;
}

/**
 * The id a bundled protocol keeps the variable called `name` under, on the
 * ego or on the node or edge type called `typeName`.
 */
export function templateVariableId(
  protocol: CurrentProtocol,
  owner: 'ego' | Readonly<{ entity: 'node' | 'edge'; typeName: string }>,
  name: string,
): string {
  const variables =
    owner === 'ego'
      ? protocol.codebook.ego?.variables
      : protocol.codebook[owner.entity]?.[
          templateTypeId(protocol, owner.entity, owner.typeName)
        ]?.variables;
  const key = keyNamed(variables, name);
  if (key === undefined) {
    throw new Error(`The protocol has no variable "${name}".`);
  }
  return key;
}
