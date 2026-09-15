import type Zip from 'jszip';
import JSZip from 'jszip';

import type { VersionedProtocol } from '../schemas/index.ts';
import { getAssetMimeType } from './asset-mime-type.ts';
import { MalformedNetcanvasError } from './malformedNetcanvasError.ts';

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
  // Annotated with the ArrayBuffer-backed generic (not the bare `Uint8Array`
  // alias, which defaults to `ArrayBufferLike`) because `out` below is a fresh
  // `new Uint8Array(length)` allocation, and `Blob`'s constructor requires that
  // more specific type.
): Promise<Uint8Array<ArrayBuffer>> =>
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
          // A stream that gives up mid-inflate means the archive's compressed
          // data is damaged. Classify it here so every caller describes it as
          // a damaged file, rather than letting pako's own wording ("invalid
          // distance too far back") reach a researcher through a host's
          // fallback branch.
          reject(
            new MalformedNetcanvasError(
              'unreadable-entry',
              `Archive entry "${entry.name}" could not be decompressed`,
              { cause: error },
            ),
          );
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
  mimeType: string,
): Promise<Blob> => {
  const bytes = await inflateEntryWithinBudget(entry, budget);
  return new Blob([bytes], { type: mimeType });
};

const getProtocolJsonAsObject = async (
  zip: Zip,
  budget: InflationBudget,
): Promise<VersionedProtocol> => {
  const entry = zip.file('protocol.json');

  if (!entry) {
    throw new MalformedNetcanvasError(
      'missing-protocol',
      'protocol.json not found in zip',
    );
  }

  const protocolString = await inflateEntryToString(entry, budget);

  try {
    // Asserted, not validated — callers run the parsed object through this
    // package's schema validation. Written as an explicit cast because consumers
    // using `@total-typescript/ts-reset` (Fresco) type `JSON.parse` as `unknown`
    // rather than `any`, so an implicit widening does not compile there.
    return JSON.parse(protocolString) as VersionedProtocol;
  } catch (cause) {
    // A `SyntaxError` names a byte offset in a file the researcher has never
    // seen the inside of. Keep it on `cause` for the console and for exception
    // reporting; the host describes the failure from `reason`.
    throw new MalformedNetcanvasError(
      'unreadable-protocol-json',
      'protocol.json is not valid JSON',
      { cause },
    );
  }
};

export type ExtractedAsset = {
  id: string; // The asset ID from protocol manifest (key)
  name: string; // Original filename from manifest
  data: Blob | string; // The actual file data
};

/**
 * A manifest entry whose file is not in the archive.
 *
 * Reported rather than thrown, because the right answer differs by host. An
 * authoring tool can open the protocol and let the researcher re-supply the
 * file; a runtime about to show the resource to a participant cannot. Only the
 * host knows which it is, so extraction states the fact and leaves the policy
 * alone — see `missingAssetsError` for the refusal every runtime shares.
 */
export type MissingAsset = {
  /** The manifest key, which is what stages reference. */
  id: string;
  /** What the researcher named the resource. */
  name: string;
  /** The archive entry the manifest pointed at. */
  source: string;
};

export type ExtractedAssets = {
  assets: Array<ExtractedAsset>;
  missingAssets: Array<MissingAsset>;
};

/**
 * The refusal a host raises when it cannot proceed without the missing files.
 *
 * Shared so every runtime refuses in the same words. `assetName` carries the
 * first resource because the researcher-facing sentence names one; the full
 * list stays on `message`, for the console and a technical-details disclosure.
 */
export const missingAssetsError = (
  missingAssets: ReadonlyArray<MissingAsset>,
): MalformedNetcanvasError =>
  new MalformedNetcanvasError(
    'missing-asset',
    `Asset ${missingAssets.length === 1 ? 'file' : 'files'} ${missingAssets
      .map((asset) => `"${asset.source}"`)
      .join(', ')} not found in zip`,
    { assetName: missingAssets[0]?.name },
  );

