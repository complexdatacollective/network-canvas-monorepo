import type { ExportCodebook } from '../../input';
import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import type { ExportFileNetwork } from '../../session/exportFile';
import graphMLGenerator from './createGraphML';

class GraphMLFormatter {
  network: ExportFileNetwork;
  codebook: ExportCodebook;
  exportOptions: ExportOptions;
  reportWarning: (warning: ExportWarning) => void;

  constructor(
    network: ExportFileNetwork,
    codebook: ExportCodebook,
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
