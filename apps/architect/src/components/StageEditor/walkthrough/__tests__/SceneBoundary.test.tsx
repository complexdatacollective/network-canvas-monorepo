import { render, screen } from '@testing-library/react';
import { lazy, Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';

import SceneBoundary from '../SceneBoundary';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('~/analytics', () => ({ posthog: { captureException } }));

describe('SceneBoundary', () => {
  it('keeps a scene that fails to load from taking the step with it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Scene = lazy(() => Promise.reject(new Error('chunk gone')));
    render(
      <div>
        <SceneBoundary>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </SceneBoundary>
        <p>Step text</p>
      </div>,
    );
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledOnce());
    expect(screen.getByText('Step text')).toBeTruthy();
  });
});
