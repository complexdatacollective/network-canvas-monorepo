import { collectLocalizedStrings } from '../../../utils/collectLocalizedStrings.ts';
import ProtocolSchemaV8 from '../../8/schema.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const definitionsIn = (record: unknown): Record<string, unknown>[] =>
  isRecord(record) ? Object.values(record).filter(isRecord) : [];

/** Every node and edge type definition in a codebook. */
export const codebookTypes = (protocol: unknown): Record<string, unknown>[] => {
  const codebook = isRecord(protocol) ? protocol.codebook : undefined;
  if (!isRecord(codebook)) return [];
  return [...definitionsIn(codebook.node), ...definitionsIn(codebook.edge)];
};

/** Every attribute definition in a codebook. */
export const codebookVariables = (
  protocol: unknown,
): Record<string, unknown>[] => {
  const codebook = isRecord(protocol) ? protocol.codebook : undefined;
  if (!isRecord(codebook)) return [];
  const ego = isRecord(codebook.ego) ? codebook.ego : {};
  return [
    ...codebookTypes(protocol).flatMap((type) => definitionsIn(type.variables)),
    ...definitionsIn(ego.variables),
  ];
};

// A schema 8 Narrative preset named each highlighted attribute by its id.
const highlightIds = (stage: unknown) => {
  if (!isRecord(stage) || !Array.isArray(stage.presets)) return;
  for (const preset of stage.presets) {
    if (!isRecord(preset) || !Array.isArray(preset.highlight)) continue;
    preset.highlight = preset.highlight.map((highlight: unknown) =>
      isRecord(highlight) ? highlight.variable : highlight,
    );
  }
};

/**
 * A schema 9 protocol written in English, as schema 8 held it: each localized
 * string is its English text, put through `rewrite`, codebook definitions
 * have no label, Narrative highlights are attribute ids, and the language
 * chooser and language settings, which schema 8 did not have, are gone.
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
  for (const definition of [
    ...codebookTypes(document),
    ...codebookVariables(document),
  ]) {
    delete definition.label;
  }
  for (const stage of document.stages) highlightIds(stage);
  document.stages = document.stages.filter(
    (stage) => isRecord(stage) && stage.type !== 'LanguageChooser',
  );
  delete document.localization;
  document.schemaVersion = 8;
  return ProtocolSchemaV8.parse(document);
};
