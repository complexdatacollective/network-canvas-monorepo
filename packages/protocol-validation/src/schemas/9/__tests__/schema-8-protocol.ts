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

// A schema 8 Narrative preset named each highlighted attribute, and each edge
// type its legend showed, by its id. A schema 8 Narrative showed one node
// type, so each highlight entry named the attribute of its one row.
const legendIds = (stage: unknown) => {
  if (!isRecord(stage) || !Array.isArray(stage.presets)) return;
  for (const preset of stage.presets) {
    if (!isRecord(preset)) continue;
    if (Array.isArray(preset.highlight)) {
      preset.highlight = preset.highlight.map((highlight: unknown) => {
        if (!isRecord(highlight)) return highlight;
        const { attributes } = highlight;
        if (!Array.isArray(attributes) || attributes.length !== 1) {
          throw new Error('A schema 8 highlight names one attribute');
        }
        const [attribute] = attributes;
        return isRecord(attribute) ? attribute.variable : attribute;
      });
    }
    if (isRecord(preset.edges) && Array.isArray(preset.edges.display)) {
      preset.edges.display = preset.edges.display.map((edge: unknown) =>
        isRecord(edge) ? edge.type : edge,
      );
    }
  }
};

// A schema 8 Network Composer named each edge type in its toolbar by the
// type's name, so its edges carried no label.
const composerEdgeLabels = (stage: unknown) => {
  if (!isRecord(stage) || stage.type !== 'NetworkComposer') return;
  if (!Array.isArray(stage.edges)) return;
  for (const edge of stage.edges) {
    if (isRecord(edge)) delete edge.label;
  }
};

// A schema 8 Sociogram prompt had no task: a connect task created edges, a
// highlight task let participants highlight its one entry's attribute, and a
// layout task did neither.
const sociogramPromptTasks = (stage: unknown) => {
  if (!isRecord(stage) || stage.type !== 'Sociogram') return;
  if (!Array.isArray(stage.prompts)) return;
  for (const prompt of stage.prompts) {
    if (!isRecord(prompt)) continue;
    const { task, highlight } = prompt;
    delete prompt.task;
    // A schema 8 Sociogram sorted its one node type, so its rules named none
    // and it had no node type order.
    delete prompt.nodeTypeOrder;
    if (Array.isArray(prompt.sortOrder)) {
      for (const rule of prompt.sortOrder) {
        if (isRecord(rule)) delete rule.type;
      }
    }
    if (task !== 'highlight') continue;
    const [entry] = Array.isArray(highlight) ? highlight : [];
    prompt.highlight = {
      allowHighlighting: true,
      variable: isRecord(entry) ? entry.variable : undefined,
    };
  }
};

// A schema 8 node stage named its one node type as `subject.type`.
const singularNodeSubject = (stage: unknown) => {
  if (!isRecord(stage) || !isRecord(stage.subject)) return;
  const { entity, types } = stage.subject;
  if (entity !== 'node' || !Array.isArray(types)) return;
  if (types.length !== 1) {
    throw new Error('A schema 8 stage has exactly one node type');
  }
  stage.subject = { entity: 'node', type: types[0] };
};

// Schema 8 held a layout as a node attribute of type `layout`, on each node
// type that a stage placed in it, and each stage named it as a layout
// variable: a Sociogram on each of its prompts.
const layoutVariables = (stage: unknown, codebook: unknown) => {
  if (!isRecord(stage) || !isRecord(codebook)) return;
  const layouts = isRecord(codebook.layouts) ? codebook.layouts : {};
  const nodeTypes =
    isRecord(stage.subject) && Array.isArray(stage.subject.types)
      ? stage.subject.types.filter((type) => typeof type === 'string')
      : [];
  const declare = (layoutId: unknown) => {
    if (typeof layoutId !== 'string') return;
    const layout = layouts[layoutId];
    const name = isRecord(layout) ? layout.name : layoutId;
    for (const type of nodeTypes) {
      const definition = isRecord(codebook.node)
        ? codebook.node[type]
        : undefined;
      if (!isRecord(definition)) continue;
      const variables = isRecord(definition.variables)
        ? definition.variables
        : {};
      variables[layoutId] = { name, type: 'layout' };
      definition.variables = variables;
    }
  };
  if (stage.type === 'Sociogram' && Object.hasOwn(stage, 'layout')) {
    declare(stage.layout);
    if (Array.isArray(stage.prompts)) {
      for (const prompt of stage.prompts) {
        if (isRecord(prompt)) prompt.layout = { layoutVariable: stage.layout };
      }
    }
    delete stage.layout;
  }
  if (stage.type === 'NetworkComposer' && Object.hasOwn(stage, 'layout')) {
    declare(stage.layout);
    stage.layoutVariable = stage.layout;
    delete stage.layout;
  }
  if (stage.type === 'Narrative' && Array.isArray(stage.presets)) {
    for (const preset of stage.presets) {
      if (!isRecord(preset) || !Object.hasOwn(preset, 'layout')) continue;
      declare(preset.layout);
      preset.layoutVariable = preset.layout;
      delete preset.layout;
    }
  }
};

