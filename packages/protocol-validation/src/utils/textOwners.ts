import { isRecord } from '@codaco/shared-consts';

/**
 * Where an owner of text sits in a protocol: a stage (`['stages', 2]`), or a
 * node type's own label (`['codebook', 'node', type, 'dynamicLabel']`). An
 * owner declares the conditions and the dynamic attributes that its text
 * uses, beside that text.
 */
export type TextOwnerPath =
  | readonly ['stages', number]
  | readonly ['codebook', 'node', string, 'dynamicLabel'];

/**
 * The owner of the conditions and dynamic attributes that the text at
 * `path` can use. Undefined for text that has none, such as an option's
 * label.
 */
export const ownerOfTextPath = (
  path: readonly (string | number)[],
): TextOwnerPath | undefined => {
  const [root, second, third, fourth] = path;
  if (root === 'stages' && typeof second === 'number') return [root, second];
  if (
    root === 'codebook' &&
    second === 'node' &&
    typeof third === 'string' &&
    fourth === 'dynamicLabel'
  ) {
    return [root, second, third, fourth];
  }
  return undefined;
};

/**
 * Every owner of text in `protocol` that can declare conditions and dynamic
 * attributes: each stage, and each node type that has a label of its own.
 */
export const textOwnersOf = (protocol: unknown): TextOwnerPath[] => {
  if (!isRecord(protocol)) return [];
  const stages = Array.isArray(protocol.stages) ? protocol.stages : [];
  const codebook = isRecord(protocol.codebook) ? protocol.codebook : {};
  const nodeTypes = isRecord(codebook.node) ? codebook.node : {};
  return [
    ...stages.map((_stage, index): TextOwnerPath => ['stages', index]),
    ...Object.entries(nodeTypes).flatMap(
      ([type, definition]): TextOwnerPath[] =>
        isRecord(definition) && isRecord(definition.dynamicLabel)
          ? [['codebook', 'node', type, 'dynamicLabel']]
          : [],
    ),
  ];
};
