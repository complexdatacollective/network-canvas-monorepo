import type { Finding } from '@codaco/protocol-review-worker/contract';
import { type CurrentProtocol, messageText } from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import { localizedText } from '~/utils/localizedText';

import type { StoredOperation } from './fixEngine';
import { parsePath, readPath } from './fixPath';
import { isLocalizedValue } from './protocolFix';

/**
 * What a fix and a finding mean on screen, as data: the UI turns it into
 * words.
 */

/** One text a fix rewrites: the text now and the text after the fix. */
export type FixTextEdit = {
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
};

const plainText = (value: string, isTranslation: boolean) =>
  isTranslation ? messageText(value) : value;

/** The string-valued `set` operations of a fix, read against `protocol`. */
export const describeFixTextEdits = (
  protocol: CurrentProtocol,
  operations: readonly StoredOperation[],
): FixTextEdit[] => {
  const { locales } = protocol.localization;
  return operations.flatMap((operation): FixTextEdit[] => {
    if (operation.op !== 'set' || operation.value === null) return [];
    let after: unknown;
    try {
      after = JSON.parse(operation.value) as unknown;
    } catch {
      return [];
    }
    if (typeof after !== 'string') return [];
    const segments = parsePath(operation.path);
    if (segments === null) return [];
    const last = segments.at(-1) ?? '';
    const parent = readPath(protocol, segments.slice(0, -1));
    const isTranslation =
      parent.found &&
      locales.includes(last) &&
      (isLocalizedValue(parent.value, locales) ||
        (typeof parent.value === 'object' &&
          parent.value !== null &&
          Object.keys(parent.value).length === 0));
    const target = readPath(protocol, segments);
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
      },
    ];
  });
};

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
