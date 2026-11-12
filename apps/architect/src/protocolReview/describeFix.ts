import { isValidationWithNumberValue } from '@codaco/protocol-builder/codebook/variableValidation';
import type { Finding } from '@codaco/protocol-review-worker/contract';
import {
  collectLocalizedStrings,
  type CurrentProtocol,
  escapeMessageText,
  messageText,
} from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import { localizedText } from '~/utils/localizedText';

import type { StoredOperation } from './fixEngine';
import {
  findArrayMember,
  formatPath,
  isJsonObject,
  parsePath,
  readPath,
} from './fixPath';
import { isLocalizedValue } from './protocolFix';

/**
 * What a fix and a finding mean on screen, as data: the UI turns it into
 * words.
 */

/** One text a fix rewrites: the text now and the text after the fix. */
type FixEditCommon = {
  path: string;
  /** The plain text there now; null when there is none. */
  now: string | null;
  after: string;
  /** The language, when the text is one translation of a localized string. */
  locale: string | null;
  /**
   * The text's translations in the protocol's other languages, which the fix
   * keeps as they are (as Architect's own editors do), sorted. They may no
   * longer say the same thing.
   */
  otherTranslations: string[];
  markdown: boolean;
  editable: boolean;
};

/**
 * A text, or a number setting: `setting` is its key, such as `maxSelected`,
 * and `owner` the attribute or stage it belongs to.
 */
export type FixTextEdit = FixEditCommon &
  (
    | { kind: 'text' }
    | { kind: 'number'; setting: string; owner: string | null }
  );

const STAGE_NUMBER_SETTINGS = new Set([
  'minNodes',
  'maxNodes',
  'concentricCircles',
]);

const numberSettingOwner = (
  protocol: CurrentProtocol,
  segments: readonly string[],
): string | null => {
  const variables = segments.indexOf('variables');
  if (variables !== -1 && variables + 1 < segments.length) {
    const variable = readPath(protocol, segments.slice(0, variables + 2));
    return variable.found &&
      isJsonObject(variable.value) &&
      typeof variable.value.name === 'string'
      ? variable.value.name
      : null;
  }
  if (segments[0] === 'stages') {
    const stage = protocol.stages.find(({ id }) => id === segments[1]);
    return stage
      ? localizedText(stage.label, protocol.localization) || null
      : null;
  }
  return null;
};

export type FixEdits = Readonly<Record<string, string>>;

const plainText = (value: string, isTranslation: boolean) =>
  isTranslation ? messageText(value) : value;

const isLiteralMessage = (value: string) =>
  escapeMessageText(messageText(value)) === value;

const probeAt = (value: unknown, segments: readonly string[]): unknown => {
  const [head, ...rest] = segments;
  if (head === undefined) return {};
  if (Array.isArray(value)) {
    return [probeAt(value[findArrayMember(value, head)], rest)];
  }
  const literals = isJsonObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          ([, field]) => typeof field !== 'object' || field === null,
        ),
      )
    : {};
  return {
    ...literals,
    [head]: probeAt(isJsonObject(value) ? value[head] : undefined, rest),
  };
};

const isMarkdownAt = (
  protocol: CurrentProtocol,
  segments: readonly string[],
): boolean =>
  collectLocalizedStrings(probeAt(protocol, segments)).some(
    (hit) => hit.format === 'markdown',
  );

