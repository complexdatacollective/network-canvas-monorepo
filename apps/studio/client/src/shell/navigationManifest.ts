import {
  ArrowLeft,
  BookMarked,
  CalendarClock,
  ClipboardList,
  CreditCard,
  Download,
  FilePen,
  FileStack,
  GitBranch,
  Image,
  KeyRound,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  LibraryBig,
  Megaphone,
  Play,
  ScrollText,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';

import type { StudyCounts } from '@codaco/studio-rpc';

/**
 * Studio's navigation, declared once as data (everything-bar design §5.2).
 *
 * Every researcher-facing destination the shell offers is an entry here, and
 * both consumers read this one list: `shell/ManifestNav.tsx` renders an area's
 * entries as its sidebar, `AppHeader` renders the platform entries as header
 * links, and the everything bar's `go-to` provider searches the union of every
 * manifest the researcher can reach. Parity is therefore structural rather than
 * maintained by hand — a destination cannot exist in the sidebar and not in the
 * bar, because adding one means adding an entry here.
 *
 * What is deliberately NOT here yet: the `access` capability and `topology`
 * fields §5.2 requires. Studio has no capability vocabulary to type them
 * against — the team area asks Better Auth for a role, and deployment gating
 * goes through `@codaco/studio-rpc/surfaces` — so the two gates that exist
 * today are passed in as context (`canManageTeam`, `billingUnavailableReason`)
 * instead of declared per entry. They become entry fields with #1257's
 * capability model, and the filter below is the one place that has to change.
 */

export type NavManifestArea =
  | 'account'
  | 'editor'
  | 'platform'
  | 'study'
  | 'team';

/**
 * A destination's router link, as data.
 *
 * `to` carries the route pattern and `params` its values, exactly as each
 * sidebar used to spell them inline, so the router keeps building the href and
 * deciding activeness rather than this module doing either. `href` on the entry
 * is the same destination already interpolated, which is what a `NavItem` needs
 * for its `href` and what the everything bar activates.
 */
export type NavManifestLink = {
  to: string;
  params?: Record<string, string>;
  /**
   * Passed through to the router. Set where a destination's own path is a
   * prefix of the routes beneath it — without it the router marks the parent
   * current on every child, and two rows carry `aria-current="page"`.
   */
  activeOptions?: { exact: boolean };
};

export type NavManifestEntry = {
  /**
   * Unique across the manifest and RESOURCE-SCOPED (§5.1): `study:st_42:waves`,
   * never `study:waves`. A context-relative id would silently retarget a
   * persisted recent to whichever study happened to be open when it was
   * resolved.
   */
  id: string;
  /** The destination's name, as one whole translated string. */
  label: string;
  /**
   * The glyph, shared by the sidebar row and the bar result, so a destination
   * looks the same in both.
   */
  icon: LucideIcon;
  /**
   * How many things are at the destination, where the entry's area knows. Only
   * the sidebar renders it — `NavItem` puts it inside the link, so it joins the
   * label in the row's accessible name — and the everything bar ignores it: a
   * result is a place to go, and a number beside one would go stale in the
   * recents the bar persists.
   *
   * `undefined` is NOT zero, and the difference is the point: an area whose
   * count has not arrived yet, or whose query failed, leaves this unset and the
   * row renders without a number. `NavItem` drops a zero of its own accord, so
   * a real empty destination and an unanswered one look the same — which is
   * correct, because an invented 0 would be a claim nobody has checked.
   */
  count?: number;
  /** The interpolated destination. */
  href: string;
  link: NavManifestLink;
  area: NavManifestArea;
  /** The bar's secondary line: which area this destination belongs to. */
  context: string;
  /** Whether a committed pathname is inside this destination. */
  isCurrent: (pathname: string) => boolean;
  /** The sidebar group heading this row sits under, where its area groups rows. */
  group?: string;
  /** Extra classes for the sidebar row — the rules the study area draws. */
  className?: string;
  /**
   * Why this deployment does not have the destination at all — billing on a
   * self-hosted instance. The sidebar renders such a row as explained text
   * rather than a link, and the everything bar omits it entirely: a result the
   * researcher cannot activate is worse than no result.
   */
  unavailableReason?: string;
  /**
   * A way BACK to a destination another area already declares, rather than a
   * destination of its own — the editor outline's "Back to study". The sidebar
   * renders it; the bar does not, because the entry it points at is already
   * there under its own name. `navigationManifestIsWellFormed` asserts every
   * one of these points at an href some ordinary entry declares, so this can
   * never become a hole in the parity guarantee.
   */
  reentry?: true;
};

/** The platform destinations the header renders (§5.2, "no manifest-less chrome"). */
export function platformDestinations(): NavManifestEntry[] {
  return [
    {
      id: 'platform:gallery',
      label: 'Gallery',
      icon: LibraryBig,
      href: '/gallery',
      // A template's own route sits beneath this path, and it is a destination
      // of the gallery rather than the gallery itself.
      link: { to: '/gallery', activeOptions: { exact: true } },
      area: 'platform',
      context: 'Platform',
      isCurrent: (pathname) => pathname === '/gallery',
    },
    {
      id: 'platform:templates',
      label: 'Templates',
      icon: LayoutTemplate,
      href: '/templates',
      link: { to: '/templates', activeOptions: { exact: true } },
      area: 'platform',
      context: 'Platform',
      isCurrent: (pathname) => pathname === '/templates',
    },
  ];
}

/** The account area's sidebar (§5.5). */
export function accountDestinations(): NavManifestEntry[] {
  return [
    {
      id: 'account:profile',
      label: 'Profile',
      icon: UserRound,
      href: '/account',
      link: { to: '/account', activeOptions: { exact: true } },
      area: 'account',
      context: 'Account',
      isCurrent: (pathname) => pathname === '/account',
    },
    {
      id: 'account:language',
      label: 'Language',
      icon: Languages,
      href: '/account/language',
      link: { to: '/account/language' },
      area: 'account',
      context: 'Account',
      isCurrent: (pathname) => pathname === '/account/language',
    },
    {
      id: 'account:sign-in-methods',
      label: 'Sign-in methods',
      icon: ShieldCheck,
      href: '/account/sign-in-methods',
      link: { to: '/account/sign-in-methods' },
      area: 'account',
      context: 'Account',
      isCurrent: (pathname) => pathname === '/account/sign-in-methods',
    },
    {
      // No count, unlike the design's own account sidebar. An API token is
      // owned by a TEAM and answerable to a custodian (the decision on #1288,
      // and `api_tokens` has no user column to scope by), so "how many are
      // mine" is a question the data model cannot answer. The account area is
      // per-researcher and spans every team they belong to, and a number that
      // silently meant "this team's tokens" would be the wrong answer rather
      // than a missing one.
      id: 'account:tokens',
      label: 'API tokens',
      icon: KeyRound,
      href: '/account/tokens',
      link: { to: '/account/tokens' },
      area: 'account',
      context: 'Account',
      isCurrent: (pathname) => pathname === '/account/tokens',
    },
  ];
}

export type TeamManifestContext = {
  teamId: string;
  /**
   * Whether the researcher administers the team. Activity is offered to owners
   * and admins only — the courtesy §11.4 describes, not the check: the
   * procedure behind it refuses everyone else.
   */
  canManageTeam: boolean;
  /**
   * Why this deployment does not have billing, or `undefined` when it has —
   * `useBillingUnavailableReason` in `lib/deployment.ts`. The reason is
   * carried rather than derived from a flag because there are two of them,
   * and a self-hosted instance's absence and a managed deployment's
   * unconfigured one are different things to say (§10.3, §10.4).
   */
  billingUnavailableReason: string | undefined;
};

/** The team area's sidebar (§5.5): the six destinations, in order. */
export function teamDestinations({
  teamId,
  canManageTeam,
  billingUnavailableReason,
}: TeamManifestContext): NavManifestEntry[] {
  const team = `/team/${teamId}`;

  return [
    {
      id: `team:${teamId}:studies`,
      label: 'Studies',
      icon: Library,
      href: team,
      link: {
        to: '/team/$teamId',
        params: { teamId },
        activeOptions: { exact: true },
      },
      area: 'team',
      context: 'Team',
      isCurrent: (pathname) => pathname === team,
    },
    {
      id: `team:${teamId}:members`,
      label: 'Members',
      icon: Users,
      href: `${team}/members`,
      link: { to: '/team/$teamId/members', params: { teamId } },
      area: 'team',
      context: 'Team',
      isCurrent: (pathname) => pathname === `${team}/members`,
    },
    {
      id: `team:${teamId}:roles`,
      label: 'Roles',
      icon: ShieldCheck,
      href: `${team}/roles`,
      link: { to: '/team/$teamId/roles', params: { teamId } },
      area: 'team',
      context: 'Team',
      isCurrent: (pathname) => pathname === `${team}/roles`,
    },
    ...(canManageTeam
      ? [
          {
            id: `team:${teamId}:activity`,
            label: 'Activity',
            icon: ScrollText,
            href: `${team}/activity`,
            link: { to: '/team/$teamId/activity', params: { teamId } },
            area: 'team' as const,
            context: 'Team',
            isCurrent: (pathname: string) => pathname === `${team}/activity`,
          },
        ]
      : []),
    {
      id: `team:${teamId}:billing`,
      label: 'Billing',
      icon: CreditCard,
      href: `${team}/billing`,
      link: { to: '/team/$teamId/billing', params: { teamId } },
      area: 'team',
      context: 'Team',
      isCurrent: (pathname) => pathname === `${team}/billing`,
      ...(billingUnavailableReason === undefined
        ? {}
        : { unavailableReason: billingUnavailableReason }),
    },
    {
      id: `team:${teamId}:settings`,
      label: 'Settings',
      icon: Settings,
      href: `${team}/settings`,
      link: { to: '/team/$teamId/settings', params: { teamId } },
      area: 'team',
      context: 'Team',
      // The integration screens — API, webhooks, messaging — are settings pages
      // rather than sidebar destinations of their own (§5.5), so this row stays
      // current inside them.
      isCurrent: (pathname) => pathname.startsWith(`${team}/settings`),
    },
  ];
}

/**
 * The study area's sidebar (§5.5), grouped by the study's lifecycle: design the
 * protocol, collect with it, then take the data out. Overview sits above the
 * groups because it is the study itself, and Study settings below them because
 * configuration is not part of that sequence.
 *
 * `counts` carries the four countable destinations' numbers (`studies.counts`),
 * and is optional because the everything bar builds this list too and has no
 * business fetching them — see `count` on `NavManifestEntry`. Omit it and every
 * row renders exactly as it did before the numbers existed.
 */
export function studyDestinations(
  studyId: string,
  counts?: StudyCounts,
): NavManifestEntry[] {
  const study = `/study/${studyId}`;

  return [
    {
      id: `study:${studyId}:overview`,
      label: 'Overview',
      icon: LayoutDashboard,
      href: study,
      link: {
        to: '/study/$studyId',
        params: { studyId },
        activeOptions: { exact: true },
      },
      area: 'study',
      context: 'Study',
      isCurrent: (pathname) => pathname === study,
    },
    {
      id: `study:${studyId}:editor`,
      label: 'Editor',
      icon: FilePen,
      href: `${study}/editor`,
      link: { to: '/study/$studyId/editor', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Design',
      isCurrent: (pathname) => pathname === `${study}/editor`,
    },
    {
      id: `study:${studyId}:versions`,
      label: 'Versions',
      icon: GitBranch,
      // The published versions of this study's protocol line, which is what
      // the Versions screen lists — not the draft being edited next door.
      count: counts?.versions,
      href: `${study}/versions`,
      link: { to: '/study/$studyId/versions', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Design',
      isCurrent: (pathname) => pathname === `${study}/versions`,
    },
    {
      id: `study:${studyId}:participants`,
      label: 'Participants',
      icon: Users,
      count: counts?.participants,
      href: `${study}/participants`,
      link: { to: '/study/$studyId/participants', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Collect',
      isCurrent: (pathname) => pathname === `${study}/participants`,
    },
    {
      id: `study:${studyId}:waves`,
      label: 'Waves',
      icon: Waves,
      count: counts?.waves,
      href: `${study}/waves`,
      link: { to: '/study/$studyId/waves', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Collect',
      isCurrent: (pathname) => pathname === `${study}/waves`,
    },
    {
      id: `study:${studyId}:sessions`,
      label: 'Sessions',
      icon: ClipboardList,
      count: counts?.sessions,
      href: `${study}/sessions`,
      link: { to: '/study/$studyId/sessions', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Collect',
      // The session detail route is a destination of this one, so the row stays
      // current while a researcher is inside a session.
      isCurrent: (pathname) => pathname.startsWith(`${study}/sessions`),
    },
    {
      id: `study:${studyId}:schedule`,
      label: 'Schedule',
      icon: CalendarClock,
      href: `${study}/schedule`,
      link: { to: '/study/$studyId/schedule', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Collect',
      isCurrent: (pathname) => pathname === `${study}/schedule`,
    },
    {
      id: `study:${studyId}:recruitment`,
      label: 'Recruitment',
      icon: Megaphone,
      href: `${study}/recruitment`,
      link: { to: '/study/$studyId/recruitment', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Collect',
      isCurrent: (pathname) => pathname === `${study}/recruitment`,
    },
    {
      // One item, deliberately (§5.5): export is what follows collection, and
      // #1324's siblings — archive, deposit — join this group rather than
      // forcing a regrouping later.
      id: `study:${studyId}:export`,
      label: 'Export',
      icon: Download,
      href: `${study}/export`,
      link: { to: '/study/$studyId/export', params: { studyId } },
      area: 'study',
      context: 'Study',
      group: 'Data',
      isCurrent: (pathname) => pathname === `${study}/export`,
    },
    {
      id: `study:${studyId}:settings`,
      label: 'Study settings',
      icon: Settings,
      href: `${study}/settings`,
      link: { to: '/study/$studyId/settings', params: { studyId } },
      area: 'study',
      context: 'Study',
      // The rule §5.5 draws above this row: configuration, below the work.
      className: 'border-surface-2 border-t pt-4',
      isCurrent: (pathname) => pathname === `${study}/settings`,
    },
  ];
}

/**
 * The protocol editor's outline (§5.5). It REPLACES the study sidebar rather
 * than sitting beside it, which the route tree — not this list — is what makes
 * true.
 *
 * The outline #1272 specifies also lists the protocol's ordered stages, each
 * addressed by `/editor/stages/$stageId`. Those come from the draft, which the
 * shell does not fetch, so what is declared here is the outline's fixed
 * destinations — the ones that exist whatever the protocol contains.
 */
export function editorDestinations(studyId: string): NavManifestEntry[] {
  const study = `/study/${studyId}`;
  const editor = `${study}/editor`;

  return [
    {
      // "Back to study" is the first row because the editor is the one screen a
      // researcher can be inside for hours with nothing else on it (§5.5); the
      // way out has to be where they will look for it.
      id: `study:${studyId}:editor:back`,
      label: 'Back to study',
      icon: ArrowLeft,
      href: study,
      link: {
        to: '/study/$studyId',
        params: { studyId },
        activeOptions: { exact: true },
      },
      area: 'editor',
      context: 'Protocol',
      className: 'border-surface-2 mb-1 border-b pb-1',
      isCurrent: () => false,
      reentry: true,
    },
    {
      id: `study:${studyId}:editor:codebook`,
      label: 'Codebook',
      icon: BookMarked,
      href: `${editor}/codebook`,
      link: { to: '/study/$studyId/editor/codebook', params: { studyId } },
      area: 'editor',
      context: 'Protocol',
      isCurrent: (pathname) => pathname === `${editor}/codebook`,
    },
    {
      id: `study:${studyId}:editor:stages`,
      label: 'Stages',
      icon: FileStack,
      href: editor,
      link: {
        to: '/study/$studyId/editor',
        params: { studyId },
        activeOptions: { exact: true },
      },
      area: 'editor',
      context: 'Protocol',
      // A stage's own route is a destination of this one, so the row stays
      // current while a stage is being edited.
      isCurrent: (pathname) =>
        pathname === editor || pathname.startsWith(`${editor}/stages`),
    },
    {
      id: `study:${studyId}:editor:assets`,
      label: 'Assets',
      icon: Image,
      href: `${editor}/assets`,
      link: { to: '/study/$studyId/editor/assets', params: { studyId } },
      area: 'editor',
      context: 'Protocol',
      isCurrent: (pathname) => pathname === `${editor}/assets`,
    },
    {
      id: `study:${studyId}:editor:translations`,
      label: 'Translations',
      icon: Languages,
      href: `${editor}/translations`,
      link: { to: '/study/$studyId/editor/translations', params: { studyId } },
      area: 'editor',
      context: 'Protocol',
      isCurrent: (pathname) => pathname === `${editor}/translations`,
    },
    {
      id: `study:${studyId}:editor:preview`,
      label: 'Preview',
      icon: Play,
      href: `${editor}/preview`,
      link: { to: '/study/$studyId/editor/preview', params: { studyId } },
      area: 'editor',
      context: 'Protocol',
      isCurrent: (pathname) => pathname === `${editor}/preview`,
    },
  ];
}

export type NavManifestContext = {
  /**
   * The team the researcher is acting in, from the URL where a route names one
   * and from the active-team setting otherwise. Absent only while no team is
   * known at all, in which case there is no team administration to search.
   */
  teamId?: string;
  /** The study the URL names, if any. */
  studyId?: string;
  canManageTeam: boolean;
  billingUnavailableReason: string | undefined;
};

/**
 * Every destination the researcher can currently reach, across areas — which is
 * the fundamental requirement at work: from a study screen, typing "activity"
 * has to find the team's activity log.
 *
 * Only the study and editor manifests are conditional, because a study's
 * destinations need the study in the URL. Entities from OTHER studies and teams
 * are the entity provider's job (§5.4) and arrive with the server procedure
 * behind it; this is the destination half.
 */
export function navigationManifest({
  teamId,
  studyId,
  canManageTeam,
  billingUnavailableReason,
}: NavManifestContext): NavManifestEntry[] {
  return [
    ...(studyId === undefined ? [] : studyDestinations(studyId)),
    ...(studyId === undefined ? [] : editorDestinations(studyId)),
    ...(teamId === undefined
      ? []
      : teamDestinations({ teamId, canManageTeam, billingUnavailableReason })),
    ...accountDestinations(),
    ...platformDestinations(),
  ];
}

/**
 * Which area a committed pathname is in, so the bar can rank the researcher's
 * current context first (§3.4). Order matters: the editor's routes sit beneath
 * the study's, and only the editor branch mounts the outline.
 */
export function currentAreaFor(pathname: string): NavManifestArea | undefined {
  if (/^\/study\/[^/]+\/editor(\/|$)/.test(pathname)) return 'editor';
  if (pathname.startsWith('/study/')) return 'study';
  if (pathname.startsWith('/team/')) return 'team';
  if (pathname === '/account' || pathname.startsWith('/account/')) {
    return 'account';
  }
  if (pathname.startsWith('/gallery') || pathname.startsWith('/templates')) {
    return 'platform';
  }
  return undefined;
}
