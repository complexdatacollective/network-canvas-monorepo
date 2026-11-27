import {
  type ContentNodes,
  type LocaleTag,
  type LocalizedString,
  type LogicInputs,
  markdownTree,
  type MessageNode,
  printMessageStructure,
  shownContent,
} from '@codaco/protocol-validation';
import { boundedCache } from '@codaco/shared-consts';

import type { DynamicValueSources } from '../dynamicValues/resolveDynamicText';

/** What text reads outside a stage: no values, and no conditions met. */
export const NO_SOURCES: DynamicValueSources = {
  intrinsics: { now: undefined },
  attributes: {},
  labels: {},
  variablesFor: () => undefined,
};

/** One block the document shows: a run of markdown, or a field. */
export type ShownBlock =
  | Readonly<{ kind: 'markdown'; key: string; value: LocalizedString }>
  | Readonly<{ kind: 'field'; fieldId: string }>;

/**
 * A run of markdown as protocol text in the language it is written in, kept
 * for as long as the reading it belongs to, so that a run renders from the
 * same value each time and its markdown is not read again.
 */
const runValues = new WeakMap<
  readonly MessageNode[],
  Map<LocaleTag, LocalizedString>
>();
const runValue = (
  nodes: readonly MessageNode[],
  locale: LocaleTag,
): LocalizedString => {
  let byLocale = runValues.get(nodes);
  if (byLocale === undefined) {
    byLocale = new Map();
    runValues.set(nodes, byLocale);
  }
  let value = byLocale.get(locale);
  if (value === undefined) {
    value = { [locale]: printMessageStructure(nodes) };
    byLocale.set(locale, value);
  }
  return value;
};

/**
 * The blocks a document shows, in order, as one flat list
 * (`shownContent`): each logic block is replaced by the version it shows,
 * read in turn. A run of markdown is keyed by its place in the document,
 * so that markdown in two versions of one block is never taken for the same
 * run. A field is keyed by its id, so a field keeps its place in the form
 * (its answer, its focus) when a logic block before it shows another
 * version.
 */
export const shownBlocks = (
  nodes: ContentNodes,
  inputs: LogicInputs,
): ShownBlock[] =>
  shownContent(nodes, inputs).map((block): ShownBlock =>
    block.kind === 'markdown'
      ? {
          kind: 'markdown',
          key: block.at.join('.'),
          value: runValue(block.nodes, inputs.locale),
        }
      : { kind: 'field', fieldId: block.fieldId },
  );

/** A node of the markdown tree, as far as finding definitions in it. */
type TreeNode = Readonly<{
  type: string;
  position?: Readonly<{
    start: Readonly<{ offset?: number }>;
    end: Readonly<{ offset?: number }>;
  }>;
  children?: readonly TreeNode[];
}>;

/**
 * The link reference definitions (`[label]: https://…`) that a run of
 * markdown contains, each as it is written there. A run is read again each
 * time the answers on a form change what is shown, so readings are kept
 * (`boundedCache`).
 */
const definitionsIn: (text: string) => readonly string[] = boundedCache(
  500,
  (text: string) => {
    const definitions: string[] = [];
    const visit = (node: TreeNode) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        node.type === 'definition' &&
        start !== undefined &&
        end !== undefined
      ) {
        definitions.push(text.slice(start, end));
        return;
      }
      node.children?.forEach(visit);
    };
    visit(markdownTree(text));
    return definitions;
  },
);

/**
 * Each run of markdown with the definitions of the runs around it, kept for
 * as long as the run's value, so that it renders from the same value each
 * time the same definitions go with it.
 */
const withDefinitionsCache = new WeakMap<
  LocalizedString,
  Map<string, LocalizedString>
>();

/**
 * The blocks, with each run of markdown given the link reference
 * definitions of every other run shown. A document is one text, whose
 * definitions apply wherever it is read, but it is drawn a run at a time
 * between its fields and the versions of its logic blocks: without them, a
 * link that names a definition written in another run would show as the
 * brackets typed.
 */
export const withSharedDefinitions = (
  blocks: readonly ShownBlock[],
  locale: LocaleTag,
): ShownBlock[] => {
  const runs = blocks.flatMap((block) =>
    block.kind === 'markdown'
      ? [{ block, definitions: definitionsIn(block.value[locale] ?? '') }]
      : [],
  );
  if (runs.every(({ definitions }) => definitions.length === 0)) {
    return [...blocks];
  }
  return blocks.map((block) => {
    if (block.kind !== 'markdown') return block;
    const others = runs
      .filter((run) => run.block !== block)
      .flatMap((run) => run.definitions);
    if (others.length === 0) return block;
    const shared = others.join('\n\n');
    let byDefinitions = withDefinitionsCache.get(block.value);
    if (byDefinitions === undefined) {
      byDefinitions = new Map();
      withDefinitionsCache.set(block.value, byDefinitions);
    }
    let value = byDefinitions.get(shared);
    if (value === undefined) {
      value = { [locale]: `${block.value[locale] ?? ''}\n\n${shared}` };
      byDefinitions.set(shared, value);
    }
    return { ...block, value };
  });
};
