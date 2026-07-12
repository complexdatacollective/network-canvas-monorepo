import { describe, expect, it, vi } from 'vitest';

import DownloadPage from '../page';

const { permanentRedirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ permanentRedirect }));

describe('DownloadPage', () => {
  it('permanently redirects to Get Started', () => {
    DownloadPage();

    expect(permanentRedirect).toHaveBeenCalledWith('/get-started');
  });
});
