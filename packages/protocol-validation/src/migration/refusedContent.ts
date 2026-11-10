import { isBlankMessage, isBlankText } from '../localization/blankText.ts';
import { messageText } from '../localization/messageSyntax.ts';
import type { ProtocolValidationIssue } from '../validation/validate-protocol.ts';

/**
 * A place in a migrated protocol that is empty, where the migration copied
 * the researcher's own content rather than writing anything of its own.
 */
export type RefusedContentProblem = {
  /** Segments from the migrated protocol's root, as the issue reported them. */
  path: (string | number)[];
  /**
   * Where it is, in plain English a researcher can follow in Architect: the
   * stage and field, or the type, attribute and option.
   */
  place: string;
  /** The schema's own message, in English, as validation reports it. */
  message: string;
};

type Path = readonly (string | number)[];
type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const valueAt = (root: unknown, path: Path): unknown =>
  path.reduce<unknown>((value, segment) => {
    if (Array.isArray(value) && typeof segment === 'number') {
      return value[segment];
    }
    return isRecord(value) ? value[String(segment)] : undefined;
  }, root);

/** Nothing there, or text that shows nothing, as the schema judges it. */
const isBlankContent = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    return value.trim() === '' || isBlankText(value) || isBlankMessage(value);
  }
  if (isRecord(value)) {
    return Object.values(value).every(
      (message) => typeof message === 'string' && isBlankMessage(message),
    );
  }
  return false;
};

/** The text a localized field shows in the protocol's default language. */
const shownText = (protocol: unknown, value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  const localization = valueAt(protocol, ['localization', 'defaultLocale']);
  const preferred =
    typeof localization === 'string' ? value[localization] : undefined;
  const message =
    typeof preferred === 'string'
      ? preferred
      : Object.values(value).find(
          (candidate): candidate is string => typeof candidate === 'string',
        );
  if (message === undefined) return undefined;
  return messageText(message).trim() || undefined;
};

const quoted = (text: string) => `“${text}”`;

// Named by its label, not its position: the migration may add stages (an
// introduction before a Family Pedigree), so a position in the migrated
// protocol is not the one the researcher sees in the Architect that made it.
// A stage with no name was given `Stage` and its own position before any
// stage was added, so the label is always there to name it by.
const stagePlace = (protocol: unknown, index: number): string => {
  const label = shownText(
    protocol,
    valueAt(protocol, ['stages', index, 'label']),
  );
  return label === undefined ? 'A stage' : `Stage ${quoted(label)}`;
};

const ENTITY_NAMES = { node: 'Node type', edge: 'Edge type' } as const;

const typePlace = (protocol: unknown, entity: 'node' | 'edge', id: string) => {
  const name = valueAt(protocol, ['codebook', entity, id, 'name']);
  return typeof name === 'string' && name.trim() !== ''
    ? `${ENTITY_NAMES[entity]} ${quoted(name)}`
    : `${ENTITY_NAMES[entity]} with no name`;
};

const ownerPlace = (protocol: unknown, owner: Path): string => {
  const [, entity, id] = owner;
  if (entity === 'ego') return 'Ego';
  return entity === 'node' || entity === 'edge'
    ? typePlace(protocol, entity, String(id))
    : 'Codebook';
};

const attributePlace = (protocol: unknown, attribute: Path): string => {
  const name = valueAt(protocol, [...attribute, 'name']);
  const owner = ownerPlace(protocol, attribute.slice(0, -2));
  return typeof name === 'string' && name.trim() !== ''
    ? `${owner}, attribute ${quoted(name)}`
    : `${owner}, an attribute with no name`;
};

const isIndex = (segment: unknown): segment is number =>
  typeof segment === 'number';
const isKey = (segment: unknown): segment is string =>
  typeof segment === 'string';

/**
 * Names a place the migration copies from the researcher's protocol and never
 * writes itself, or answers `undefined` when the path is anywhere else. A
 * trailing segment for a translation's language is allowed.
 */
