import type Zip from 'jszip';

import {
  defineMessages,
  createAppIntl,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import {
  type CurrentProtocol,
  type VersionedProtocol,
} from '@codaco/protocol-validation';
import { protocolFileErrorMessages } from '@codaco/protocol-validation/messages';
import { type AssetInsertType } from '~/schemas/protocol';

/**
 * Extract apikey assets from a protocol's asset manifest.
 */
function extractApikeyAssetsFromManifest(
  assetManifest: CurrentProtocol['assetManifest'],
): AssetInsertType[] {
  if (!assetManifest) return [];

  return Object.entries(assetManifest).flatMap(([key, entry]) => {
    if (entry.type !== 'apikey') return [];
    return [
      {
        assetId: key,
        key: key,
        name: entry.name,
        type: entry.type,
        url: '',
        size: 0,
        value: entry.value,
      },
    ];
  });
}

// Fetch protocol.json as a parsed object from the protocol zip.
export const getProtocolJson = async (
  protocolZip: Zip,
  formatMessage: (
    message: MessageDescriptor,
    values?: Record<string, string | number>,
  ) => string = createAppIntl({ locale: 'en' }).formatMessage,
) => {
  const protocolFile = protocolZip.file('protocol.json');
  if (!protocolFile) {
    throw new Error(formatMessage(protocolFileErrorMessages.missingProtocol));
  }
  try {
    const protocolString = await protocolFile.async('string');
    return JSON.parse(protocolString) as VersionedProtocol;
  } catch (cause) {
    throw new Error(formatMessage(protocolFileErrorMessages.damagedJson), {
      cause,
    });
  }
};

/**
 * Fetch all assets listed in the protocol json from the protocol zip, and
 * return them as a collection of ProtocolAsset objects, which includes useful
 * metadata about the asset.
 */

type FetchedFileAsset = Omit<
  AssetInsertType,
  'value' | 'key' | 'size' | 'url'
> & { file: File };

type ProtocolAssetsResult = {
  fileAssets: FetchedFileAsset[];
  apikeyAssets: AssetInsertType[];
};

export const getProtocolAssets = async (
  protocolJson: CurrentProtocol,
  protocolZip: Zip,
  formatMessage: (
    message: MessageDescriptor,
    values?: Record<string, string | number>,
  ) => string = createAppIntl({ locale: 'en' }).formatMessage,
): Promise<ProtocolAssetsResult> => {
  const assetManifest = protocolJson?.assetManifest;

  if (!assetManifest) {
    return { fileAssets: [], apikeyAssets: [] };
  }

  /**
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
   */
  const apikeyAssets = extractApikeyAssetsFromManifest(assetManifest);

  const fileAssets: FetchedFileAsset[] = [];

  await Promise.all(
    Object.entries(assetManifest)
      .filter(([_, asset]) => asset.type !== 'apikey')
      .map(async ([key, asset]) => {
        if (!('source' in asset)) return;

        const assetFile = protocolZip.file(`assets/${asset.source}`);
        if (!assetFile) {
          throw new Error(
            formatMessage(protocolFileErrorMessages.missingNamedAsset, {
              assetName: asset.source,
            }),
          );
        }
        const file = await assetFile.async('blob').catch((cause: unknown) => {
          throw new Error(
            formatMessage(protocolFileErrorMessages.damagedJson),
            { cause },
          );
        });

        fileAssets.push({
          assetId: key,
          name: asset.source,
          type: asset.type,
          file: new File([file], asset.source), // Convert Blob to File with filename
        });
      }),
  );

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