// A schema 8 Anonymisation stage held its heading as a title of its own,
// apart from the text below it.
const explanationTitle = (stage: unknown) => {
  if (!isRecord(stage) || stage.type !== 'Anonymisation') return;
  const { explanationText } = stage;
  if (typeof explanationText !== 'string') return;
  const match = /^# (.+)\n\n([\s\S]*)$/.exec(explanationText);
  stage.explanationText = match
    ? { title: match[1], body: match[2] }
    : { title: '', body: explanationText };
};

// A schema 8 Information stage held its heading as a title and the rest of
// its page as items: a text item for each paragraph, and an asset item for
// each block naming a file.
const informationItems = (
  stage: unknown,
  rewrite: (text: string) => string,
) => {
  if (!isRecord(stage) || stage.type !== 'Information') return;
  const { content: localizedContent } = stage;
  const content = isRecord(localizedContent) ? localizedContent.en : undefined;
  if (typeof content !== 'string') return;
  const blocks = content.split('\n\n');
  const heading = /^# (.+)$/.exec(blocks[0] ?? '');
  const items = (heading === null ? blocks : blocks.slice(1)).map(
    (block, index) => {
      const asset = /^!\[(.*)\]\(asset:([^?)]+)\)$/.exec(block);
      return asset === null
        ? { id: `item-${index}`, type: 'text', content: rewrite(block) }
        : {
            id: `item-${index}`,
            type: 'asset',
            content: asset[2],
            ...(asset[1] === ''
              ? {}
              : { description: rewrite(asset[1] ?? '') }),
          };
    },
  );
  delete stage.content;
  stage.title = heading === null ? '' : rewrite(heading[1] ?? '');
  stage.items = items;
};

/**
 * A schema 9 protocol written in English, as schema 8 held it: each localized
 * string is its English text, put through `rewrite` (text with placeholders,
 * which schema 8 never held, stays localized), Narrative highlights (each
 * the attribute of its entry's one row) and legend edges are ids, Network Composer edges have no label, a node stage
 * names its one node type as `subject.type`, each layout is a node attribute
of type `layout` named by the stages that use it (a Sociogram that used
several layouts stays split), an Anonymisation
 * explanation's heading is a title of its own, a Sociogram prompt has no
 * task (a highlight task allows highlighting its one entry's attribute) and
 * its sort rules name no node type, an Information page is a title
 * and a list of items, and the language
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
  for (const { path, value, arguments: declared } of collectLocalizedStrings(
    document,
  )) {
    // Text with placeholders is new in schema 9, as are the settings that
    // hold it, so the document keeps it as schema 9 holds it.
    if (declared !== undefined) continue;
    const text = value.en;
    const key = path.at(-1);
    // The page is rewritten a part at a time when it is split into a title
    // and items, below.
    const owner = path
      .slice(0, -1)
      .reduce<unknown>(
        (node, segment) =>
          isRecord(node) || Array.isArray(node)
            ? Reflect.get(node, segment)
            : undefined,
        document,
      );
    if (key === 'content' && isRecord(owner) && owner.type === 'Information') {
      continue;
    }
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
  for (const stage of document.stages) {
    sociogramPromptTasks(stage);
    layoutVariables(stage, document.codebook);
    legendIds(stage);
    composerEdgeLabels(stage);
    singularNodeSubject(stage);
    explanationTitle(stage);
    informationItems(stage, rewrite);
  }
  // Schema 8 has neither stage type: the interview chose no language, and
  // added its own finish screen.
  document.stages = document.stages.filter(
    (stage) =>
      isRecord(stage) &&
      stage.type !== 'LanguageChooser' &&
      stage.type !== 'FinishSession',
  );
  if (isRecord(document.codebook)) delete document.codebook.layouts;
  delete document.localization;
  // Schema 8 has no interface text: the interview showed its own words.
  delete document.interfaceText;
  document.schemaVersion = 8;
  return ProtocolSchemaV8.parse(document);
};
