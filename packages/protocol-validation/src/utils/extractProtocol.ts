import type Zip from 'jszip';
import JSZip from 'jszip';

import type { VersionedProtocol } from '~/schemas';

// A .netcanvas is a zip of protocol.json plus media assets. Inflating an entry
// with JSZip's `.async()` pipes the whole DEFLATE stream through pako and only
// compares against the declared size after the fact, so a deflate bomb (a tiny
// compressed payload that under-declares its uncompressed size) inflates
// unbounded and can OOM the tab. Because .netcanvas files are shared between
// researchers, cap the *actual* inflated output incrementally as it streams,
// never trusting the attacker-controlled central-directory size.
const MB = 1024 * 1024;

// Largest total decompressed payload we will inflate from a single archive.
// Matches the declared-size cap enforced up front by the importing app; the
// incremental check here is the backstop for archives that lie about their size.
export const MAX_INFLATED_BYTES = 1024 * MB;

export class NetcanvasInflationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetcanvasInflationLimitError';
  }
}

// Tracks the running total of bytes inflated across every entry of one archive
// so a bomb split over multiple entries can't slip under a per-entry cap.
type InflationBudget = { limit: number; used: number };

const createInflationBudget = (limit: number): InflationBudget => ({
  limit,
  used: 0,
});

// Inflate a single zip entry while enforcing the shared budget. Reads the
// decompressed stream chunk by chunk and aborts the moment the cumulative total
// crosses the cap, so a bomb never fully inflates into memory. Returns the
// concatenated `uint8array` output; callers convert to the type they need.
const inflateEntryWithinBudget = (
  entry: Zip.JSZipObject,
  budget: InflationBudget,
): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const chunks: Array<Uint8Array> = [];
    let entryBytes = 0;
    // `internalStream` is present at runtime but omitted from JSZip's published
    // types; reach it through the object without widening the entry type.
    const stream = (
      entry as unknown as {
        internalStream: (
          type: 'uint8array',
        ) => Zip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream('uint8array');

    let aborted = false;

    stream
      .on('data', (chunk) => {
        if (aborted) {
          return;
        }
        budget.used += chunk.length;
        if (budget.used > budget.limit) {
          aborted = true;
          stream.pause();
          reject(
            new NetcanvasInflationLimitError(
              `This protocol file expands to more data than can be opened ` +
                `safely. It may be corrupt or malicious.`,
            ),
          );
          return;
        }
        entryBytes += chunk.length;
        chunks.push(chunk);
      })
      .on('error', (error) => {
        if (!aborted) {
          reject(error);
        }
      })
      .on('end', () => {
        if (aborted) {
          return;
        }
        const out = new Uint8Array(entryBytes);
        let position = 0;
        for (const chunk of chunks) {
          out.set(chunk, position);
          position += chunk.length;
        }
        resolve(out);
      });

    stream.resume();
  });

const inflateEntryToString = async (
  entry: Zip.JSZipObject,
  budget: InflationBudget,
): Promise<string> => {
  const bytes = await inflateEntryWithinBudget(entry, budget);
  return new TextDecoder().decode(bytes);
};

const inflateEntryToBlob = async (
  entry: Zip.JSZipObject,
  budget: InflationBudget,
): Promise<Blob> => {
  const bytes = await inflateEntryWithinBudget(entry, budget);
  return new Blob([bytes]);
};

const getProtocolJsonAsObject = async (
  zip: Zip,
  budget: InflationBudget,
): Promise<VersionedProtocol> => {
  const entry = zip.file('protocol.json');

  if (!entry) {
    throw new Error('protocol.json not found in zip');
  }

  const protocolString = await inflateEntryToString(entry, budget);

  return JSON.parse(protocolString);
};

export type ExtractedAsset = {
  id: string; // The asset ID from protocol manifest (key)
  name: string; // Original filename from manifest
  data: Blob | string; // The actual file data
};

const extractProtocolAssets = async (
  protocol: VersionedProtocol,
  zip: Zip,
  budget: InflationBudget,
) => {
  const assets: Array<ExtractedAsset> = [];

  // Inflate assets sequentially so the shared budget is enforced deterministically
  // and a bomb aborts before later entries begin inflating.
  for (const [assetId, assetDefinition] of Object.entries(
    protocol.assetManifest || {},
  )) {
    if (
      typeof assetDefinition === 'object' &&
      assetDefinition !== null &&
      'type' in assetDefinition
    ) {
      if (assetDefinition.type === 'apikey') {
        // Value is a string, not a file
        assets.push({
          id: assetId,
          name: assetDefinition.name,
          data: assetDefinition.value,
        });
        continue;
      }

      const entry = zip.file(`assets/${assetDefinition.source}`);
      if (!entry) {
        throw new Error(
          `Asset file "${assetDefinition.source}" not found in zip for asset ID "${assetId}"`,
        );
      }

      const fileData = await inflateEntryToBlob(entry, budget);
      assets.push({ id: assetId, name: assetDefinition.name, data: fileData });
      continue;
    }
    throw new Error(`Invalid asset definition for asset ID "${assetId}"`);
  }

  return assets;
};

export const extractProtocol = async (
  protocolBuffer: Buffer,
  maxInflatedBytes: number = MAX_INFLATED_BYTES,
): Promise<{ protocol: VersionedProtocol; assets: Array<ExtractedAsset> }> => {
  const zip = await JSZip.loadAsync(protocolBuffer);
  return extractProtocolFromZip(zip, maxInflatedBytes);
};

// Extract from an already-loaded zip. Lets a caller that has already parsed the
// archive (e.g. to size-guard it before inflating) avoid parsing it twice. Every
// entry is inflated through a shared budget so the total decompressed output can
// never exceed `maxInflatedBytes`, regardless of the sizes the archive declares.
export const extractProtocolFromZip = async (
  zip: Zip,
  maxInflatedBytes: number = MAX_INFLATED_BYTES,
): Promise<{ protocol: VersionedProtocol; assets: Array<ExtractedAsset> }> => {
  const budget = createInflationBudget(maxInflatedBytes);
  const protocol = await getProtocolJsonAsObject(zip, budget);
  const assets = await extractProtocolAssets(protocol, zip, budget);

  return {
    assets,
    protocol,
  };
};
