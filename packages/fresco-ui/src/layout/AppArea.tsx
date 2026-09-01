'use client';

import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { IconButton } from '../Button';
import NavDrawer from '../navigation/NavDrawer';
import { cx } from '../utils/cva';
import { DEFAULT_SKIP_TARGET_ID } from './AppFrame';

/**
 * The `<main>` an area renders, whether or not it has a sidebar. Stated once so
 * the two branches below cannot drift into different scroll or sizing
 * behaviour.
 */
const MAIN_CLASSES = 'min-h-0 min-w-0 flex-1 overflow-auto';

export type AppAreaNavigation = {
  /**
   * The region's name, as one whole translated string, drawn from the host's
   * own vocabulary — Studio's is the closed set {Study, Team, Account, Protocol
   * outline}. It names the `<nav>` landmark, names the drawer, and is the name
   * shown beside the drawer trigger on a narrow container.
   */
  label: string;
  /** The region's destinations — a `NavList`. */
  content: ReactNode;
  /**
   * The drawer trigger's whole translated label ("Open study navigation"). A
   * whole string rather than a name assembled around `label`, because a
   * template built from English word order does not survive translation.
   */
  openLabel: string;
  /** The drawer's close control's whole translated label. */
  closeLabel: string;
  /** Merged onto the wide-container `<nav>`. */
  className?: string;
};

export type AppAreaProps = {
  /**
   * The area's navigation region. Omitted for an area that has no sidebar —
   * Studio's gallery and templates — which then renders `<main>` alone, with no
   * area bar and no `<nav>`. There is nothing to open, so there is no trigger.
   */
  navigation?: AppAreaNavigation;
  /**
   * The host router's current, committed location, forwarded to `NavDrawer`: a
   * change to it is what closes the drawer, and only a committed navigation
   * changes it.
   *
   * Required even for an area with no sidebar, where nothing reads it. The
   * alternative — optional, and silently ignored when a sidebar area forgets it
   * — trades a prop a host already has in hand for a drawer that never closes,
   * and nothing would report the mistake.
   */
  location: string;
  /** The area's content — in a routed host, the router's outlet. */
  children: ReactNode;
  /**
   * The `<main>`'s `id`. Defaults to the id `AppFrame`'s skip link targets, and
   * imported from there rather than repeated, because the link and the landmark
   * are rendered by different components. A host that changes one must change
   * the other.
   */
  mainId?: string;
  /** Merged onto the area's root element. */
  className?: string;
};

/**
 * One area's frame: its navigation region, in whichever presentation the
 * available width calls for, and the `<main>` that region labels.
 *
 * ```tsx
 * <AppArea
 *   location={pathname}
 *   navigation={{
 *     label: t('study'),
 *     openLabel: t('openStudyNavigation'),
 *     closeLabel: t('closeStudyNavigation'),
 *     content: <NavList>…</NavList>,
 *   }}
 * >
 *   <Outlet />
 * </AppArea>
 * ```
 *
 * Rendered by the AREA layout, not by the app layout, because an area's sidebar
 * and the `<main>` it labels replace each other wholesale when the researcher
 * moves between areas: a study's sidebar and the editor's outline are siblings,
 * not one nested inside the other. `AppFrame` renders neither landmark for the
 * same reason.
 *
 * **Wide container**: the labelled `<nav>` beside `<main>`.
 * **Narrow container**: an area bar — the drawer trigger and the area's name —
 * as the first element of the region, with the `NavDrawer` beside it. The
 * trigger belongs to the area because the sidebar does; putting it in the app
 * header would require a descendant to publish upward into an ancestor's
 * render.
 *
 * Which of the two is a CONTAINER query, against the `app-area` container
 * `AppFrame` establishes on the region it renders areas into — never a viewport
 * breakpoint. The area then answers to the width it is actually given, which is
 * what lets `AppFrame`'s leading rail be adopted later without touching a
 * single area layout. Rendered outside a host that declares that container, no
 * query matches and the area stays in its narrow presentation: the safe
 * direction, because the drawer reaches every destination the sidebar does.
 *
 * Both presentations of the region are in the DOM at every width, and CSS
 * decides which one exists — so exactly one of them is in the accessibility
 * tree and in the tab order at a time, and neither has to be measured in
 * JavaScript before it can be rendered.
 */
const AppArea = ({
  navigation,
  location,
  children,
  mainId = DEFAULT_SKIP_TARGET_ID,
  className,
}: AppAreaProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!navigation) {
    return (
      <main id={mainId} className={cx(MAIN_CLASSES, className)}>
        {children}
      </main>
    );
  }

  return (
    <div
      className={cx(
        'flex min-h-0 min-w-0 flex-col @min-[48rem]/app-area:flex-row',
        className,
      )}
    >
      {/*
        The area bar, first in the region and directly beneath the app header.
        `hidden` on a wide container rather than merely visually suppressed, so
        the trigger for a drawer nobody can reach is out of the tab order and
        out of the accessibility tree too.
      */}
      <div className="border-surface-2 flex shrink-0 items-center gap-2 border-b px-2 py-2 @min-[48rem]/app-area:hidden">
        <IconButton
          size="sm"
          variant="text"
          icon={<Menu aria-hidden className="size-5" />}
          aria-label={navigation.openLabel}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        />
        <span className="font-heading min-w-0 text-sm font-bold">
          {navigation.label}
        </span>
      </div>
      <nav
        aria-label={navigation.label}
        className={cx(
          // A width that steps up with the container rather than one fixed
          // width everywhere: `NavItem` wraps its labels instead of truncating
          // them, and they run about a third longer in German, so a region
          // with room to spare should spend some of it here.
          'border-surface-2 hidden w-60 shrink-0 flex-col overflow-y-auto border-e p-4',
          '@min-[48rem]/app-area:flex @min-[64rem]/app-area:w-72',
          navigation.className,
        )}
      >
        {navigation.content}
      </nav>
      <NavDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        location={location}
        label={navigation.label}
        closeLabel={navigation.closeLabel}
      >
        {navigation.content}
      </NavDrawer>
      <main id={mainId} className={MAIN_CLASSES}>
        {children}
      </main>
    </div>
  );
};

export default AppArea;
