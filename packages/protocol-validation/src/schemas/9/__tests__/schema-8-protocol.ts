import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const definitionsIn = (record: unknown): Record<string, unknown>[] =>
  isRecord(record) ? Object.values(record).filter(isRecord) : [];

/** Every node and edge type and every attribute definition in a codebook. */
export const codebookDefinitions = (
  protocol: unknown,
): Record<string, unknown>[] => {
  const codebook = isRecord(protocol) ? protocol.codebook : undefined;
  if (!isRecord(codebook)) return [];
  const types = [
    ...definitionsIn(codebook.node),
    ...definitionsIn(codebook.edge),
  ];
  const ego = isRecord(codebook.ego) ? codebook.ego : {};
  return [
    ...types,
    ...types.flatMap((type) => definitionsIn(type.variables)),
    ...definitionsIn(ego.variables),
  ];
};

/**
 * A schema 9 protocol written in English, as schema 8 held it: each localized
 * string is its English text, put through `rewrite`, codebook definitions
 * have no label, and the language chooser and language settings, which
 * schema 8 did not have, are gone.
 */
export const asSchema8Protocol = (
  protocol: unknown,
  rewrite: (text: string) => string = (text) => text,
) => {
  const document: unknown = structuredClone(protocol);
  if (!isRecord(document) || !Array.isArray(document.stages)) {
    throw new Error('Not a protocol with stages');
  }
  for (const { path, value } of collectLocalizedStrings(document)) {
    const text = value.en;
    const key = path.at(-1);
    const parent = path
      .slice(0, -1)
      .reduce<unknown>(
        (node, segment) =>
          isRecord(node) || Array.isArray(node)
            ? Reflect.get(node, segment)
            : undefined,
        document,
      );
    if (
      text === undefined ||
      key === undefined ||
      typeof parent !== 'object' ||
      parent === null
    ) {
      throw new Error(`No English text at ${path.join('.')}`);
    }
    Reflect.set(parent, key, rewrite(text));
  }
  for (const definition of codebookDefinitions(document)) {
    delete definition.label;
  }
  document.stages = document.stages.filter(
    (stage) => isRecord(stage) && stage.type !== 'LanguageChooser',
  );
  delete document.localization;
  document.schemaVersion = 8;
  return ProtocolSchemaV8.parse(document);
};