const describePlace = (protocol: unknown, path: Path): string | undefined => {
  const [root, ...rest] = path;

  if (root === 'stages' && isIndex(rest[0])) {
    const stage = stagePlace(protocol, rest[0]);
    const [, field, a, b, c] = rest;
    const atEnd = (count: number) =>
      rest.length === count ||
      (rest.length === count + 1 && isKey(rest[count]));

    if (field === 'prompts' && isIndex(a) && b === 'text' && atEnd(4)) {
      return `${stage}, prompt ${a + 1}`;
    }
    if (
      field === 'prompts' &&
      isIndex(a) &&
      b === 'otherVariablePrompt' &&
      atEnd(4)
    ) {
      return `${stage}, prompt ${a + 1}, the question asking participants to describe an answer that is not listed`;
    }
    if (field === 'prompt' && atEnd(2)) return `${stage}, prompt`;
    if (
      field === 'nominationPrompts' &&
      isIndex(a) &&
      b === 'text' &&
      atEnd(4)
    ) {
      return `${stage}, nomination prompt ${a + 1}`;
    }
    if (
      field === 'form' &&
      a === 'fields' &&
      isIndex(b) &&
      c === 'prompt' &&
      atEnd(5)
    ) {
      return `${stage}, the question of form field ${b + 1}`;
    }
    return undefined;
  }

  if (root !== 'codebook') return undefined;
  const [entity] = rest;

  // codebook.<node|edge>.<type>.name
  if (
    (entity === 'node' || entity === 'edge') &&
    isKey(rest[1]) &&
    rest[2] === 'name' &&
    rest.length === 3
  ) {
    return `${ENTITY_NAMES[entity]} with no name`;
  }

  // codebook.<node|edge>.<type>.variables.<attribute>… and codebook.ego.variables.<attribute>…
  const attributeAt =
    entity === 'ego' ? 2 : entity === 'node' || entity === 'edge' ? 3 : -1;
  if (attributeAt < 0 || rest[attributeAt - 1] !== 'variables') {
    return undefined;
  }
  if (!isKey(rest[attributeAt])) return undefined;
  const attribute = path.slice(0, attributeAt + 2);
  const below = rest.slice(attributeAt + 1);

  if (below.length === 1 && below[0] === 'name') {
    return `${ownerPlace(protocol, path.slice(0, attributeAt))}, an attribute with no name`;
  }
  if (
    below.length === 3 &&
    below[0] === 'options' &&
    isIndex(below[1]) &&
    below[2] === 'value'
  ) {
    return `${attributePlace(protocol, attribute)}, the value of option ${below[1] + 1}`;
  }
  // An option's label is repaired from its value, so a label left blank
  // beside a blank value is refused with it: both say what the option means.
  if (
    (below.length === 3 || (below.length === 4 && isKey(below[3]))) &&
    below[0] === 'options' &&
    isIndex(below[1]) &&
    below[2] === 'label' &&
    isBlankContent(
      valueAt(protocol, [...attribute, 'options', below[1], 'value']),
    )
  ) {
    return `${attributePlace(protocol, attribute)}, the label of option ${below[1] + 1}`;
  }
  return undefined;
};

/**
 * The content a migration refused to invent, when that is the only reason its
 * result is invalid; otherwise `undefined`.
 *
 * The migration to schema 9 repairs labels and titles, but copies a prompt or
 * question, an ordinal or categorical option's value, and a node type, edge
 * type or attribute name from the researcher's protocol without writing any of
 * them (`schema9BlankRequiredContent` in its notes says so to researchers).
 * An option's label left blank beside a blank value goes with it, since the
 * label is repaired only from the value.
 * The blank-text sweep in `schemas/9/__tests__` proves every such place in two
 * complete protocols is refused here and nowhere else. So an issue
 * at one of those places, where the migrated value is empty or shows nothing,
 * is about the protocol's own content: the researcher left it blank. Any other
 * issue, alone or alongside these, may be a migration of ours that went wrong,
 * and the whole result is left to be reported as one.
 */
export const findRefusedContent = (
  migrated: unknown,
  issues: readonly ProtocolValidationIssue[],
): RefusedContentProblem[] | undefined => {
  if (issues.length === 0) return undefined;
  const problems: RefusedContentProblem[] = [];
  for (const issue of issues) {
    const place = describePlace(migrated, issue.path);
    if (place === undefined || !isBlankContent(valueAt(migrated, issue.path))) {
      return undefined;
    }
    problems.push({ path: issue.path, place, message: issue.message });
  }
  return problems;
};

/** One line per problem: where it is, then what is wrong. */
export const formatRefusedContent = (
  problems: readonly RefusedContentProblem[],
): string =>
  problems.map((problem) => `${problem.place}: ${problem.message}`).join('\n');
