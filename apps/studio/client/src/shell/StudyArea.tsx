import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  CalendarClock,
  ClipboardList,
  Download,
  FilePen,
  GitBranch,
  LayoutDashboard,
  Megaphone,
  Settings,
  Users,
  Waves,
} from 'lucide-react';

import AppArea from '@codaco/fresco-ui/layout/AppArea';
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList, { NavListGroup } from '@codaco/fresco-ui/navigation/NavList';

/**
 * The study area layout: the study sidebar and the `<main>` it labels (§5.3).
 *
 * The study is where a researcher works, so this is the sidebar they spend
 * their time in. Its grouping is the study's lifecycle rather than decoration
 * (§5.5): design the protocol, collect with it, then take the data out.
 * Overview sits above the groups because it is the study itself, and Study
 * settings below them because configuration is not part of that sequence.
 *
 * It is a sibling of the editor's area, not its parent — see `studyRoute` in
 * `router.tsx`. The editor's outline REPLACES this sidebar rather than
 * rendering beside it, which is only true while the two areas are siblings.
 *
 * Counts belong on the countable destinations — participants, waves, sessions,
 * versions (§5.5) — and are absent here because they come from `study.shell`,
 * which this slice does not fetch. A count is decoration for a number nobody
 * has; inventing one would be worse than the empty row.
 */
export default function StudyArea({ studyId }: { studyId: string }) {
  const pathname = useRouterState({
    // The COMMITTED location: a blocker may still cancel a pending one
    // (§6.5, §7.3).
    select: (state) => state.location.pathname,
  });

  const study = `/study/${studyId}`;

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Study',
        openLabel: 'Open study navigation',
        closeLabel: 'Close study navigation',
        content: (
          <NavList>
            <NavItem
              href={study}
              label="Overview"
              icon={LayoutDashboard}
              current={pathname === study}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId"
                  params={{ studyId }}
                  // Without this the study's own path matches every route
                  // beneath it as a prefix, and the router would mark
                  // Overview active on Participants too — a second
                  // `aria-current="page"`. The router's own activeness is
                  // what reaches the DOM: it is applied after the props
                  // passed here, and the row's styling reads the attribute.
                  activeOptions={{ exact: true }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavListGroup heading="Design">
              <NavItem
                href={`${study}/editor`}
                label="Editor"
                icon={FilePen}
                current={pathname === `${study}/editor`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/editor"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
              <NavItem
                href={`${study}/versions`}
                label="Versions"
                icon={GitBranch}
                current={pathname === `${study}/versions`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/versions"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
            </NavListGroup>
            <NavListGroup heading="Collect">
              <NavItem
                href={`${study}/participants`}
                label="Participants"
                icon={Users}
                current={pathname === `${study}/participants`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/participants"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
              <NavItem
                href={`${study}/waves`}
                label="Waves"
                icon={Waves}
                current={pathname === `${study}/waves`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/waves"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
              <NavItem
                href={`${study}/sessions`}
                label="Sessions"
                icon={ClipboardList}
                // The session detail route is a destination of this one, so
                // the row stays current while a researcher is inside a
                // session (§11.1 counts it as a detail route, not a
                // destination of its own).
                current={pathname.startsWith(`${study}/sessions`)}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/sessions"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
              <NavItem
                href={`${study}/schedule`}
                label="Schedule"
                icon={CalendarClock}
                current={pathname === `${study}/schedule`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/schedule"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
              <NavItem
                href={`${study}/recruitment`}
                label="Recruitment"
                icon={Megaphone}
                current={pathname === `${study}/recruitment`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/recruitment"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
            </NavListGroup>
            {/*
              One item, deliberately (§5.5): export is what follows
              collection, and #1324's siblings — archive, deposit — join this
              group rather than forcing a regrouping later.
            */}
            <NavListGroup heading="Data">
              <NavItem
                href={`${study}/export`}
                label="Export"
                icon={Download}
                current={pathname === `${study}/export`}
                renderLink={(props) => (
                  <Link
                    to="/study/$studyId/export"
                    params={{ studyId }}
                    className={props.className}
                    aria-current={props['aria-current']}
                  >
                    {props.children}
                  </Link>
                )}
              />
            </NavListGroup>
            <NavItem
              // The rule §5.5 draws above this row: configuration, below the
              // work.
              className="border-surface-2 border-t pt-4"
              href={`${study}/settings`}
              label="Study settings"
              icon={Settings}
              current={pathname === `${study}/settings`}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId/settings"
                  params={{ studyId }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
          </NavList>
        ),
      }}
    >
      <Outlet />
    </AppArea>
  );
}
