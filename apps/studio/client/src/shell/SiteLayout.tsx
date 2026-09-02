import { Link, Outlet } from '@tanstack/react-router';

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
 * own that landmark (§7.1).
 *
 * The WCAG 2.4.1 bypass past that repeated header is `SiteNavigation`'s own,
 * and not this layout's. It briefly was this layout's, on the reasoning that
 * putting it in the shared component was a change to networkcanvas.com and
 * the documentation site too; that change has since been made and reviewed
 * against all three. The header's skip link defaults to
 * `SITE_NAVIGATION_SKIP_TARGET_ID`, which is the same `main-content` the site
 * screens already carry, so the two halves of the contract meet without this
 * layout in the middle — and a second bypass here would put two links with
 * one name and one target in front of every visitor.
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

export default function SiteLayout() {
  return (
    <div className="flex min-h-full flex-col">
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
