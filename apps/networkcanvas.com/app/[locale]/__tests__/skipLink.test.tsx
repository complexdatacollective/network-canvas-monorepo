import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentProps, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';
import { renderWithIntl } from '~/test/renderWithIntl';

import GetStartedPage from '../get-started/page';
import HomePage from '../page';
import ProtocolDetailPage from '../protocol-gallery/[slug]/page';
import ProtocolGalleryPage from '../protocol-gallery/page';
import PublicationsPage from '../publications/page';
import SummerUpdateRoute from '../summer-2026-update/page';

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

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found');
  },
}));

vi.mock('~/lib/i18n/navigation', () => ({
  Link: ({ children, ...props }: ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@codaco/art', () => ({
  BackgroundLights: () => null,
  PageBackground: () => <div data-testid="page-background" />,
}));

vi.mock('~/lib/classicReleases', async () => {
  const { classicApps } = await import('~/test/classicApps');

  return {
    getLatestClassicApps: vi.fn(async () => classicApps),
  };
});

// What a browser's Tab key visits, in document order. jsdom has no layout, so
// this is the same DOM-order walk a real Tab performs on the rendered tree.
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), video[controls], audio[controls], summary, [tabindex]:not([tabindex="-1"])';

function tabbable(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE));
}

function follows(reference: Node, node: Node) {
  return Boolean(
    reference.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

const params = Promise.resolve({ locale: 'en-US' });

// Every route under app/[locale] that renders the site header. The list is
// the set of page.tsx files there; each one's header comes from
// ~/components/layout/Header, whose only consumers are these pages' sections.
const pages: ReadonlyArray<{
  name: string;
  render: () => Promise<ReactElement>;
}> = [
  { name: 'home', render: () => HomePage({ params }) },
  { name: 'publications', render: () => PublicationsPage({ params }) },
  { name: 'get started', render: () => GetStartedPage({ params }) },
  { name: 'summer 2026 update', render: () => SummerUpdateRoute({ params }) },
  { name: 'protocol gallery', render: () => ProtocolGalleryPage({ params }) },
  {
    name: 'protocol detail',
    render: () =>
      ProtocolDetailPage({
        params: Promise.resolve({ locale: 'en-US', slug: 'test-to-prep' }),
      }),
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(pages)('$name page skip link', ({ render: renderPage }) => {
  it('is first in the tab order and lands focus after the header', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network access is unavailable in tests.'),
    );
    renderWithIntl(await renderPage());

    const skipLink = screen.getByRole('link', {
      name: 'Skip to main content',
    });
    // The header sits inside <main> on these pages, so it is not a banner
    // landmark; find it from the link instead.
    const header = skipLink.closest('header');
    if (!header) throw new Error('Expected the skip link inside the header.');

    // Exactly one landing point on the page, and it is the one the link names.
    const targets = document.querySelectorAll(
      `[id="${SITE_NAVIGATION_SKIP_TARGET_ID}"]`,
    );
    expect(targets).toHaveLength(1);
    const target = targets[0];
    if (!(target instanceof HTMLElement)) {
      throw new Error('Expected the skip target.');
    }
    expect(skipLink).toHaveAttribute(
      'href',
      `#${SITE_NAVIGATION_SKIP_TARGET_ID}`,
    );

    // First in the page's tab order — ahead of the brand link, the theme
    // switcher, and anything else the page renders before its content.
    expect(tabbable(document.body)[0]).toBe(skipLink);

    // The target starts after the header ends. The pages wrap the header in
    // <main>, so the id cannot go on <main> itself: landing there would put
    // the next Tab straight back onto this link.
    expect(header.contains(target)).toBe(false);
    expect(follows(header, target)).toBe(true);

    // Activating the link moves focus, not just the scroll position, and the
    // Tab after that continues into the content rather than the header.
    fireEvent.click(skipLink);
    expect(target).toHaveFocus();
    const next = tabbable(document.body).find((element) =>
      follows(target, element),
    );
    expect(next).toBeDefined();
    expect(header.contains(next ?? null)).toBe(false);
  });
});
