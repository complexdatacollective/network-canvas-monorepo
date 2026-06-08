import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../Environment', () => ({
  isElectron: vi.fn(),
  isCapacitor: vi.fn(),
}));

vi.mock('../../filesystem', () => ({
  writeFile: vi.fn(() => Promise.resolve()),
}));

import { isCapacitor, isElectron } from '../../Environment';
import { writeFile } from '../../filesystem';
import { saveExportBlob } from '../saveExport';

// Minimal Blob-like stub: saveExportBlob only needs `.arrayBuffer()`, and
// jsdom's Blob does not implement it (real Electron/Cordova webviews do).
const makeBlob = () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return { arrayBuffer: () => Promise.resolve(bytes.buffer) };
};

describe('saveExportBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isElectron.mockReturnValue(false);
    isCapacitor.mockReturnValue(false);
    delete global.cordova;
  });

  it('on Electron, prompts a save dialog and writes the chosen path as a Buffer', async () => {
    isElectron.mockReturnValue(true);
    window.electronAPI.dialog.showSaveDialog = vi.fn(() =>
      Promise.resolve({ canceled: false, filePath: '/tmp/out.zip' }),
    );

    const result = await saveExportBlob({
      blob: makeBlob(),
      fileName: 'out.zip',
    });

    expect(window.electronAPI.dialog.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'out.zip' }),
    );
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, data] = writeFile.mock.calls[0];
    expect(path).toBe('/tmp/out.zip');
    // A Buffer (a Uint8Array subclass) carrying the zip bytes; writeFile's
    // Electron branch base64-encodes Buffer/Uint8Array for IPC transport.
    expect(data).toBeInstanceOf(Uint8Array);
    expect([...data]).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({ saved: true, path: '/tmp/out.zip' });
  });

  it('on Electron, returns saved:false and does not write when the dialog is canceled', async () => {
    isElectron.mockReturnValue(true);
    window.electronAPI.dialog.showSaveDialog = vi.fn(() =>
      Promise.resolve({ canceled: true, filePath: undefined }),
    );

    const result = await saveExportBlob({
      blob: makeBlob(),
      fileName: 'out.zip',
    });

    expect(writeFile).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: false, path: null });
  });

  it('on Cordova, writes a raw ArrayBuffer into the data directory', async () => {
    isCapacitor.mockReturnValue(true);
    global.cordova = { file: { dataDirectory: 'file:///data/' } };

    const result = await saveExportBlob({
      blob: makeBlob(),
      fileName: 'out.zip',
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, data] = writeFile.mock.calls[0];
    expect(path).toBe('file:///data/out.zip');
    // Must be an ArrayBuffer, not a Uint8Array — Cordova's FileWriter requires it.
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(data)]).toEqual([1, 2, 3, 4]);
    expect(result).toEqual({ saved: true, path: 'file:///data/out.zip' });
  });

  it('throws on an unsupported platform', async () => {
    await expect(
      saveExportBlob({ blob: makeBlob(), fileName: 'out.zip' }),
    ).rejects.toThrow(/not supported/);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
