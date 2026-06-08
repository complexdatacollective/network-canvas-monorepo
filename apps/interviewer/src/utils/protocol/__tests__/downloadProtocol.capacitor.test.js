import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../Environment');
vi.mock('../../filesystem');

import { getEnvironment } from '../../Environment';
import environments from '../../environments';
import { ensurePathExists, tempDataPath, writeFile } from '../../filesystem';

const mockArrayBuffer = new Uint8Array([1, 2, 3]).buffer;

const setupFetch = ({ ok = true } = {}) => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok,
      arrayBuffer: () => Promise.resolve(mockArrayBuffer),
    }),
  );
};

beforeEach(() => {
  getEnvironment.mockReturnValue(environments.CAPACITOR);
  tempDataPath.mockReturnValue('tmp/');
  writeFile.mockResolvedValue(undefined);
  ensurePathExists.mockResolvedValue(undefined);
  setupFetch();
});

afterEach(() => {
  vi.clearAllMocks();
  delete global.fetch;
});

// Dynamic import so vi.mock hoisting takes effect before the module is loaded.
const getDownloadProtocol = () =>
  import('../downloadProtocol').then((m) => m.default);

describe('downloadProtocol (Capacitor)', () => {
  it('calls fetch with the provided uri', async () => {
    const downloadProtocol = await getDownloadProtocol();
    const uri = 'https://example.com/protocol.netcanvas';
    await downloadProtocol(uri);
    expect(global.fetch).toHaveBeenCalledWith(uri);
  });

  it('calls writeFile with the expected destination path and an ArrayBuffer', async () => {
    const downloadProtocol = await getDownloadProtocol();
    const uri = 'https://example.com/protocol.netcanvas';
    const destination = await downloadProtocol(uri);

    expect(writeFile).toHaveBeenCalledWith(destination, mockArrayBuffer);
    expect(destination).toMatch(/^tmp\//);
  });

  it('resolves to the destination path string', async () => {
    const downloadProtocol = await getDownloadProtocol();
    const result = await downloadProtocol('https://example.com/p.netcanvas');
    expect(typeof result).toBe('string');
    expect(result.startsWith('tmp/')).toBe(true);
  });

  it('rejects with an error when the response is not ok', async () => {
    setupFetch({ ok: false });
    const downloadProtocol = await getDownloadProtocol();
    await expect(
      downloadProtocol('https://example.com/p.netcanvas'),
    ).rejects.toThrow();
  });
});
