import { hashProtocol as hashLegacyProtocol } from 'fresco-schema-8/protocol-validation';

import {
  CURRENT_SCHEMA_VERSION,
  createNetcanvasReader,
  type CurrentProtocol,
  type ExtractedAsset,
  getProtocolFileErrorKind,
  hashProtocol,
  isProtocolFileFault,
  loadNetcanvasArchive,
  missingAssetsError,
  type NetcanvasReader,
  toReportableProtocolError,
} from '@codaco/protocol-validation';
import { describeProtocolFileErrorMessage } from '@codaco/protocol-validation/messages';
import { validateImportedProtocol } from '~/lib/protocol/validateImportedProtocol';
import {
  type LegacyProtocol,
  validateImportedLegacyProtocol,
} from '~/lib/schema-8/validateImportedProtocol';
import { LEGACY_SCHEMA_VERSION } from '~/lib/schema-8/version';

export async function readProtocolArchive(fileArrayBuffer: ArrayBuffer) {
  // One reader shares a single inflation budget across the protocol and asset
  // reads, so a deflate bomb cannot be split between them.
  const zip = await loadNetcanvasArchive(new Uint8Array(fileArrayBuffer));
  const reader = createNetcanvasReader(zip);
  const protocolJson = await reader.readProtocol();
  return { reader, protocolJson };
}

// Legacy protocols are not upgraded to the current schema: they run in the
// bundled schema 8 interview.
export function validateProtocolForImport(
  protocolJson: { schemaVersion: number },
  protocolName: string,
) {
  return protocolJson.schemaVersion <= LEGACY_SCHEMA_VERSION
    ? validateImportedLegacyProtocol(protocolJson, { name: protocolName })
    : validateImportedProtocol(protocolJson);
}

export function hashImportedProtocol(
  protocol: CurrentProtocol | LegacyProtocol,
) {
  return protocol.schemaVersion === CURRENT_SCHEMA_VERSION
    ? hashProtocol(protocol)
    : hashLegacyProtocol(protocol);
}

export async function readProtocolAssets(
  reader: NetcanvasReader,
): Promise<ExtractedAsset[]> {
  const { assets, missingAssets } = await reader.readAssets();

  // Extraction leaves missing files to the host; Fresco refuses the protocol so
  // a participant never meets a missing stimulus.
  if (missingAssets.length > 0) {
    throw missingAssetsError(missingAssets);
  }

  return assets;
}

// A damaged file is the researcher's problem, not a Fresco defect, so it is not
// reported as an exception. Other classified errors are reported without their
// message, which can quote the researcher's protocol.
export function classifyImportError(error: Error) {
  const refusalKind = getProtocolFileErrorKind(error);
  return {
    refusalKind,
    protocolFileError: describeProtocolFileErrorMessage(error),
    reportableError: isProtocolFileFault(error)
      ? null
      : refusalKind === null
        ? error
        : toReportableProtocolError(error),
  };
}
