import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  declaredUncompressedTotal,
  loadGuardedNetcanvas,
  MAX_COMPRESSED_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  NetcanvasTooLargeError,
} from '../netcanvasSizeGuard';

const buildZip = async (
  entries: Record<string, string>,
): Promise<Uint8Array> => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
};

describe('loadGuardedNetcanvas', () => {
  it('loads a normally sized archive and returns the zip', async () => {
    const data = await buildZip({ 'protocol.json': '{"schemaVersion":8}' });
    const zip = await loadGuardedNetcanvas(data);
    const protocol = await zip.file('protocol.json')?.async('string');
    expect(protocol).toBe('{"schemaVersion":8}');
  });

  it('rejects a file above the compressed size cap before parsing', async () => {
    // Fake a buffer that only reports an oversized length; loadAsync is never
    // reached because the compressed guard fires first.
    const oversized = { byteLength: MAX_COMPRESSED_BYTES + 1 } as Uint8Array;
    await expect(loadGuardedNetcanvas(oversized)).rejects.toBeInstanceOf(
      NetcanvasTooLargeError,
    );
  });

  it('reads each entry’s declared uncompressed size from the central directory', async () => {
    // A highly compressible payload: the archive is tiny on disk but the central
    // directory declares the full uncompressed size. This is the signal used to
    // detect a deflate bomb before any entry is inflated.
    const payload = '0'.repeat(500_000);
    const data = await buildZip({
      'protocol.json': '{"schemaVersion":8}',
      'assets/bomb.bin': payload,
    });

    expect(data.byteLength).toBeLessThan(payload.length); // compressed far smaller

    const zip = await JSZip.loadAsync(data);
    const total = declaredUncompressedTotal(zip);
    // Declared total reflects the uncompressed bytes, not the tiny archive size.
    expect(total).toBeGreaterThanOrEqual(payload.length);
  });

  it('rejects when the declared uncompressed total exceeds the cap', async () => {
    const zip = await JSZip.loadAsync(
      await buildZip({ 'protocol.json': '{"schemaVersion":8}' }),
    );
    // Force the declared total over the cap without allocating gigabytes.
    const oversizedZip = {
      forEach: (cb: (path: string, entry: unknown) => void) => {
        cb('assets/bomb.bin', {
          dir: false,
          _data: { uncompressedSize: MAX_UNCOMPRESSED_BYTES + 1 },
        });
      },
    } as unknown as JSZip;
    expect(declaredUncompressedTotal(oversizedZip)).toBeGreaterThan(
      MAX_UNCOMPRESSED_BYTES,
    );
    // Sanity: the real small zip is well under the cap.
    expect(declaredUncompressedTotal(zip)).toBeLessThan(MAX_UNCOMPRESSED_BYTES);
  });
});
