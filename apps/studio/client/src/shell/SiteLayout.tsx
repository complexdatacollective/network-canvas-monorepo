import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';

import { buttonVariants } from '@codaco/fresco-ui/Button';
import SiteFooter from '@codaco/fresco-ui/navigation/SiteFooter';
import type {
  SiteFooterLink,
  SiteFooterSocialLink,
} from '@codaco/fresco-ui/navigation/SiteFooter';
import SiteNavigation from '@codaco/fresco-ui/navigation/SiteNavigation';
import type {
  SiteNavigationLinkRenderProps,
  SiteNavigationUtilityRenderProps,
} from '@codaco/fresco-ui/navigation/SiteNavigation';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  useLandingDestination,
  type LandingDestination,
} from '../lib/landing.ts';
import { sessionQueryOptions, useSessionRevalidation } from '../lib/session.ts';

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
 * There is no app header here and no session GUARD: a visitor who has never
 * signed in is the expected reader, and nothing on this branch may refuse
 * them. Each site screen renders its own `<main id="main-content">`, because
 * the site branch has no area layout to own that landmark (§7.1).
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

/**
 * The Studio entry, styled as the header's other pill so it reads as one of
 * its controls rather than as page content that has drifted upward.
 */
const ENTRY_CLASSES = cx(
  buttonVariants({ variant: 'outline', color: 'primary', size: 'sm' }),
  'rounded-full no-underline',
  headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
);

/**
 * The site header's way into Studio (§10.1).
 *
 * Every destination `SiteNavigation` owns is another Network Canvas site, so
 * without this the persistent header on `/pricing` and `/legal/*` offers no
 * way into the product whose pages they are — and no way to sign in. Only
 * `/` carries those, in its own body copy, which is no use to a reader of the
 * terms.
 *
 * **The utility slot, not the shared item set.** §10.1 reserves a canonical
 * Studio destination in `SiteNavigationItemId`, and that is a different
 * thing: it is one absolute URL, the same for every site that renders this
 * header, and the shared component has no session with which to vary it.
 * What belongs to a reader of THIS deployment's pages does vary, which is
 * what `renderUtility` — the component's one sanctioned app-owned slot —
 * exists for. It is rendered in both the desktop bar and the compact menu, so
 * supplying it is what covers a narrow viewport too.
 *
 * **Where a signed-in researcher belongs is §6.4's landing destination**, not
 * `/`: under `managed` that is marketing, and under `self-hosted` a redirect
 * (§10.4). The entry is right in both topologies and so is not mode-gated —
 * unlike the pages it appears on, which are managed-only.
 *
 * The session comes from the query every guard reads, so this is not the
 * second live channel §6.2 removed from the app shell — it is the same one,
 * asked by a component. Until it answers, and if it cannot, the entry is
 * `/sign-in`: that is the honest answer for a visitor, and it is not a dead
 * end for a researcher either, because the sign-in route's own guard resolves
 * an existing session through this same landing rule.
 */
function StudioEntry({ closeMenu, view }: SiteNavigationUtilityRenderProps) {
  const session = useQuery(sessionQueryOptions);
  const signedIn = session.data === 'signedIn';
  const landing = useLandingDestination(signedIn);
  // Only the compact menu has anything to close, exactly as the header's own
  // items decide it.
  const onClick = view === 'mobile' ? closeMenu : undefined;

  // The SESSION decides which entry this is, not the memberships. Disabling
  // the landing query does not throw away what it last resolved — a disabled
  // `useQuery` still reports its cached data — so a session that ends while
  // this page is open would otherwise keep offering the team it named.
  if (!signedIn || landing === undefined) {
    return (
      <Link className={ENTRY_CLASSES} onClick={onClick} to="/sign-in">
        Sign in
      </Link>
    );
  }
  return <StudioDestinationLink destination={landing} onClick={onClick} />;
}

/**
 * Split out because the two landing destinations take different `<Link>`
 * props, and a router link's `to` is what types its `params`.
 */
function StudioDestinationLink({
  destination,
  onClick,
}: {
  destination: LandingDestination;
  onClick: (() => void) | undefined;
}) {
  if (destination.to === '/no-team') {
    return (
      <Link className={ENTRY_CLASSES} onClick={onClick} to="/no-team">
        Go to Studio
      </Link>
    );
  }
  return (
    <Link
      className={ENTRY_CLASSES}
      onClick={onClick}
      params={destination.params}
      to="/team/$teamId"
    >
      Go to Studio
    </Link>
  );
}

export default function SiteLayout() {
  // Not a guard, and it must never become one: this branch refuses nobody.
  // But the header above reads the session, and on a managed deployment a
  // signed-in researcher can sit on `/pricing` or `/legal/*` while they sign
  // out in another tab. Nothing on a public page fails, so nothing here would
  // ever ask again — the entry into Studio would keep naming a team the
  // session no longer has, and the app guard would be handed the same cached
  // answer when it was used. `AppLayout` mounts this for the same reason on
  // the branch that does have a guard.
  useSessionRevalidation();

  return (
    <div className="flex min-h-full flex-col">
      <SiteNavigation
        locale="en-US"
        site="external"
        renderLink={renderSiteLink}
        renderUtility={(props) => <StudioEntry {...props} />}
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
