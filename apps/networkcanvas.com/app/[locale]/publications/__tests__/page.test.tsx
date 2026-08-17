import { cleanup, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSiteContent } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import PublicationsPage, { generateMetadata } from '../page';

vi.mock('next-intl/server', async () => {
  const { loadLocaleMessages } = await import('~/lib/i18n/messages');

  return {
    setRequestLocale: vi.fn(),
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: 'en-US' | 'en-GB' | 'es';
      namespace: string;
    }) => {
      const messages = loadLocaleMessages(locale) as Record<
        string,
        Record<string, unknown>
      >;
      const scope = messages[namespace] ?? {};
      const read = (key: string) => {
        const value = key
          .split('.')
          .reduce<unknown>(
            (current, part) => (current as Record<string, unknown>)?.[part],
            scope,
          );

        return typeof value === 'string' ? value : key;
      };

      return Object.assign(read, { rich: read });
    },
  };
});

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, ...props }: ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
  usePathname: () => '/publications',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@codaco/art', () => ({
  PageBackground: () => <div data-testid="page-background" />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('publications page', () => {
  it('lists every publication, newest first', async () => {
    const { publications } = await loadSiteContent('en-US');
    const page = await PublicationsPage({
      params: Promise.resolve({ locale: 'en-US' }),
    });
    renderWithIntl(page, 'en-US');

    const entries = screen.getAllByRole('listitem');
    const rendered = entries.filter((entry) => entry.querySelector('time'));

    expect(rendered).toHaveLength(publications.length);
    expect(rendered.length).toBeGreaterThan(8);

    const years = rendered.map((entry) =>
      Number(entry.querySelector('time')?.textContent),
    );
    expect(years).toEqual(years.toSorted((a, b) => b - a));
  });

  it('links each entry to its source', async () => {
    const page = await PublicationsPage({
      params: Promise.resolve({ locale: 'en-US' }),
    });
    renderWithIntl(page, 'en-US');

    const link = screen.getByRole('link', {
      name: /Comparing name generator designs/,
    });

    expect(link).toHaveAttribute(
      'href',
      'https://doi.org/10.1177/1525822X261446429',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('generates Spanish metadata and language alternates', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata).toMatchObject({
      title: 'Publicaciones',
      alternates: {
        canonical: 'https://networkcanvas.com/es/publications',
        languages: {
          'en-US': 'https://networkcanvas.com/en-US/publications',
          'en-GB': 'https://networkcanvas.com/en-GB/publications',
          'es': 'https://networkcanvas.com/es/publications',
        },
      },
    });
  });
});
