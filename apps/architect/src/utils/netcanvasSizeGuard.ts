import JSZip from 'jszip';

// A .netcanvas is a zip of protocol.json plus media assets. Importing it reads
// the whole file into memory and inflates every asset to a Blob, so an oversized
// file or a deflate bomb (tiny compressed payload declaring a huge uncompressed
// size) can OOM-crash the tab. .netcanvas files are shared between researchers,
// so bound both the compressed file and the declared uncompressed total before
// inflating anything.

const MB = 1024 * 1024;

// Refuse the file before reading it into memory. A legitimate media-heavy
// protocol stays well under this; beyond it we don't even buffer the file.
export const MAX_COMPRESSED_BYTES = 500 * MB;

// Refuse once the zip's central directory reports a declared uncompressed total
// above this. JSZip.loadAsync parses the directory without inflating contents,
// so this cap is checked before any asset is inflated to a Blob.
export const MAX_UNCOMPRESSED_BYTES = 1024 * MB;

export class NetcanvasTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetcanvasTooLargeError';
  }
}

const formatMb = (bytes: number): string => `${Math.round(bytes / MB)} MB`;

// Throw the compressed-size error if the given byte length exceeds the cap.
// Exported so callers can reject a File by its `size` before buffering it into
// memory, surfacing the same message without duplicating the cap or the copy.
export const assertCompressedSizeWithinLimit = (byteLength: number): void => {
  if (byteLength > MAX_COMPRESSED_BYTES) {
    throw new NetcanvasTooLargeError(
      `This protocol file is too large to open (${formatMb(
        byteLength,
      )}). The maximum supported size is ${formatMb(MAX_COMPRESSED_BYTES)}.`,
    );
  }
};

// JSZip parses each entry's declared uncompressed size from the central
// directory into an internal CompressedObject that isn't part of its public
// types. Read it defensively without inflating the entry; a missing/odd shape
// contributes 0 rather than throwing.
const readDeclaredUncompressedSize = (entry: object): number => {
  const data: unknown = Reflect.get(entry, '_data');
  if (data !== null && typeof data === 'object' && 'uncompressedSize' in data) {
    const size: unknown = Reflect.get(data, 'uncompressedSize');
    return typeof size === 'number' ? size : 0;
  }
  return 0;
};

// Sum the declared uncompressed size of every zip entry. Reads the central
// directory populated by loadAsync; does not inflate any entry.
export const declaredUncompressedTotal = (zip: JSZip): number => {
  let total = 0;
  zip.forEach((_path, entry) => {
    if (entry.dir) {
      return;
    }
    total += readDeclaredUncompressedSize(entry);
  });
  return total;
};

// Guard a .netcanvas before it is inflated. Rejects oversized files and deflate
// bombs. Returns the loaded zip so the caller doesn't parse the archive twice.
export const loadGuardedNetcanvas = async (
  data: Uint8Array,
): Promise<JSZip> => {
  assertCompressedSizeWithinLimit(data.byteLength);

  const zip = await JSZip.loadAsync(data);

  const uncompressedTotal = declaredUncompressedTotal(zip);
  if (uncompressedTotal > MAX_UNCOMPRESSED_BYTES) {
    throw new NetcanvasTooLargeError(
      `This protocol file expands to more data than can be opened safely ` +
        `(${formatMb(uncompressedTotal)}). It may be corrupt. The maximum ` +
        `supported size is ${formatMb(MAX_UNCOMPRESSED_BYTES)}.`,
    );
  }

  return zip;
};
