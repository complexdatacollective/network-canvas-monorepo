import {
  defineMessages,
  createAppIntl,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import {
  type CurrentProtocol,
  type ExtractedAsset,
} from '@codaco/protocol-validation';
import { type AssetInsertType } from '~/schemas/protocol';

type FetchedFileAsset = Omit<
  AssetInsertType,
  'value' | 'key' | 'size' | 'url'
> & { file: File };

type ProtocolAssetsResult = {
  fileAssets: FetchedFileAsset[];
  apikeyAssets: AssetInsertType[];
};

/**
 * Split what came out of a `.netcanvas` into the rows Fresco stores.
 *
 * Structure of an asset in network canvas protocols:
 *   - An asset in the manifest is an object whose key is a UID.
 *   - The ID property is the same as the key (duplicated for convinience :/)
 *   - Name property is the original file name when added to Architect
 *   - Source property is the internal path to the file in the zip, which is a
 *     separate UID + file extension.
 *   - The type property is one of the NC asset types (e.g. 'image', 'video',
 *     etc.)
 * Assets with type 'apikey' are handled differently:
 *   - They are not actually files. The key itself is stored in the value field.
 *
 * Two different documents are involved, deliberately. The bytes come from the
 * archive, and were resolved against the manifest that shipped inside it —
 * that is the only manifest whose `source` values describe entries that
 * actually exist in that zip. The metadata written alongside them comes from
 * the validated protocol, because that is the document being installed: if an
 * upgrade ever restates an asset, the stored row should describe the protocol
 * Fresco will run, not the one the researcher happened to export.
 *
 * The two are joined on the manifest key, which no upgrade rewrites — an
 * upgrade that did would leave every stage's asset reference dangling and fail
 * validation long before reaching here.
 */
export const partitionProtocolAssets = (
  protocol: CurrentProtocol,
  extractedAssets: ExtractedAsset[],
): ProtocolAssetsResult => {
  const assetManifest = protocol.assetManifest;

  if (!assetManifest) {
    return { fileAssets: [], apikeyAssets: [] };
  }

  const fileAssets: FetchedFileAsset[] = [];
  const apikeyAssets: AssetInsertType[] = [];

  for (const [assetId, entry] of Object.entries(assetManifest)) {
    if (entry.type !== 'apikey') continue;
    apikeyAssets.push({
      assetId,
      key: assetId,
      name: entry.name,
      type: entry.type,
      url: '',
      size: 0,
      value: entry.value,
    });
  }

  for (const extracted of extractedAssets) {
    const entry = assetManifest[extracted.id];
    // An apikey carries a string rather than file data and is handled above.
    // An id the validated manifest no longer lists was dropped by an upgrade,
    // so the protocol being installed does not refer to it and Fresco has
    // nothing to store it against.
    if (!entry || entry.type === 'apikey') continue;
    if (typeof extracted.data === 'string') continue;

    fileAssets.push({
      assetId: extracted.id,
      name: entry.source,
      type: entry.type,
      // Convert Blob to File with filename
      file: new File([extracted.data], entry.source),
    });
  }

  return { fileAssets, apikeyAssets };
};

// Helper method for reading a file as an ArrayBuffer. Useful for preparing a
// File to be read by JSZip.
export function fileAsArrayBuffer(
  file: Blob | File,
  formatMessage: (
    message: MessageDescriptor,
    values?: Record<string, string | number>,
  ) => string = createAppIntl({ locale: 'en' }).formatMessage,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('error', () => {
      reader.abort();
      reject(new Error(formatMessage(messages.unreadable)));
    });

    reader.addEventListener('load', () => {
      if (!reader.result || typeof reader.result === 'string') {
        reject(new Error(formatMessage(messages.unreadable)));
        return;
      }

      resolve(reader.result);
    });

    reader.readAsArrayBuffer(file);
  });
}

const messages = defineMessages({
  unreadable: {
    id: 'fresco.protocolImport.files.unreadable',
    defaultMessage: 'The file could not be read.',
    description:
      'Researcher-facing protocolImport.files: The file could not be read.',
  },
});
