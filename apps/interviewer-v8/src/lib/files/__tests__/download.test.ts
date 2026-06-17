import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/lib/platform/platform', () => ({
  isElectron: false,
  isCapacitor: true,
  hostAppName: 'interviewer-v8',
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
  },
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    canShare: vi.fn(),
    share: vi.fn(),
  },
}));

import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { downloadBlob } from '../download';

const CACHE_URI = 'file:///cache/network-canvas-export.zip';

function makeBlob() {
  return new Blob(['export-bytes'], { type: 'application/zip' });
}

describe('downloadBlob (Capacitor)', () => {
  beforeEach(() => {
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: CACHE_URI });
    vi.mocked(Filesystem.deleteFile).mockResolvedValue(undefined);
    vi.mocked(Share.canShare).mockResolvedValue({ value: true });
    vi.mocked(Share.share).mockResolvedValue({
      activityType: 'com.apple.UIKit.activity.SaveToFiles',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes to Cache, presents the share sheet, and cleans up', async () => {
    const result = await downloadBlob(makeBlob(), 'network-canvas-export.zip');

    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'network-canvas-export.zip',
        directory: 'CACHE',
      }),
    );
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: [CACHE_URI] }),
    );
    expect(Filesystem.deleteFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'network-canvas-export.zip',
        directory: 'CACHE',
      }),
    );
    expect(result).toEqual({ saved: true });
  });

  it('returns saved:false when the user cancels the share sheet', async () => {
    vi.mocked(Share.share).mockRejectedValue(new Error('Share canceled'));

    const result = await downloadBlob(makeBlob(), 'export.zip');

    expect(result).toEqual({ saved: false });
    expect(Filesystem.deleteFile).toHaveBeenCalled();
  });

  it('rethrows a non-cancellation share error and still cleans up', async () => {
    vi.mocked(Share.share).mockRejectedValue(new Error('Some native failure'));

    await expect(downloadBlob(makeBlob(), 'export.zip')).rejects.toThrow(
      'Some native failure',
    );
    expect(Filesystem.deleteFile).toHaveBeenCalled();
  });

  it('throws when sharing is unavailable, without presenting the sheet', async () => {
    vi.mocked(Share.canShare).mockResolvedValue({ value: false });

    await expect(downloadBlob(makeBlob(), 'export.zip')).rejects.toThrow(
      /not available/i,
    );
    expect(Share.share).not.toHaveBeenCalled();
    expect(Filesystem.deleteFile).toHaveBeenCalled();
  });
});
