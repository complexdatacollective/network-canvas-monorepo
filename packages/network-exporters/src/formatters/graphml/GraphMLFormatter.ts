import type { Codebook } from '@codaco/protocol-validation';

import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import type { ExportFileNetwork } from '../../session/exportFile';
import graphMLGenerator from './createGraphML';

class GraphMLFormatter {
  network: ExportFileNetwork;
  codebook: Codebook;
  exportOptions: ExportOptions;
  reportWarning: (warning: ExportWarning) => void;

  constructor(
    network: ExportFileNetwork,
    codebook: Codebook,
    exportOptions: ExportOptions,
    reportWarning: (warning: ExportWarning) => void,
  ) {
    this.network = network;
    this.codebook = codebook;
    this.exportOptions = exportOptions;
    this.reportWarning = reportWarning;
  }

  writeToString(): Promise<string> {
    return graphMLGenerator(
      this.network,
      this.codebook,
      this.exportOptions,
      this.reportWarning,
    );
  }
}

export default GraphMLFormatter;
