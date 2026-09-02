import { Link, Outlet } from '@tanstack/react-router';
import type { MouseEvent } from 'react';

import { DEFAULT_SKIP_TARGET_ID } from '@codaco/fresco-ui/layout/AppFrame';
import SiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';
import type {
  SiteFooterLink,
  SiteFooterSocialLink,
} from '@codaco/fresco-ui/navigation/SiteFooter';
import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type { SiteNavigationLinkRenderProps } from '@codaco/fresco-ui/navigation/SiteNavigation';

/**
 * The site shell (§5.3, §10.1): the Network Canvas header and footer, around
 * the public pages — marketing, pricing and the legal documents.
 *
 * `SiteNavigation` and `SiteFooter` are the canonical header and footer, used
 * by networkcanvas.com and the documentation site already. Studio adopts them
 * rather than growing a second site header, and supplies router links; the
 * item set, the ordering and the translated copy stay in the shared component,
 * where every site reads one copy of them.
 *
 * There is no app header here and no session: a visitor who has never signed
 * in is the expected reader. Each site screen renders its own
 * `<main id="main-content">`, because the site branch has no area layout to
 * own that landmark (§7.1) — and this layout renders the bypass link that
 * targets it, because the navigation above it repeats on every public page.
 */

const SOCIAL_LINKS: readonly SiteFooterSocialLink[] = [
  {
    platform: 'youtube',
    label: 'Network Canvas on YouTube',
    href: 'https://www.youtube.com/@complexdatacollective2923',
  },
  {
    platform: 'twitter',
    label: 'Network Canvas on X',
    href: 'https://twitter.com/networkcanvas?lang=en',
  },
  {
    platform: 'github',
    label: 'Network Canvas on GitHub',
    href: 'https://github.com/complexdatacollective',
  },
];

/**
 * The legal documents are Studio's own routes, so they are same-origin — but
 * `SiteFooter` sends its links to another tab by default, which is right for
 * the outbound project links it was built for and wrong for these. Naming the
 * target here is what keeps them in the reader's current tab.
 */
const FOOTER_LINKS: readonly SiteFooterLink[] = [
  { label: 'Privacy', href: '/legal/privacy', target: '_self', rel: '' },
  { label: 'Terms', href: '/legal/terms', target: '_self', rel: '' },
];

function renderSiteLink({
  children,
  href,
  ...props
}: SiteNavigationLinkRenderProps) {
  // Everything `SiteNavigation` itself points at is an absolute URL on another
  // Network Canvas site, so these are ordinary anchors. An internal path can
  // only arrive once the shared component gains the Studio entry §10.1
  // reserves, and that one has to be a router navigation rather than a
  // document load.
  return href.startsWith('/') ? (
    <Link {...props} to={href}>
      {children}
    </Link>
  ) : (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

/**
 * Moves focus to the site page's own `<main>`.
 *
 * A fragment link scrolls its target into view but only moves focus when that
 * target is already focusable, and `<main>` is not — so a plain `href="#…"`
 * leaves focus on the bypass and the visitor's next Tab restarts at the top of
 * the document, on the link they just used. The target is given `tabindex="-1"`
 * for the length of this one focus and left as it was found, because it
 * belongs to the screen rather than to this layout.
 *
 * Resolved through the anchor's own `ownerDocument` rather than the ambient
 * `document`, which is the wrong page in a popped-out window or an iframe.
 */
function focusSiteMain(event: MouseEvent<HTMLAnchorElement>) {
  // Always suppressed: the browser's fallback for a fragment that matches
  // nothing is to write the hash into the URL, which here is a navigation
  // nobody asked for.
  event.preventDefault();
  const target = event.currentTarget.ownerDocument.getElementById(
    DEFAULT_SKIP_TARGET_ID,
  );
  if (!target) return;

  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
    target.addEventListener(
      'blur',
      () => {
        target.removeAttribute('tabindex');
      },
      { once: true },
    );
  }
  target.focus();
}

export default function SiteLayout() {
  return (
    <div className="flex min-h-full flex-col">
      {/*
        WCAG 2.4.1. The site header repeats on every public page, so the bypass
        has to come before it — first in the layout, and so the first focusable
        element of the document. `AppFrame` does the same for the app shell;
        the site shell has to do it here because `SiteNavigation` is shared
        with networkcanvas.com and the documentation site, and giving that
        component a skip link is a change to all three (§7.1 wants it there
        eventually, as one change reviewed against all of its consumers).
      */}
      <a
        href={`#${DEFAULT_SKIP_TARGET_ID}`}
        onClick={focusSiteMain}
        className="focusable bg-surface text-surface-contrast fixed inset-s-2 top-2 z-50 -translate-y-24 rounded px-4 py-2 shadow-lg transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      <SiteNavigation
        locale="en-US"
        site="external"
        renderLink={renderSiteLink}
      />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter
        brand={
          <span className="font-heading text-lg font-bold tracking-[0.18em] uppercase">
            Network Canvas Studio
          </span>
        }
        links={FOOTER_LINKS}
        copyright={`© ${new Date().getFullYear()} Complex Data Collective`}
        socialLinks={SOCIAL_LINKS}
      />
    </div>
  );
}
