import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { Suspense, use } from 'react';
import { describe, expect, it } from 'vitest';

import { PortalContainerProvider, usePortalContainer } from './PortalContainer';

describe('PortalContainerProvider', () => {
  it('exposes a DOM node via usePortalContainer when wrapping children', () => {
    const { result } = renderHook(() => usePortalContainer(), {
      wrapper: ({ children }) => (
        <PortalContainerProvider>{children}</PortalContainerProvider>
      ),
    });

    expect(result.current).toBeInstanceOf(HTMLElement);
  });

  it('returns null when usePortalContainer is called outside a provider', () => {
    const { result } = renderHook(() => usePortalContainer());
    expect(result.current).toBeNull();
  });

  it('renders children', () => {
    render(
      <PortalContainerProvider>
        <span data-testid="child">hello</span>
      </PortalContainerProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('does not loop when content below the provider suspends once the container exists', async () => {
    // Detaching a ref inside a hidden Suspense boundary calls it with null. If
    // that clears the container, the content stops suspending, is revealed and
    // re-attaches the ref, which makes it suspend again: React gives up with
    // "Maximum update depth exceeded" instead of showing the fallback.
    const neverArrives = new Promise<void>(() => undefined);

    function SuspendsOnceContainerExists() {
      const container = usePortalContainer();
      if (container) use(neverArrives);
      return <span data-testid="content">content</span>;
    }

    render(
      <Suspense fallback={<span data-testid="fallback" />}>
        <PortalContainerProvider>
          <SuspendsOnceContainerExists />
        </PortalContainerProvider>
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });
  });
});
