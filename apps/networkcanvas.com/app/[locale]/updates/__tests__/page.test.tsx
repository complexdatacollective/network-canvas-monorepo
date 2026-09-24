import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from '@testing-library/react';
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

async function renderPage(locale: 'en-US' | 'es' = 'en-US') {
  const page = await UpdatesPage({
    params: Promise.resolve({ locale }),
  });
  renderWithIntl(page, locale);
}

// Each entry heading also carries its date, apps and, for the newest, a
// label, so an entry is identified by the title its heading contains.
function entryTitles(titles: readonly string[]) {
  return screen
    .queryAllByRole('heading', { level: 2, hidden: true })
    .filter((heading) => heading.querySelector('button'))
    .map((heading) =>
      titles.find((title) => heading.textContent?.includes(title)),
    );
}

// jsdom cannot compute the styles of the accordion's animated panels, so role
// queries skip the visibility check and assert aria-expanded instead.
function updateTrigger(title: string) {
  return within(
    screen.getByRole('heading', {
      level: 2,
      name: (name) => name.includes(title),
      hidden: true,
    }),
  ).getByRole('button', { hidden: true });
}

describe('updates page', () => {
  it('opens the newest update and collapses the rest', async () => {
    const updates = await loadUpdates('en-US');
    await renderPage();

    const headings = screen
      .getAllByRole('heading', { level: 2, hidden: true })
      .filter((heading) => heading.querySelector('button'));
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

  it('explains how to upgrade before the list of updates', async () => {
    await renderPage();

    const upgrading = screen.getByRole('region', {
      name: 'Upgrading',
      hidden: true,
    });
    expect(upgrading).toHaveTextContent(
      'Architect and Interviewer update automatically',
    );
    expect(upgrading).toHaveTextContent(
      'To upgrade to the latest version of Fresco',
    );
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

  it('narrows the list to updates that match every search word', async () => {
    const updates = await loadUpdates('en-US');
    const titles = updates.map((update) => update.title);
    const [newest, older] = updates;
    await renderPage();

    fireEvent.change(screen.getByRole('searchbox', { hidden: true }), {
      target: { value: 'schema  PROGRESSIVE' },
    });

    expect(entryTitles(titles)).toEqual([older!.title]);
    expect(updateTrigger(older!.title)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('1 of 2 updates')).toBeInTheDocument();
    expect(entryTitles(titles)).not.toContain(newest!.title);
  });

  it('ignores accents when searching', async () => {
    const updates = await loadUpdates('es');
    const titles = updates.map((update) => update.title);
    const [newest] = updates;
    await renderPage('es');

    fireEvent.change(screen.getByRole('searchbox', { hidden: true }), {
      target: { value: 'LOCALIZACION' },
    });

    expect(entryTitles(titles)).toEqual([newest!.title]);
  });

  it('does not match link destinations', async () => {
    const titles = (await loadUpdates('en-US')).map((update) => update.title);
    await renderPage();

    fireEvent.change(screen.getByRole('searchbox', { hidden: true }), {
      target: { value: 'community.networkcanvas' },
    });

    expect(entryTitles(titles)).toHaveLength(0);
    expect(screen.getByText('No updates found')).toBeInTheDocument();
  });

  it('restores every update when the search is cleared', async () => {
    const updates = await loadUpdates('en-US');
    const titles = updates.map((update) => update.title);
    await renderPage();

    fireEvent.change(screen.getByRole('searchbox', { hidden: true }), {
      target: { value: 'no such words anywhere' },
    });
    expect(screen.getByText('No updates found')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear search', hidden: true }),
    );

    expect(entryTitles(titles)).toEqual(updates.map((update) => update.title));
    expect(updateTrigger(updates[0]!.title)).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('labels only the newest update as the latest', async () => {
    const [newest, older] = await loadUpdates('en-US');
    await renderPage();

    expect(updateTrigger(newest!.title)).toHaveTextContent(/^Latest update/);
    expect(updateTrigger(older!.title)).not.toHaveTextContent('Latest update');
    expect(updateTrigger(newest!.title)).toHaveTextContent(
      'Architect Interviewer Fresco',
    );
  });

  it('filters updates by app alongside the search', async () => {
    const updates = await loadUpdates('en-US');
    await renderPage();
    const filters = screen.getByRole('group', {
      name: 'Filter by app',
      hidden: true,
    });
    const all = within(filters).getByRole('button', {
      name: 'All',
      hidden: true,
    });
    const fresco = within(filters).getByRole('button', {
      name: 'Fresco',
      hidden: true,
    });
    expect(all).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(fresco);

    expect(fresco).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    const frescoUpdates = updates.filter((update) =>
      update.apps.includes('fresco'),
    );
    expect(
      screen.getByText(`${frescoUpdates.length} of ${updates.length} updates`),
    ).toBeInTheDocument();
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
