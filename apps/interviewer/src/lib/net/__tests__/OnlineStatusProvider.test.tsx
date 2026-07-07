import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { OnlineStatusProvider, useOnline } from '../OnlineStatusProvider';

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OnlineStatusProvider / useOnline', () => {
  function wrapper({ children }: { children: ReactNode }) {
    return <OnlineStatusProvider>{children}</OnlineStatusProvider>;
  }

  it('reads the initial navigator.onLine value', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnline(), { wrapper });
    expect(result.current).toBe(true);
  });

  it('exposes the current status to consumers and updates on events', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnline(), { wrapper });
    expect(result.current).toBe(false);

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('throws when useOnline is used outside the provider', () => {
    function Probe() {
      useOnline();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(
      /useOnline must be used within an OnlineStatusProvider/,
    );
  });

  it('renders children', () => {
    setOnLine(true);
    render(
      <OnlineStatusProvider>
        <span>child</span>
      </OnlineStatusProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
