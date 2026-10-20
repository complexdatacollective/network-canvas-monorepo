import type {
  ExportColumnEntity,
  ExportColumnFormat,
} from '@codaco/shared-consts';

import type {
  ExportGenerationError,
  ProtocolNotFoundError,
  SessionProcessingError,
} from './errors';
import type { ExportFormat } from './options';

export type OutputEntry = {
  readonly name: string;
  readonly data: AsyncIterable<Uint8Array>;
};

export type OutputResult = {
  readonly key?: string;
  readonly url?: string;
  readonly [k: string]: unknown;
};

export type OutputHandle = unknown;

export type ExportSuccess = {
  readonly success: true;
  readonly format: ExportFormat;
  readonly sessionId: string;
  readonly partitionEntity?: string;
  readonly name: string;
};

export type ExportFailure =
  | {
      readonly kind: 'generation';
      readonly sessionId: string;
      readonly format: ExportFormat;
      readonly partitionEntity?: string;
      readonly error: ExportGenerationError;
    }
  | {
      readonly kind: 'protocol-missing';
      readonly sessionId: string;
      readonly error: ProtocolNotFoundError;
    }
  | {
      readonly kind: 'session-processing';
      readonly sessionId: string;
      readonly error: SessionProcessingError;
    };

/**
 * @public
 */
export type ExportResult =
  | ExportSuccess
  | { readonly success: false; readonly failure: ExportFailure };

/**
 * Something the export changed in the data it was asked to write, which the
 * researcher should know about. The export still succeeded: warnings never
 * make it `partial`.
 *
 * GraphML is XML 1.0, which cannot hold control characters, unpaired
 * surrogates, or U+FFFE and U+FFFF. A file containing one is rejected whole by
 * every conforming reader, so they are removed from the GraphML file; the CSV
 * files keep the text exactly as given. `xml-illegal-characters` reports an
 * interview's answers that lost characters, `xml-illegal-characters-in-protocol`
 * the protocol's own text.
 *
 * `column-renamed` reports a column that would have had the name of another
 * column in the same file, and was given a numbered name instead so that
 * neither column's values are lost.
 *
 * Only the first two kinds belong to an interview. The rest describe the
 * protocol, so every interview of it reports the same warning, and
 * `uniqueExportWarnings` keeps one.
 */
export type ExportWarning =
  | {
      readonly kind: 'xml-illegal-characters';
      readonly sessionId: string;
      readonly caseId: string;
      /** The variables, and roster attributes, whose answers lost characters. */
      readonly variables: readonly string[];
      /** Whether the case ID itself lost characters. */
      readonly caseIdChanged: boolean;
    }
  | {
      readonly kind: 'xml-illegal-characters-in-protocol';
      readonly protocolName: string;
      /** Which of the protocol's text lost characters. */
      readonly text:
        | 'protocol-name'
        | 'node-type-name'
        | 'edge-type-name'
        | 'column-name';
      /** The text as the GraphML files hold it, without the removed characters. */
      readonly name: string;
      /**
       * Each character removed, written as its code point (`U+0007`), once
       * each, in the order they first appeared.
       */
      readonly removed: readonly string[];
    }
  | {
      readonly kind: 'column-renamed';
      readonly protocolName: string;
      readonly format: ExportColumnFormat;
      readonly entity: ExportColumnEntity;
      /** The node or edge type's name. The ego has none. */
      readonly entityTypeName?: string;
      /** The variable, or roster attribute, the column belongs to. */
      readonly variable: string;
      /** The name the column would have had. */
      readonly column: string;
      /** The name it was written under. */
      readonly renamedTo: string;
    };

/** One string per distinct warning: equal warnings have equal keys. */
export const exportWarningKey = (warning: ExportWarning): string => {
  switch (warning.kind) {
    case 'xml-illegal-characters':
      return JSON.stringify([
        warning.kind,
        warning.sessionId,
        warning.caseId,
        warning.caseIdChanged,
        warning.variables,
      ]);
    case 'xml-illegal-characters-in-protocol':
      return JSON.stringify([
        warning.kind,
        warning.protocolName,
        warning.text,
        warning.name,
        warning.removed,
      ]);
    case 'column-renamed':
      return JSON.stringify([
        warning.kind,
        warning.protocolName,
        warning.format,
        warning.entity,
        warning.entityTypeName ?? null,
        warning.variable,
        warning.column,
        warning.renamedTo,
      ]);
  }
};

/** `warnings` with every repeat of an earlier warning left out. */
export const uniqueExportWarnings = (
  warnings: readonly ExportWarning[],
): ExportWarning[] => [
  ...new Map(
    warnings.map((warning) => [exportWarningKey(warning), warning] as const),
  ).values(),
];

export type ExportReturn = {
  readonly status: 'success' | 'partial';
  readonly successfulExports: ExportSuccess[];
  readonly failedExports: ExportFailure[];
  readonly warnings: ExportWarning[];
  readonly output: OutputResult;
};
