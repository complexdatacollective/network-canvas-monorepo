import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initVisualViewportSizing } from '../visualViewportSizing';

type ViewportValues = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  pageLeft: number;
  pageTop: number;
  scale: number;
};

class VisualViewportStub extends EventTarget {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  pageLeft: number;
  pageTop: number;
  scale: number;

  constructor(values: ViewportValues) {
    super();
    this.width = values.width;
    this.height = values.height;
    this.offsetLeft = values.offsetLeft;
    this.offsetTop = values.offsetTop;
    this.pageLeft = values.pageLeft;
    this.pageTop = values.pageTop;
    this.scale = values.scale;
  }

  update(values: Partial<ViewportValues>, event: 'resize' | 'scroll') {
    Object.assign(this, values);
    this.dispatchEvent(new Event(event));
  }
}

const DEFAULT_VIEWPORT: ViewportValues = {
  width: 1_280,
  height: 650,
  offsetLeft: 0,
  offsetTop: 70,
  pageLeft: 0,
  pageTop: 70,
  scale: 1,
};

function installViewport(values: Partial<ViewportValues> = {}) {
  const viewport = new VisualViewportStub({
    ...DEFAULT_VIEWPORT,
    ...values,
  });
  vi.stubGlobal('visualViewport', viewport);
  return viewport;
}

function setInstalled(installed: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: installed && query === '(display-mode: standalone)',
  }));
}

function root() {
  const element = document.getElementById('root');
  if (!element) throw new Error('Missing #root test fixture');
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  setInstalled(false);
  vi.stubGlobal('innerWidth', 1_280);
  vi.stubGlobal('innerHeight', 720);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('initVisualViewportSizing', () => {
  it('tracks the browser visual viewport height and position', () => {
    const viewport = installViewport();

    const cleanup = initVisualViewportSizing();

    expect(root()).toHaveAttribute('data-visual-viewport', 'active');
    expect(root().style.getPropertyValue('--app-viewport-width')).toBe(
      '1280px',
    );
    expect(root().style.getPropertyValue('--app-viewport-height')).toBe(
      '650px',
    );
    expect(root().style.getPropertyValue('--app-viewport-left')).toBe('0px');
    expect(root().style.getPropertyValue('--app-viewport-top')).toBe('70px');

    viewport.update({ height: 420, offsetTop: 90, pageTop: 90 }, 'resize');

    expect(root().style.getPropertyValue('--app-viewport-height')).toBe(
      '420px',
    );
    expect(root().style.getPropertyValue('--app-viewport-top')).toBe('90px');

    viewport.update({ pageTop: 110, offsetTop: 110 }, 'scroll');
    expect(root().style.getPropertyValue('--app-viewport-top')).toBe('110px');

    cleanup();
    expect(root()).not.toHaveAttribute('data-visual-viewport');
    expect(root().getAttribute('style')).toBeNull();

    viewport.update({ height: 300 }, 'resize');
    expect(root().getAttribute('style')).toBeNull();
  });

  it('keeps the static 100vh fallback when VisualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);

    const cleanup = initVisualViewportSizing();

    expect(root()).not.toHaveAttribute('data-visual-viewport');
    expect(root().getAttribute('style')).toBeNull();
    expect(cleanup).toBeTypeOf('function');
  });

  it('does not reflow the app while the visual viewport is pinch-zoomed', () => {
    const viewport = installViewport({ scale: 2, height: 325 });

    const cleanup = initVisualViewportSizing();

    expect(root()).not.toHaveAttribute('data-visual-viewport');

    viewport.update({ scale: 1, height: 650 }, 'resize');
    expect(root()).toHaveAttribute('data-visual-viewport', 'active');

    cleanup();
  });

  it('preserves standalone full-height paint until a focused software keyboard shrinks the viewport', () => {
    setInstalled(true);
    vi.stubGlobal('innerWidth', 1_824);
    vi.stubGlobal('innerHeight', 1_368);
    const viewport = installViewport({
      width: 1_824,
      height: 1_320,
      offsetTop: 0,
      pageTop: 0,
    });

    const cleanup = initVisualViewportSizing();

    // A short cold-start VisualViewport must not undo the 100vh fallback that
    // reaches the bottom edge in an installed iPad PWA.
    expect(root()).not.toHaveAttribute('data-visual-viewport');

    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    input.focus();
    viewport.update({ height: 526 }, 'resize');

    expect(root()).toHaveAttribute('data-visual-viewport', 'active');
    expect(root().style.getPropertyValue('--app-viewport-height')).toBe(
      '526px',
    );

    // WebKit can blur the control before its keyboard-closing resize settles;
    // keep the shrunken frame until the visual viewport recovers.
    input.blur();
    expect(root()).toHaveAttribute('data-visual-viewport', 'active');

    viewport.update({ height: 1_320 }, 'resize');
    expect(root()).not.toHaveAttribute('data-visual-viewport');
    expect(root().getAttribute('style')).toBeNull();

    cleanup();
  });

  it('ignores a standalone viewport anomaly when no text-entry session is active', () => {
    setInstalled(true);
    vi.stubGlobal('innerHeight', 1_368);
    const viewport = installViewport({ height: 526, offsetTop: 0, pageTop: 0 });

    const cleanup = initVisualViewportSizing();

    expect(root()).not.toHaveAttribute('data-visual-viewport');

    viewport.update({ height: 400 }, 'resize');
    expect(root()).not.toHaveAttribute('data-visual-viewport');

    cleanup();
  });
});
