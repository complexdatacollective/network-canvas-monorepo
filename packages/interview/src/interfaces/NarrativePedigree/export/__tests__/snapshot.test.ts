import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({
  toPng: vi.fn(),
}));

import * as htmlToImage from 'html-to-image';

import { exportSnapshot } from '../snapshot';

const FAKE_DATA_URL = 'data:image/png;base64,fakedata';

describe('exportSnapshot', () => {
  let element: HTMLElement;
  let appendedAnchors: HTMLAnchorElement[];

  beforeEach(() => {
    vi.mocked(htmlToImage.toPng).mockResolvedValue(FAKE_DATA_URL);
    element = document.createElement('div');
    appendedAnchors = [];

    const originalAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        // No-op impl: without it the spy calls through and jsdom logs
        // "Not implemented: navigation to another Document" for the download click.
        vi.spyOn(node, 'click').mockImplementation(() => {});
        appendedAnchors.push(node);
      }
      return originalAppend(node);
    });

    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls toPng with the element and a white printable background', async () => {
    await exportSnapshot(element, 'test.png');
    expect(htmlToImage.toPng).toHaveBeenCalledWith(
      element,
      expect.objectContaining({ backgroundColor: '#ffffff' }),
    );
  });

  it('resets the clone to in-flow positioning so the off-screen document is not captured blank', async () => {
    // The snapshot document is mounted position: fixed; left: -100000px. Without
    // a position reset html-to-image clones that and renders the whole subtree
    // outside the capture area, producing an empty PNG.
    await exportSnapshot(element, 'test.png');
    expect(htmlToImage.toPng).toHaveBeenCalledWith(
      element,
      expect.objectContaining({
        style: expect.objectContaining({ position: 'static' }),
      }),
    );
  });

  it('appends an anchor with the correct href and filename, then clicks and removes it', async () => {
    await exportSnapshot(element, 'pedigree-2026.png');

    expect(appendedAnchors).toHaveLength(1);
    const anchor = appendedAnchors[0];
    expect(anchor).toBeDefined();
    if (anchor === undefined) return;

    expect(anchor.href).toBe(FAKE_DATA_URL);
    expect(anchor.download).toBe('pedigree-2026.png');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(document.body.removeChild).toHaveBeenCalledWith(anchor);
  });
});
