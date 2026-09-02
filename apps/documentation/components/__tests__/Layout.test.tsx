import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SITE_NAVIGATION_SKIP_TARGET_ID } from '@codaco/fresco-ui/navigation/SiteNavigation.constants';

import messages from '../../messages/en.json';
import { LayoutComponent } from '../Layout';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/desktop',
}));

vi.mock('~/navigation', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  } & Omit<ComponentProps<'a'>, 'href'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/desktop',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@codaco/art', () => ({
  PageBackgroundProvider: ({ children }: { children: ReactNode }) => children,
  usePageBackgroundTargetRef: () => null,
}));

// The layout's other regions stand in as their focusable outlines, so the
// test is about where the layout puts the header, the landing point, and the
// content relative to each other — not about what those regions contain.
vi.mock('~/components/MobileNavBar', () => ({
  default: () => <button type="button">Search documentation</button>,
}));

vi.mock('~/components/WorkflowNav', () => ({
  default: ({ className }: { className?: string }) => (
    <div className={className}>
      <a href="#section-switcher">Section switcher link</a>
    </div>
  ),
}));

vi.mock('~/components/Sidebar', () => ({
  Sidebar: ({ className }: { className?: string }) => (
    <nav className={className}>
      <a href="#sidebar">Sidebar link</a>
    </nav>
  ),
}));

vi.mock('~/components/DocumentationFooter', () => ({
  default: () => (
    <footer>
      <a href="#footer">Footer link</a>
    </footer>
  ),
}));

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

function renderLayout() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <LayoutComponent>
        <article>
          <a href="#content">Content link</a>
        </article>
      </LayoutComponent>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe('documentation layout skip link', () => {
  it('opens the page with the skip link and lands focus on <main>', () => {
    renderLayout();

    const skipLink = screen.getByRole('link', {
      name: 'Skip to main content',
    });
    const header = screen.getByRole('banner');
    const main = screen.getByRole('main');

    // The layout's <main> is the one landing point, and it is what the link
    // names — the same constant, not a literal that could drift.
    expect(
      document.querySelectorAll(`[id="${SITE_NAVIGATION_SKIP_TARGET_ID}"]`),
    ).toHaveLength(1);
    expect(main).toHaveAttribute('id', SITE_NAVIGATION_SKIP_TARGET_ID);
    expect(skipLink).toHaveAttribute(
      'href',
      `#${SITE_NAVIGATION_SKIP_TARGET_ID}`,
    );

    // First in the page's tab order — ahead of the brand link, the search
    // accessory, and the theme switcher the layout injects into the header.
    expect(tabbable(document.body)[0]).toBe(skipLink);
    expect(header.contains(main)).toBe(false);
    expect(follows(header, main)).toBe(true);

    // Activating the link moves focus onto <main>; the Tab after that
    // continues into the content rather than back into the header.
    fireEvent.click(skipLink);
    expect(main).toHaveFocus();
    expect(main).toHaveAttribute('tabindex', '-1');
    const next = tabbable(document.body).find((element) =>
      follows(main, element),
    );
    expect(next).toBeDefined();
    expect(main.contains(next ?? null)).toBe(true);
  });
});
