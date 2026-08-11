import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Link from '../Link';

describe('documentation links', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it('points website links at the configured deployment', () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK_CANVAS_URL', 'http://localhost:3001');

    render(
      <Link href="https://networkcanvas.com/get-started#collect">
        Get started
      </Link>,
    );

    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      'http://localhost:3001/get-started#collect',
    );
  });
});
