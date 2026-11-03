import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ paused: [] as (boolean | undefined)[] }));
vi.mock('@codaco/art', () => ({
  BackgroundLights: ({ paused }: { paused?: boolean }) => {
    mocks.paused.push(paused);
    return null;
  },
}));

const { BackdropLights } = await import('../BackdropLights');

let focused = true;

beforeEach(() => {
  focused = true;
  mocks.paused.length = 0;
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
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

it('pauses the lights while the window is not focused', async () => {
  render(<BackdropLights />);
  expect(mocks.paused.at(-1)).toBe(false);

  await emulateFocus(false);
  expect(mocks.paused.at(-1)).toBe(true);

  await emulateFocus(true);
  expect(mocks.paused.at(-1)).toBe(false);
});
