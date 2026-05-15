import { render, renderHook, screen } from '@testing-library/react';
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
});
