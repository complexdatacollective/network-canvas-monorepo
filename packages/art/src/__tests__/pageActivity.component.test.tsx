import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useCanvas from '../BackgroundBlobs/useCanvas';
import BackgroundLights from '../BackgroundLights/BackgroundLights';

// The art's frame loops run only while the page is in front of the user:
// visible, and its window focused. Frames here run only when a test flushes
// them, so a test can see whether a loop is still asking for them.
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let focused = true;

beforeEach(() => {
  frames = new Map();
  focused = true;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
    (callback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
  );
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now());
}

// The window's focus moves, and the deferred blur check runs.
async function emulateFocus(next: boolean) {
  await act(async () => {
    focused = next;
    window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function CanvasProbe({ draw }: { draw: () => void }) {
  const canvasRef = useCanvas(draw);
  return <canvas ref={canvasRef} />;
}

describe.each([
  {
    loop: 'BackgroundLights',
    renderLoop: () =>
      render(<BackgroundLights large={1} medium={0} small={0} />),
  },
  {
    loop: 'useCanvas',
    renderLoop: () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        clearRect: vi.fn(),
        scale: vi.fn(),
        canvas: { width: 0, height: 0 },
      } as unknown as CanvasRenderingContext2D);
      return render(<CanvasProbe draw={vi.fn()} />);
    },
  },
])('$loop', ({ renderLoop }) => {
  it('animates while the page is in front of the user', () => {
    renderLoop();
    expect(frames.size).toBe(1);

    flushFrame();
    expect(frames.size).toBe(1);
  });

  it('asks for no frames while the window is not focused, and resumes', async () => {
    renderLoop();

    await emulateFocus(false);
    expect(frames.size).toBe(0);

    await emulateFocus(true);
    expect(frames.size).toBe(1);
  });

  it('does not start on a page that is not in front of the user', () => {
    focused = false;
    renderLoop();

    expect(frames.size).toBe(0);
  });
});
