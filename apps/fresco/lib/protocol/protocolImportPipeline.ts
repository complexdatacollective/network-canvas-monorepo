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
  // One reader for the whole archive: it holds a single inflation budget
  // across both reads, so a deflate bomb split between `protocol.json` and the
  // media cannot spend the allowance twice.
  const zip = await loadNetcanvasArchive(new Uint8Array(fileArrayBuffer));
  const reader = createNetcanvasReader(zip);
  const protocolJson = await reader.readProtocol();
  return { reader, protocolJson };
}

// Fresco never upgrades a protocol to the current schema. A schema 8 protocol
// is stored as it is and runs in the schema 8 interview Fresco bundles; a
// schema 7 protocol is brought up to schema 8 on the way, as Fresco 4 did.
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

  // Extraction reports a manifest entry with no file rather than refusing,
  // leaving the policy to the host. Fresco serves these resources to
  // participants, so an incomplete protocol must not be installed: a missing
  // stimulus would surface mid-interview, to the one person who can do nothing
  // about it.
  if (missingAssets.length > 0) {
    throw missingAssetsError(missingAssets);
  }

  return assets;
}

// Every protocol the import refuses is recorded by its kind, a fixed
// vocabulary that holds nothing from the file, so refusals can be counted by
// cause.
//
// A file the researcher chose being damaged or truncated is an answer about
// that file, not a defect in Fresco, so it is not reported: sending it to
// exception tracking would bury the failures that are defects, and the message
// carries researcher-authored resource names. `isProtocolFileFault` draws that
// line. A classified error is reported as a copy that keeps its name and stack
// but not its message, which can quote the researcher's protocol.
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
