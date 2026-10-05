import { render } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import useHasHydrated from '../useHasHydrated';

function Probe() {
  const hydrated = useHasHydrated();
  return <div data-hydrated={hydrated ? 'yes' : 'no'} />;
}

const readProbe = (container: HTMLElement) =>
  container.firstElementChild?.getAttribute('data-hydrated');

describe('useHasHydrated', () => {
  it('reads false in server markup', () => {
    expect(renderToString(<Probe />)).toContain('data-hydrated="no"');
  });

  it('reads false through the hydrating render, then true, with no mismatch', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Probe />);
    document.body.append(container);

    // The pre-hydration assertion is the half that can actually fail: a
    // `useState(true)` initialiser would already read "yes" here, and React
    // would then discard the server markup instead of hydrating it.
    expect(readProbe(container)).toBe('no');

    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, <Probe />, { onRecoverableError });
    await act(async () => {});

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(readProbe(container)).toBe('yes');

    await act(async () => root.unmount());
    container.remove();
  });

  it('reads true on the first render of a client-only mount', () => {
    // No server markup for this subtree, so there is nothing to agree with and
    // nothing to defer. A mount flag would report false for one committed
    // frame here, which is the flash this hook exists to avoid.
    const renders: boolean[] = [];

    function RecordingProbe() {
      const hydrated = useHasHydrated();
      renders.push(hydrated);
      return null;
    }

    render(<RecordingProbe />);

    expect(renders[0]).toBe(true);
    expect(renders).not.toContain(false);
  });
});
