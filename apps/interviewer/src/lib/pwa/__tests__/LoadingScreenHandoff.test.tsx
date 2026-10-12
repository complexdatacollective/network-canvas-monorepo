import { act, render, screen } from '@testing-library/react';
import { StrictMode, use } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LoadingScreenHandoff } from '../LoadingScreenHandoff';

function Suspends({ ready }: { ready: Promise<string> }) {
  return <p>{use(ready)}</p>;
}

function nextFrames() {
  act(() => {
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame'],
  });
  // Without motion the loader is removed at once rather than faded out.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const loader = document.createElement('div');
  loader.id = 'app-loading';
  document.body.append(loader);
});

afterEach(() => {
  document.getElementById('app-loading')?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('keeps the static loader up while the first screen is suspended, and removes it once that screen has painted', async () => {
  let resolve: (value: string) => void = () => {};
  const ready = new Promise<string>((done) => {
    resolve = done;
  });

  // An async act: a synchronous one drops the retry of a root that suspended.
  await act(async () => {
    render(
      <StrictMode>
        <Suspends ready={ready} />
        <LoadingScreenHandoff />
      </StrictMode>,
    );
  });
  nextFrames();
  expect(document.getElementById('app-loading')).not.toBeNull();

  await act(async () => {
    resolve('Interviewer');
    await ready;
  });
  expect(screen.getByText('Interviewer')).toBeInTheDocument();
  // Committed, but not yet painted.
  expect(document.getElementById('app-loading')).not.toBeNull();

  nextFrames();
  expect(document.getElementById('app-loading')).toBeNull();
});
