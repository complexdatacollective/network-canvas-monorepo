import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import useCanvas from '~/hooks/useCanvas';

// The canvas loop runs only while the page is in front of the user: visible,
// and its window focused. Frames here run only when a test flushes them, and
// the clock moves only when a test moves it.
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let focused = true;
let now = 1000;

beforeEach(() => {
  frames = new Map();
  focused = true;
  now = 1000;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushFrame(after: number) {
  now += after;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(now);
}

// The window's focus moves, and the deferred blur check runs.
async function emulateFocus(next: boolean) {
  await act(async () => {
    focused = next;
    window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function CanvasProbe({ draw }: { draw: (ctx: unknown, time: number) => void }) {
  const canvasRef = useCanvas(draw);
  return <canvas ref={canvasRef} />;
}

describe('useCanvas', () => {
  test('animates while the page is in front of the user', () => {
    render(<CanvasProbe draw={vi.fn()} />);
    expect(frames.size).toBe(1);

    flushFrame(16);
    expect(frames.size).toBe(1);
  });

  test('asks for no frames while the window is not focused, and resumes', async () => {
    render(<CanvasProbe draw={vi.fn()} />);

    await emulateFocus(false);
    expect(frames.size).toBe(0);

    await emulateFocus(true);
    expect(frames.size).toBe(1);
  });

  test('draws one frame but does not start on a page that is not in front of the user', () => {
    focused = false;
    const draw = vi.fn();
    render(<CanvasProbe draw={draw} />);

    expect(draw).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  test('carries on from where it stopped rather than jumping by the time away', async () => {
    const draw = vi.fn();
    render(<CanvasProbe draw={draw} />);
    flushFrame(16);
    expect(draw).toHaveBeenLastCalledWith(
      expect.anything(),
      16,
      expect.anything(),
    );

    await emulateFocus(false);
    now += 60_000;
    await emulateFocus(true);
    flushFrame(16);

    expect(draw).toHaveBeenLastCalledWith(
      expect.anything(),
      32,
      expect.anything(),
    );
  });
});
