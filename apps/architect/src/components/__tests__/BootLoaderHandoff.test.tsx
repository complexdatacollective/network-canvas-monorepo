import { act, render, screen } from '@testing-library/react';
import { use } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import BootLoaderHandoff from '../BootLoaderHandoff';

function Suspends({ ready }: { ready: Promise<string> }) {
  return <p>{use(ready)}</p>;
}

function suspendedUntilResolved() {
  let resolve: (value: string) => void = () => {};
  const ready = new Promise<string>((done) => {
    resolve = done;
  });
  return { ready, resolve };
}

// An async act: a synchronous one drops the retry of a root that suspended.
async function renderSuspendedApp(ready: Promise<string>) {
  await act(async () => {
    render(
      <>
        <Suspends ready={ready} />
        <BootLoaderHandoff />
      </>,
    );
  });
}

const bootLoader = () => document.getElementById('boot-loader');

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setTimeout',
      'clearTimeout',
    ],
  });
  // Without motion the loader is removed at once rather than faded out.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const loader = document.createElement('div');
  loader.id = 'boot-loader';
  document.body.append(loader);
});

afterEach(() => {
  bootLoader()?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('keeps the boot loader up while the first screen is suspended, and removes it once that screen has painted', async () => {
  const { ready, resolve } = suspendedUntilResolved();
  await renderSuspendedApp(ready);
  act(() => {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersByTime(1000);
  });
  expect(bootLoader()).not.toBeNull();

  await act(async () => {
    resolve('Architect');
    await ready;
  });
  expect(screen.getByText('Architect')).toBeInTheDocument();
  expect(bootLoader()).not.toBeNull();

  act(() => {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  });
  expect(bootLoader()).toBeNull();
});

it('still removes the boot loader in a background tab, where frames never run', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  const { ready, resolve } = suspendedUntilResolved();
  await renderSuspendedApp(ready);
  await act(async () => {
    resolve('Architect');
    await ready;
  });
  expect(bootLoader()).not.toBeNull();

  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(bootLoader()).toBeNull();
});
