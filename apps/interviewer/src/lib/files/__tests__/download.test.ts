import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveAction, saveBlob } from '../download';

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

// The share rung is handheld-only, so every navigator stub has to declare
// which kind of device it is. iPhone/Android are recognised by user agent;
// iPadOS in its default desktop mode reports itself as a Mac with a
// touchscreen, and names itself in every other mode.
const DEVICES = {
  iphone: {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    platform: 'iPhone',
    maxTouchPoints: 5,
  },
  ipad: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  },
  ipadMobileMode: {
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) Mobile/15E148',
    platform: 'iPad',
    maxTouchPoints: 5,
  },
  mac: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    platform: 'MacIntel',
    maxTouchPoints: 0,
  },
} as const;

function stubNavigator({
  device = 'mac',
  ...rest
}: {
  device?: keyof typeof DEVICES;
  share?: unknown;
  canShare?: unknown;
}) {
  vi.stubGlobal('navigator', { ...DEVICES[device], ...rest });
}

function stubSavePicker() {
  const write = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const createWritable = vi.fn().mockResolvedValue({ write, close });
  // Enforces the Window receiver like the real Web-IDL method: browsers
  // throw "Illegal invocation" for a detached call, which would silently
  // degrade the picker rung to the anchor download.
  const showSaveFilePicker = vi.fn(function (this: unknown) {
    if (this !== window && this !== globalThis) {
      throw new TypeError('Illegal invocation');
    }
    return Promise.resolve({ createWritable });
  });
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
    stubNavigator({ device: 'ipad', share, canShare: () => true });

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

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
    stubNavigator({ device: 'ipad', share, canShare: () => true });
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

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
    stubNavigator({});
    const { createObjectURL, click } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });

  it('falls through to the anchor download when the picker fails to open (non-cancel)', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError')),
    );
    stubNavigator({});
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

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
    stubNavigator({ device: 'iphone', share, canShare });

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

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
    stubNavigator({ device: 'iphone', share, canShare: () => true });

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

    expect(result).toEqual({ saved: false });
  });

  it('falls through to the anchor download when share fails (canShare overpromised, #889)', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError'),
      );
    stubNavigator({ device: 'ipad', share, canShare: () => true });
    const { createObjectURL, click } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });
});

// Desktop Safari advertises file sharing, which used to send the archive to
// the macOS share sheet instead of the researcher's Downloads folder
// (community #258). A desktop browser owns its downloads, so the share rung is
// withheld there even when the capability is present.
describe('the share rung is handheld-only', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads directly in desktop Safari despite canShare reporting true', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    stubNavigator({ device: 'mac', share, canShare });
    const { createObjectURL, click, anchor } = stubAnchorDownload();

    expect(saveAction(makeBlob(), 'export.zip')).toBe('download');

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

    expect(share).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('export.zip');
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });

  it('shares on iPadOS, which reports the same platform string as a Mac', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ device: 'ipad', share, canShare: () => true });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('share');

    await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('shares on an iPad that is not in desktop mode, where the platform is iPad', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ device: 'ipadMobileMode', share, canShare: () => true });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('share');

    await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('shares on Android', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0.0.0',
      platform: 'Linux aarch64',
      maxTouchPoints: 5,
      share,
      canShare: () => true,
    });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('share');

    await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');
    expect(share).toHaveBeenCalledTimes(1);
  });
});

// saveAction predicts the rung saveBlob takes, so UI can label the action
// that triggers it. Each case runs saveBlob under the same stubs to prove the
// prediction and the ladder agree.
describe('saveAction agrees with the rung saveBlob takes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('predicts save-as when the Save-As picker exists', async () => {
    const picker = stubSavePicker();
    stubNavigator({ device: 'ipad', share: vi.fn(), canShare: () => true });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('save-as');

    await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');
    expect(picker.showSaveFilePicker).toHaveBeenCalledTimes(1);
  });

  it('predicts share when only Web Share can take the file', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ device: 'iphone', share, canShare: () => true });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('share');

    await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('predicts download when neither capability exists', async () => {
    stubNavigator({});
    const { click } = stubAnchorDownload();

    expect(saveAction(makeBlob(), 'export.zip')).toBe('download');

    await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('saveBlob (rung 3: anchor download, no picker or share)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fires the object-URL download and reports saved optimistically', async () => {
    stubNavigator({});
    const { createObjectURL, click, anchor } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', 'ZIP archive');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('export.zip');
    expect(click).toHaveBeenCalledTimes(1);
    // The outcome is unobservable on this rung; saved is reported
    // optimistically by design (see the 2026-07-08 export-save-ladder spec).
    expect(result).toEqual({ saved: true });
  });
});
