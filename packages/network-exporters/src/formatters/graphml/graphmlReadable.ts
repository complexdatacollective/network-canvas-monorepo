import type { ExportCodebook } from '../../input';
import type { ExportOptions } from '../../options';
import type { ExportWarning } from '../../output';
import type { ExportFileNetwork } from '../../session/exportFile';
import GraphMLFormatter from './GraphMLFormatter';

const encoder = new TextEncoder();

export async function* graphmlBytes(
  network: ExportFileNetwork,
  codebook: ExportCodebook,
  exportOptions: ExportOptions,
  reportWarning: (warning: ExportWarning) => void,
): AsyncIterable<Uint8Array> {
  const formatter = new GraphMLFormatter(
    network,
    codebook,
    exportOptions,
    reportWarning,
  );
  const xml = await formatter.writeToString();
  yield encoder.encode(xml);
}
