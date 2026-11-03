import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Filetype, saveAction, saveBlob } from '../saveBlob';

const ZIP: Filetype = {
  description: 'ZIP archive',
  mimeType: 'application/zip',
  extension: '.zip',
};

function makeBlob() {
  return new Blob(['export-bytes'], { type: 'application/zip' });
}

// Records the file name of every <a download> clicked, without navigating.
function stubAnchorDownload() {
  const createObjectURL = vi.fn().mockReturnValue('blob:mock');
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
  const downloads: string[] = [];
  vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this instanceof HTMLAnchorElement) downloads.push(this.download);
  });
  return { createObjectURL, downloads };
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
  android: {
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0.0.0',
    platform: 'Linux aarch64',
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

// The picker's AbortError means "cancelled" only when it took a person's time
// to arrive. saveBlob reads performance.now() either side of the picker call;
// the stubbed clock moves only while the picker is open, so the picker's
// duration is exactly `afterMs`.
function stubAbortingPicker(afterMs: number) {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const showSaveFilePicker = vi.fn(() => {
    now += afterMs;
    return Promise.reject(
      new DOMException('The user aborted a request.', 'AbortError'),
    );
  });
  vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
  return showSaveFilePicker;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('saveBlob (rung 1: File System Access picker)', () => {
  it('writes through the Save-As picker and reports saved', async () => {
    const picker = stubSavePicker();
    const share = vi.fn();
    stubNavigator({ device: 'ipad', share, canShare: () => true });

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(picker.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: 'export.zip',
      types: [
        { description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } },
      ],
    });
    expect(picker.write).toHaveBeenCalledTimes(1);
    expect(picker.close).toHaveBeenCalledTimes(1);
    // The picker owns the save on this platform; Web Share is never tried.
    expect(share).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true });
  });

  it('offers the caller’s file type in the picker', async () => {
    const picker = stubSavePicker();
    stubNavigator({});

    await saveBlob(new Blob(['<svg/>']), 'background.svg', {
      description: 'SVG image',
      mimeType: 'image/svg+xml',
      extension: '.svg',
    });

    expect(picker.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        types: [
          { description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } },
        ],
      }),
    );
  });

  it('reports not saved when the picker is cancelled, with no fallthrough', async () => {
    stubAbortingPicker(1500);
    const share = vi.fn();
    stubNavigator({ device: 'ipad', share, canShare: () => true });
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    // A cancelled picker is a final "no" — offering another save mechanism
    // would recreate the nagging the ladder exists to remove.
    expect(share).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: false });
  });

  it.each([13, 199])(
    'downloads instead when the picker aborts after %i ms, before it could have been shown',
    async (afterMs) => {
      // An embedded or headless Chromium has no file dialog: it rejects with
      // AbortError within one round trip, and the click must still save.
      stubAbortingPicker(afterMs);
      stubNavigator({});
      const { createObjectURL, downloads } = stubAnchorDownload();

      const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(downloads).toEqual(['export.zip']);
      expect(result).toEqual({ saved: true });
    },
  );

  it('reads an abort at 200 ms as a cancel', async () => {
    stubAbortingPicker(200);
    stubNavigator({});
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

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
    const { createObjectURL, downloads } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['export.zip']);
    expect(result).toEqual({ saved: true });
  });

  it('falls through to the anchor download when the picker fails to open (non-cancel)', async () => {
    vi.stubGlobal(
      'showSaveFilePicker',
      vi.fn().mockRejectedValue(new DOMException('denied', 'SecurityError')),
    );
    stubNavigator({});
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });
});

describe('saveBlob (rung 2: Web Share, no picker available)', () => {
  it('shares via navigator.share when files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    stubNavigator({ device: 'iphone', share, canShare });

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

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
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: false });
  });

  it('falls through to the anchor download when share fails (canShare overpromised, #889)', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(
        new DOMException('Permission denied', 'NotAllowedError'),
      );
    stubNavigator({ device: 'ipad', share, canShare: () => true });
    const { createObjectURL, downloads } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['export.zip']);
    expect(result).toEqual({ saved: true });
  });
});

// Desktop Safari advertises file sharing, which used to send the file to the
// macOS share sheet instead of the Downloads folder (community #258). A
// desktop browser owns its downloads, so the share rung is withheld there even
// when the capability is present.
describe('the share rung is handheld-only', () => {
  it('downloads directly in desktop Safari despite canShare reporting true', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    stubNavigator({ device: 'mac', share, canShare });
    const { createObjectURL, downloads } = stubAnchorDownload();

    expect(saveAction(makeBlob(), 'export.zip')).toBe('download');

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(share).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['export.zip']);
    expect(result).toEqual({ saved: true });
  });

  it.each([
    [
      'iPadOS in desktop mode, which reports the same platform as a Mac',
      'ipad',
    ],
    [
      'an iPad that is not in desktop mode, where the platform is iPad',
      'ipadMobileMode',
    ],
    ['Android', 'android'],
  ] as const)('shares on %s', async (_label, device) => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ device, share, canShare: () => true });
    const { createObjectURL } = stubAnchorDownload();

    expect(saveAction(makeBlob(), 'export.zip')).toBe('share');

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true });
  });
});

// saveAction predicts the rung saveBlob takes, so UI can label the action
// that triggers it. Each case runs saveBlob under the same stubs to prove the
// prediction and the ladder agree.
describe('saveAction agrees with the rung saveBlob takes', () => {
  it('predicts save-as when the Save-As picker exists', async () => {
    const picker = stubSavePicker();
    stubNavigator({ device: 'ipad', share: vi.fn(), canShare: () => true });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('save-as');

    await saveBlob(makeBlob(), 'export.zip', ZIP);
    expect(picker.showSaveFilePicker).toHaveBeenCalledTimes(1);
  });

  it('predicts share when only Web Share can take the file', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ device: 'iphone', share, canShare: () => true });

    expect(saveAction(makeBlob(), 'export.zip')).toBe('share');

    await saveBlob(makeBlob(), 'export.zip', ZIP);
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('predicts download when neither capability exists', async () => {
    stubNavigator({});
    const { downloads } = stubAnchorDownload();

    expect(saveAction(makeBlob(), 'export.zip')).toBe('download');

    await saveBlob(makeBlob(), 'export.zip', ZIP);
    expect(downloads).toEqual(['export.zip']);
  });
});

describe('saveBlob (rung 3: anchor download, no picker or share)', () => {
  it('fires the object-URL download and reports saved optimistically', async () => {
    stubNavigator({});
    const { createObjectURL, downloads } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'export.zip', ZIP);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloads).toEqual(['export.zip']);
    // The outcome is unobservable on this rung; saved is reported
    // optimistically by design (see the 2026-07-08 export-save-ladder spec).
    expect(result).toEqual({ saved: true });
  });
});
