import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importProtocolFromFile } from '../importProtocol';

const saveProtocolMock = vi.fn();

vi.mock('../../db/api', () => ({
  saveProtocol: (...args: unknown[]) => saveProtocolMock(...args),
}));

/**
 * The wording a researcher must never be shown mid-fieldwork: the archive
 * library's name and documentation URL, its central-directory phrasing, an
 * internal filename, a JSON parser's cursor position, or schema-version
 * arithmetic.
 */
const IMPLEMENTATION_DETAIL =
  /jszip|stuk\.github\.io|central directory|protocol\.json|JSON at position|position \d+|schemaVersion|\d+ -> \d+/i;

const asFile = (bytes: Uint8Array, name = 'study.netcanvas') =>
  new File([bytes as BlobPart], name);

const buildArchive = async (
  entries: Record<string, string>,
): Promise<Uint8Array> => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'uint8array' });
};

describe('importProtocolFromFile error reporting', () => {
  beforeEach(() => {
    saveProtocolMock.mockReset();
    saveProtocolMock.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('describes a file that is not an archive without naming the zip library', async () => {
    const result = await importProtocolFromFile(
      asFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('extract-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(result.message).toContain('Network Canvas protocol');
  });

  it('describes an archive with no protocol in it', async () => {
    const bytes = await buildArchive({ 'assets/photo.png': 'PNGDATA' });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('extract-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    // Paired with the negative assertion so an empty message — or the generic
    // fallback, which would mean the taxonomy never classified this — cannot
    // pass by saying nothing at all.
    expect(result.message).toMatch(/nothing to open/i);
    expect(result.message).not.toBe('This protocol could not be opened.');
  });

  it('describes damaged protocol contents without the parser position', async () => {
    const bytes = await buildArchive({
      'protocol.json': '{"schemaVersion": 8, "na',
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('extract-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    // Same pairing: the researcher is told what to do next, not just what went
    // wrong, and an empty string cannot satisfy that.
    expect(result.message).toMatch(/backup/i);
    expect(result.message).not.toBe('This protocol could not be opened.');
  });

  it('describes a storage failure as a device problem, not a machine error', async () => {
    const protocol = {
      schemaVersion: 8,
      name: 'Saveable',
      description: '',
      stages: [],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {},
    };
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(protocol),
    });
    saveProtocolMock.mockRejectedValueOnce(
      new DOMException(
        'The current transaction exceeded its quota limitations.',
        'QuotaExceededError',
      ),
    );

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('save-failed');
    expect(result.message).not.toMatch(/quota|transaction|IDB/i);
    expect(result.message).toContain('device');
  });
});
