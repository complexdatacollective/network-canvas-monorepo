import { beforeEach, describe, expect, it, vi } from 'vitest';

import LocalizedDownloadPage from '../[locale]/download/page';

const { permanentRedirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ permanentRedirect }));

beforeEach(() => {
  permanentRedirect.mockClear();
});

describe('legacy redirects', () => {
  it.each(['en', 'es'] as const)(
    'preserves the %s locale for legacy downloads',
    async (locale) => {
      await LocalizedDownloadPage({ params: Promise.resolve({ locale }) });

      expect(permanentRedirect).toHaveBeenCalledWith(`/${locale}/get-started`);
    },
  );
});
