import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EncryptionBackground from '../EncryptedBackground';

// Frames run only when a test flushes them, so a test can see whether the
// falling streams are still asking for them.
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;
let focused = true;

beforeEach(() => {
  frames = new Map();
  focused = true;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function emulateFocus(next: boolean) {
  await act(async () => {
    focused = next;
    window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
    // The blur check runs a task later.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('EncryptionBackground', () => {
  it('lets the streams fall only while its window is focused', async () => {
    render(<EncryptionBackground thresholdPosition={50} />);
    expect(frames.size).toBe(1);

    await emulateFocus(false);
    expect(frames.size).toBe(0);

    await emulateFocus(true);
    expect(frames.size).toBe(1);
  });
});