const parsed = (value: string | null): unknown => {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

/** One `set` operation's text edits, read against `protocol`. */
const describeSet = (
  protocol: CurrentProtocol,
  operation: StoredOperation,
): FixTextEdit[] => {
  const { locales } = protocol.localization;
  const after = parsed(operation.value);
  const segments = parsePath(operation.path);
  if (segments === null) return [];
  const target = readPath(protocol, segments);

  // A whole localized string: one edit per translation it changes, and the
  // translations it keeps as they are named beside each.
  if (isLocalizedValue(after, locales)) {
    const before =
      target.found && isLocalizedValue(target.value, locales)
        ? target.value
        : {};
    const changed = Object.keys(after)
      .filter((locale) => before[locale] !== after[locale])
      .toSorted();
    const kept = Object.keys(before)
      .filter((locale) => !changed.includes(locale))
      .toSorted();
    const markdown = isMarkdownAt(protocol, segments);
    return changed.map((locale) => {
      const now = before[locale];
      return {
        path: formatPath([...segments, locale]),
        now: now === undefined ? null : plainText(now, true),
        after: plainText(after[locale] ?? '', true),
        locale,
        otherTranslations: kept,
        markdown,
        kind: 'text',
        editable: isLiteralMessage(after[locale] ?? ''),
      };
    });
  }

  if (typeof after === 'number') {
    const setting = segments.at(-1) ?? '';
    const known = segments.includes('validation')
      ? isValidationWithNumberValue(setting)
      : STAGE_NUMBER_SETTINGS.has(setting);
    if (!known) return [];
    return [
      {
        path: operation.path,
        now:
          target.found && typeof target.value === 'number'
            ? String(target.value)
            : null,
        after: String(after),
        locale: null,
        otherTranslations: [],
        markdown: false,
        kind: 'number',
        setting,
        owner: numberSettingOwner(protocol, segments),
        editable: true,
      },
    ];
  }

  if (typeof after !== 'string') return [];
  const last = segments.at(-1) ?? '';
  const parent = readPath(protocol, segments.slice(0, -1));
  const isTranslation =
    parent.found &&
    locales.includes(last) &&
    (isLocalizedValue(parent.value, locales) ||
      (typeof parent.value === 'object' &&
        parent.value !== null &&
        Object.keys(parent.value).length === 0));
  const now =
    target.found && typeof target.value === 'string'
      ? plainText(target.value, isTranslation)
      : null;
  const otherTranslations =
    isTranslation && parent.found && isLocalizedValue(parent.value, locales)
      ? Object.keys(parent.value)
          .filter((locale) => locale !== last)
          .toSorted()
      : [];
  return [
    {
      path: operation.path,
      now,
      after: plainText(after, isTranslation),
      locale: isTranslation ? last : null,
      otherTranslations,
      markdown: isTranslation && isMarkdownAt(protocol, segments.slice(0, -1)),
      kind: 'text',
      editable: isTranslation && isLiteralMessage(after),
    },
  ];
};

const describeSetSafely = (
  protocol: CurrentProtocol,
  operation: StoredOperation,
): FixTextEdit[] => {
  try {
    return describeSet(protocol, operation);
  } catch {
    return [];
  }
};

const editedValue = (edit: FixTextEdit, input: string): unknown => {
  if (edit.kind === 'text') return escapeMessageText(input);
  const number = Number(input);
  return input.trim() !== '' && Number.isFinite(number) ? number : undefined;
};

/**
 * A fix's operations with the researcher's own values, keyed by edit path,
 * in place of the suggested ones. Null when a value cannot be written, such
 * as a number field that does not hold a number.
 */
export const applyFixEdits = (
  protocol: CurrentProtocol,
  operations: readonly StoredOperation[],
  edits: FixEdits,
): StoredOperation[] | null => {
  const result: StoredOperation[] = [];
  for (const operation of operations) {
    if (operation.op !== 'set') {
      result.push(operation);
      continue;
    }
    let value = parsed(operation.value);
    let changed = false;
    for (const edit of describeSetSafely(protocol, operation)) {
      const input = edits[edit.path];
      if (input === undefined || !edit.editable) continue;
      const next = editedValue(edit, input);
      if (next === undefined) return null;
      if (edit.path === operation.path) {
        value = next;
      } else if (edit.locale !== null && isJsonObject(value)) {
        value = { ...value, [edit.locale]: next };
      } else {
        continue;
      }
      changed = true;
    }
    result.push(
      changed ? { ...operation, value: JSON.stringify(value) } : operation,
    );
  }
  return result;
};

/**
 * Every text a fix's `set` operations write, read against `protocol`: a
 * string, or each translation a whole localized string changes. An
 * operation that cannot be read is left out rather than allowed to throw.
 */
export const describeFixTextEdits = (
  protocol: CurrentProtocol,
  operations: readonly StoredOperation[],
): FixTextEdit[] =>
  operations.flatMap((operation): FixTextEdit[] =>
    operation.op === 'set' ? describeSetSafely(protocol, operation) : [],
  );

/** Where a finding is, for display and for a link to it. */
export type FindingLocation =
  | {
      kind: 'stage';
      stageId: string;
      /** 1-based, as the Stages screen numbers stages. */
      position: number;
      label: string;
      /** The stage editor. */
      href: string;
    }
  | {
      kind: 'codebook';
      entity: 'node' | 'edge' | 'ego';
      /** Null for ego, or when the type no longer exists. */
      typeId: string | null;
      typeName: string | null;
      href: string;
    }
  | { kind: 'protocol' };

/**
 * Where `finding` is in `protocol` as it stands now. A stage that has since
 * been deleted reads as the protocol as a whole; a type that has, as the
 * codebook without a type.
 */
export const resolveFindingLocation = (
  protocol: CurrentProtocol,
  finding: Pick<Finding, 'stageId' | 'codebookEntity' | 'codebookTypeId'>,
): FindingLocation => {
  if (finding.stageId !== null) {
    const index = protocol.stages.findIndex(
      (stage) => stage.id === finding.stageId,
    );
    const stage = protocol.stages[index];
    if (stage) {
      return {
        kind: 'stage',
        stageId: stage.id,
        position: index + 1,
        label: localizedText(stage.label, protocol.localization),
        href: `/protocol/stage/${encodeURIComponent(stage.id)}`,
      };
    }
  }
  const entity = finding.codebookEntity;
  if (entity === 'ego') {
    return {
      kind: 'codebook',
      entity,
      typeId: null,
      typeName: null,
      href: codebookHref(),
    };
  }
  if (entity === 'node' || entity === 'edge') {
    const typeId = finding.codebookTypeId;
    const types = protocol.codebook[entity] ?? {};
    const type =
      typeId !== null && Object.hasOwn(types, typeId) ? types[typeId] : null;
    return type && typeId !== null
      ? {
          kind: 'codebook',
          entity,
          typeId,
          typeName: type.name,
          href: codebookHref({ entity, type: typeId }),
        }
      : {
          kind: 'codebook',
          entity,
          typeId: null,
          typeName: null,
          href: codebookHref(),
        };
  }
  return { kind: 'protocol' };
};
