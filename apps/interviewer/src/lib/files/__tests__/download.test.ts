import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlob } from '../download';

function makeBlob() {
  return new Blob(['export-bytes'], { type: 'application/zip' });
}

function stubAnchorDownload() {
  const createObjectURL = vi.fn().mockReturnValue('blob:mock');
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
  const click = vi.fn();
  const anchor = { href: '', download: '', click, remove: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValue(
    anchor as unknown as HTMLAnchorElement,
  );
  vi.spyOn(document.body, 'appendChild').mockImplementation(
    (node) => node as never,
  );
  return { createObjectURL, click, anchor };
}

function stubSavePicker() {
  const write = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const createWritable = vi.fn().mockResolvedValue({ write, close });
  const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
  vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
  return { showSaveFilePicker, createWritable, write, close };
}

describe('saveBlob (rung 1: File System Access picker)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('writes through the Save-As picker and reports saved', async () => {
    const picker = stubSavePicker();
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: () => true });

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(picker.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'export.zip' }),
    );
    expect(picker.write).toHaveBeenCalledTimes(1);
    expect(picker.close).toHaveBeenCalledTimes(1);
    // The picker owns the save on this platform; Web Share is never tried.
    expect(share).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true });
  });

  it('reports not saved when the picker is cancelled, with no fallthrough', async () => {
    const showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new DOMException('The user aborted', 'AbortError'));
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: () => true });
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip');

    // A cancelled picker is a final "no" — offering another save mechanism
    // would recreate the nagging the ladder exists to remove.
    expect(share).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: false });
  });

  it('falls through to the anchor download when the write fails after picking', async () => {
    const write = vi.fn().mockRejectedValue(new Error('disk full'));
    const createWritable = vi.fn().mockResolvedValue({
      write,
      close: vi.fn(),
    });
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockResolvedValue({ createWritable }),
    );
    vi.stubGlobal('navigator', {});
    const { createObjectURL, click } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });

  it('falls through to the anchor download when the picker fails to open (non-cancel)', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError')),
    );
    vi.stubGlobal('navigator', {});
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });
});

describe('saveBlob (rung 2: Web Share, no picker available)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shares via navigator.share when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.any(Array),
        title: 'export.zip',
      }),
    );
    expect(result).toEqual({ saved: true });
  });

  it('reports not saved when the user cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const share = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal('navigator', { share, canShare: () => true });

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(result).toEqual({ saved: false });
  });

  it('falls through to the anchor download when share fails (canShare overpromised, #889)', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError'),
      );
    vi.stubGlobal('navigator', { share, canShare: () => true });
    const { createObjectURL, click } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });
});

describe('saveBlob (rung 3: anchor download, no picker or share)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fires the object-URL download and reports saved optimistically', async () => {
    vi.stubGlobal('navigator', {});
    const { createObjectURL, click, anchor } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('export.zip');
    expect(click).toHaveBeenCalledTimes(1);
    // The outcome is unobservable on this rung; saved is reported
    // optimistically by design (see the 2026-07-08 export-save-ladder spec).
    expect(result).toEqual({ saved: true });
  });
});
