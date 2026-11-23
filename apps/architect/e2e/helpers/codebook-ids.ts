import type { Codebook } from '@codaco/protocol-validation';

type HasCodebook = Readonly<{ codebook: Codebook }>;

const keyNamed = (
  record: Readonly<Record<string, { name: string }>> | undefined,
  name: string,
  what: string,
): string => {
  const key = Object.entries(record ?? {}).find(
    ([, entry]) => entry.name === name,
  )?.[0];
  if (key === undefined) throw new Error(`Expected ${what} "${name}"`);
  return key;
};

/**
 * The id `protocol` keeps its node or edge type called `name` under. Codebook
 * ids are UUIDs, so a spec names a type by its name.
 */
export function typeIdNamed(
  protocol: HasCodebook,
  entity: 'node' | 'edge',
  name: string,
): string {
  return keyNamed(protocol.codebook[entity], name, `a ${entity} type`);
}

/**
 * The id `protocol` keeps the variable called `name` under, on the ego or on
 * the node or edge type called `typeName`.
 */
export function variableIdNamed(
  protocol: HasCodebook,
  owner: 'ego' | Readonly<{ entity: 'node' | 'edge'; typeName: string }>,
  name: string,
): string {
  const variables =
    owner === 'ego'
      ? protocol.codebook.ego?.variables
      : protocol.codebook[owner.entity]?.[
          typeIdNamed(protocol, owner.entity, owner.typeName)
        ]?.variables;
  return keyNamed(variables, name, 'a variable');
}