const extractProtocolAssets = async (
  protocol: VersionedProtocol,
  zip: Zip,
  budget: InflationBudget,
): Promise<ExtractedAssets> => {
  const assets: Array<ExtractedAsset> = [];
  const missingAssets: Array<MissingAsset> = [];

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
        // Recorded, not thrown: one absent file must not decide for the host
        // whether the other twenty are worth having. Carries the manifest's
        // own display name, not the zip path, because that is what the
        // researcher called the resource.
        missingAssets.push({
          id: assetId,
          name: assetDefinition.name,
          source: assetDefinition.source,
        });
        continue;
      }

      const fileData = await inflateEntryToBlob(
        entry,
        budget,
        getAssetMimeType(assetDefinition.source),
      );
      assets.push({ id: assetId, name: assetDefinition.name, data: fileData });
      continue;
    }
    // Still fatal, unlike a missing file: the manifest itself is a shape this
    // version cannot read, so there is no protocol to open with a gap in it.
    throw new MalformedNetcanvasError(
      'invalid-asset-definition',
      `Invalid asset definition for asset ID "${assetId}"`,
    );
  }

  return { assets, missingAssets };
};

/**
 * Parse a `.netcanvas` archive's central directory, without inflating anything.
 *
 * The only supported way to open one: JSZip's own rejection describes zip
 * internals and links to its documentation, which is not something to put in
 * front of a researcher who picked the wrong file. Every entry point must go
 * through here so no caller can leak that message by loading the archive
 * itself.
 */
export const loadNetcanvasArchive = async (
  data: Uint8Array | Buffer,
): Promise<Zip> => {
  try {
    return await JSZip.loadAsync(data);
  } catch (cause) {
    throw new MalformedNetcanvasError(
      'not-an-archive',
      'The file could not be read as a .netcanvas archive',
      { cause },
    );
  }
};

export const extractProtocol = async (
  protocolBuffer: Buffer,
  maxInflatedBytes: number = MAX_INFLATED_BYTES,
): Promise<ExtractedAssets & { protocol: VersionedProtocol }> => {
  const zip = await loadNetcanvasArchive(protocolBuffer);
  return extractProtocolFromZip(zip, maxInflatedBytes);
};

/**
 * One archive's two reads, sharing one inflation budget.
 *
 * `extractProtocolFromZip` reads everything in one go, which is what a host
 * that installs whatever it is given wants. A host that decides whether to
 * keep the protocol *before* paying for its media does not: Fresco refuses a
 * duplicate as soon as it has hashed `protocol.json`, and inflating a 200 MB
 * video first — only to throw it away — is the difference between a fast
 * refusal and a stalled tab.
 *
 * Splitting the reads must not split the budget. Two independent caps would
 * let an archive spend the whole allowance twice, so a bomb divided between
 * `protocol.json` and the assets would pass both. The reader holds a single
 * budget across both calls, so the total is what is capped.
 *
 * `readAssets` takes no document. The manifest it resolves against has to be
 * the one that came out of *this* archive, and a host that has since migrated
 * or validated the protocol holds a different object whose `source` values may
 * no longer name entries in this zip. Accepting a protocol would let a caller
 * pass that one — the exact mismatch this reader exists to prevent — so the
 * reader keeps the document it read instead of trusting the caller to hand
 * back the right one.
 *
 * The read is memoised, so a host that wants the protocol as well pays for
 * `protocol.json` once and spends the budget once.
 */
export type NetcanvasReader = {
  readProtocol: () => Promise<VersionedProtocol>;
  readAssets: () => Promise<ExtractedAssets>;
};

export const createNetcanvasReader = (
  zip: Zip,
  maxInflatedBytes: number = MAX_INFLATED_BYTES,
): NetcanvasReader => {
  const budget = createInflationBudget(maxInflatedBytes);
  let protocol: Promise<VersionedProtocol> | undefined;
  const readProtocol = () =>
    (protocol ??= getProtocolJsonAsObject(zip, budget));

  return {
    readProtocol,
    readAssets: async () =>
      extractProtocolAssets(await readProtocol(), zip, budget),
  };
};

// Extract from an already-loaded zip. Lets a caller that has already parsed the
// archive (e.g. to size-guard it before inflating) avoid parsing it twice. Every
// entry is inflated through a shared budget so the total decompressed output can
// never exceed `maxInflatedBytes`, regardless of the sizes the archive declares.
export const extractProtocolFromZip = async (
  zip: Zip,
  maxInflatedBytes: number = MAX_INFLATED_BYTES,
): Promise<ExtractedAssets & { protocol: VersionedProtocol }> => {
  const reader = createNetcanvasReader(zip, maxInflatedBytes);
  const protocol = await reader.readProtocol();
  const { assets, missingAssets } = await reader.readAssets();

  return {
    assets,
    missingAssets,
    protocol,
  };
};
