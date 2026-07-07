import { afterEach, describe, expect, it, vi } from 'vitest';

import { shareOrDownloadBlob } from '../download';

function makeBlob() {
  return new Blob(['export-bytes'], { type: 'application/zip' });
}

describe('shareOrDownloadBlob (web)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shares via navigator.share when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');

    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.any(Array),
        title: 'export.zip',
      }),
    );
    expect(result).toEqual({ saved: true, confirmed: true });
  });

  it('returns saved:false when the user cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abort);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');

    expect(result).toEqual({ saved: false, confirmed: false });
  });

  it('falls back to an object-URL <a download> when canShare is false', async () => {
    vi.stubGlobal('navigator', { canShare: vi.fn().mockReturnValue(false) });
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = { href: '', download: '', click, remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(
      anchor as unknown as HTMLAnchorElement,
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node as never,
    );

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('export.zip');
    expect(click).toHaveBeenCalledTimes(1);
    // The object-URL <a download> fires the OS Save dialog with no observable
    // outcome — a cancelled Save-As or blocked download is indistinguishable
    // from success. It must NOT report a confirmed save, or the caller would
    // stamp exportedAt for a file that was never written (data-loss primitive).
    expect(result).toEqual({ saved: true, confirmed: false });
  });

  it('falls back when navigator has no canShare (older browsers)', async () => {
    vi.stubGlobal('navigator', {});
    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(
      anchor as unknown as HTMLAnchorElement,
    );
    vi.spyOn(document.body, 'appendChild').mockImplementation(
      (node) => node as never,
    );

    const result = await shareOrDownloadBlob(makeBlob(), 'export.zip');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true, confirmed: false });
  });
});
