import { Effect } from 'effect';

import type { Codebook } from '@codaco/protocol-validation';

import { ExportGenerationError } from '../errors';
import type { ExportFormat, ExportOptions } from '../options';
import type {
  ExportFailure,
  ExportSuccess,
  ExportWarning,
  OutputEntry,
} from '../output';
import { getFormatter } from '../utils/getFormatter';
import type { partitionByType } from './partitionByType';

export type ExportFileNetwork = ReturnType<typeof partitionByType>[number];

type ExportFileParams = {
  name: string;
  exportFormat: ExportFormat;
  network: ExportFileNetwork;
  codebook: Codebook;
  exportOptions: ExportOptions;
  sessionId: string;
  /**
   * Called as the file's bytes are produced, which is when the output
   * consumes them, not when this function returns.
   */
  reportWarning: (warning: ExportWarning) => void;
};

export type GenerationResult =
  | { ok: true; success: ExportSuccess; entry: OutputEntry }
  | { ok: false; failure: ExportFailure };

const exportFile = (
  params: ExportFileParams,
): Effect.Effect<GenerationResult> =>
  Effect.sync(() => {
    const {
      name,
      exportFormat,
      network,
      codebook,
      exportOptions,
      sessionId,
      reportWarning,
    } = params;
    const toBytes = getFormatter(exportFormat);

    try {
      const data = toBytes(network, codebook, exportOptions, reportWarning);
      const success: ExportSuccess = {
        success: true,
        format: exportFormat,
        sessionId,
        partitionEntity: network.partitionEntity,
        name,
      };
      return { ok: true, success, entry: { name, data } };
    } catch (cause) {
      const error = new ExportGenerationError({
        cause,
        format: exportFormat,
        sessionId,
        partitionEntity: network.partitionEntity,
      });
      return {
        ok: false,
        failure: {
          kind: 'generation',
          sessionId,
          format: exportFormat,
          partitionEntity: network.partitionEntity,
          error,
        },
      };
    }
  });

export default exportFile;
