import { act, cleanup, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadUpdates } from '~/lib/siteContent';
import { renderWithIntl } from '~/test/renderWithIntl';

import UpdatesPage, { generateMetadata } from '../page';

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
  Link: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a {...props} href={`/en-US${href}`}>
      {children}
    </a>
  ),
  usePathname: () => '/updates',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@codaco/art', () => ({
  PageBackground: () => <div data-testid="page-background" />,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

async function renderPage() {
  const page = await UpdatesPage({
    params: Promise.resolve({ locale: 'en-US' }),
  });
  renderWithIntl(page, 'en-US');
}

// jsdom cannot compute the styles of the accordion's animated panels, so role
// queries skip the visibility check and assert aria-expanded instead.
function updateTrigger(title: string) {
  return within(
    screen.getByRole('heading', {
      level: 2,
      name: (name) => name.startsWith(title),
      hidden: true,
    }),
  ).getByRole('button', { hidden: true });
}

describe('updates page', () => {
  it('opens the newest update and collapses the rest', async () => {
    const updates = await loadUpdates('en-US');
    await renderPage();

    const headings = screen.getAllByRole('heading', { level: 2, hidden: true });
    expect(headings).toHaveLength(updates.length);
    expect(updates.length).toBeGreaterThan(1);

    const [newest, ...older] = updates;
    expect(updateTrigger(newest!.title)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    for (const update of older) {
      expect(updateTrigger(update.title)).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    }
  });

  it('opens the update a link points at', async () => {
    const [, older] = await loadUpdates('en-US');
    window.history.replaceState(null, '', `/en-US/updates#${older!.id}`);
    await renderPage();

    expect(updateTrigger(older!.title)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('opens an update when the address changes to point at it', async () => {
    const [, older] = await loadUpdates('en-US');
    await renderPage();
    expect(updateTrigger(older!.title)).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    act(() => {
      window.history.replaceState(null, '', `#${older!.id}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(updateTrigger(older!.title)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps links to the site’s own pages in the visitor’s locale', async () => {
    window.history.replaceState(null, '', '/en-US/updates#summer-2026');
    await renderPage();

    expect(
      screen.getByRole('link', {
        name: 'Read the full announcement',
        hidden: true,
      }),
    ).toHaveAttribute('href', '/en-US/summer-2026-update');
  });

  it('generates Spanish metadata and language alternates', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata).toMatchObject({
      title: 'Novedades',
      alternates: {
        canonical: 'https://networkcanvas.com/es/updates',
        languages: {
          'en-US': 'https://networkcanvas.com/en-US/updates',
          'en-GB': 'https://networkcanvas.com/en-GB/updates',
          'es': 'https://networkcanvas.com/es/updates',
        },
      },
    });
  });
});
