import { afterEach, describe, expect, it, vi } from 'vitest';

import { PYTHON_FILETYPE, R_FILETYPE, saveBlob, SVG_FILETYPE } from '../save';

function makeBlob() {
  return new Blob(['<svg></svg>'], { type: 'image/svg+xml' });
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

// The share rung is handheld-only, so every navigator stub that offers Web
// Share has to declare which kind of device it is. iPhone/Android are
// recognised by user agent; iPadOS in its default desktop mode reports itself
// as a Mac with a touchscreen, and names itself in every other mode.
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
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
    platform: 'Linux armv81',
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
  const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
  vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
  return { showSaveFilePicker, createWritable, write, close };
}

// The picker's AbortError means "cancelled" only when it took a person's time
// to arrive; saveBlob reads the clock either side of the picker call.
function stubPickerDuration(ms: number) {
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(ms);
}

function stubAbortingPicker() {
  const showSaveFilePicker = vi
    .fn()
    .mockRejectedValue(
      new DOMException('The user aborted a request.', 'AbortError'),
    );
  vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
  return showSaveFilePicker;
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

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(picker.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: 'background.svg',
        types: [
          {
            description: 'SVG image',
            accept: { 'image/svg+xml': ['.svg'] },
          },
        ],
      }),
    );
    expect(picker.write).toHaveBeenCalledTimes(1);
    expect(picker.close).toHaveBeenCalledTimes(1);
    // The picker owns the save on this platform; Web Share is never tried.
    expect(share).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true });
  });

  it('builds the picker types/accept map from the given filetype', async () => {
    const picker = stubSavePicker();
    stubNavigator({});

    await saveBlob(makeBlob(), 'assign_zones.py', PYTHON_FILETYPE);

    expect(picker.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({
        types: [
          {
            description: 'Python script',
            accept: { 'text/x-python': ['.py'] },
          },
        ],
      }),
    );
  });

  it('reports not saved when the picker is cancelled, with no fallthrough', async () => {
    stubAbortingPicker();
    stubPickerDuration(1500);
    const share = vi.fn();
    stubNavigator({ device: 'ipad', share, canShare: () => true });
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    // A cancelled picker is a final "no" — offering another save mechanism
    // would recreate the nagging the ladder exists to remove.
    expect(share).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: false });
  });

  it('downloads instead when the picker aborts before it could have been shown', async () => {
    // An embedded or headless Chromium has no file dialog: it rejects with
    // AbortError within one round trip, and the click must still save.
    stubAbortingPicker();
    stubPickerDuration(20);
    stubNavigator({});
    const { createObjectURL, click, anchor } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('background.svg');
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
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

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

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

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

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

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({ files: expect.any(Array) }),
    );
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.any(Array),
        title: 'background.svg',
      }),
    );
    expect(result).toEqual({ saved: true });
  });

  it('reports not saved when the user cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), {
      name: 'AbortError',
    });
    const share = vi.fn().mockRejectedValue(abort);
    stubNavigator({ device: 'iphone', share, canShare: () => true });

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

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

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });
});

describe('the share rung is handheld-only', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downloads directly in desktop Safari despite canShare reporting true', async () => {
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(true);
    stubNavigator({ device: 'mac', share, canShare });
    const { createObjectURL, click, anchor } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(share).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('background.svg');
    expect(click).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ saved: true });
  });

  it.each([
    [
      'iPadOS in desktop mode, which reports the same platform as a Mac',
      'ipad',
    ],
    ['an iPad that is not in desktop mode', 'ipadMobileMode'],
    ['Android', 'android'],
  ] as const)('shares on %s', async (_label, device) => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ device, share, canShare: () => true });
    const { createObjectURL } = stubAnchorDownload();

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(share).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: true });
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

    const result = await saveBlob(makeBlob(), 'background.svg', SVG_FILETYPE);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('background.svg');
    expect(click).toHaveBeenCalledTimes(1);
    // The outcome is unobservable on this rung; saved is reported
    // optimistically by design (see the 2026-07-08 export-save-ladder spec).
    expect(result).toEqual({ saved: true });
  });

  it('uses the R filetype for R script exports', async () => {
    stubNavigator({});
    const { anchor } = stubAnchorDownload();

    const result = await saveBlob(
      new Blob(['assign_zone <- function() {}'], { type: 'text/plain' }),
      'assign_zones.R',
      R_FILETYPE,
    );

    expect(anchor.download).toBe('assign_zones.R');
    expect(result).toEqual({ saved: true });
  });
});
