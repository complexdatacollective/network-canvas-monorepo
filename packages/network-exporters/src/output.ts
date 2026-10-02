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
 * files keep the answer exactly as given.
 */
export type ExportWarning = {
  readonly kind: 'xml-illegal-characters';
  readonly sessionId: string;
  readonly caseId: string;
  /** The variables, and roster attributes, whose answers lost characters. */
  readonly variables: readonly string[];
  /** Whether the case ID itself lost characters. */
  readonly caseIdChanged: boolean;
};

export type ExportReturn = {
  readonly status: 'success' | 'partial';
  readonly successfulExports: ExportSuccess[];
  readonly failedExports: ExportFailure[];
  readonly warnings: ExportWarning[];
  readonly output: OutputResult;
};
