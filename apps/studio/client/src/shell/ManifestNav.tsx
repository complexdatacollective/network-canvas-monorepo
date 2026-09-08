import { Link, useRouterState } from '@tanstack/react-router';
import { Fragment } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList, { NavListGroup } from '@codaco/fresco-ui/navigation/NavList';

import type { NavManifestEntry } from './navigationManifest.ts';

/**
 * An area's sidebar, rendered from its slice of the navigation manifest.
 *
 * This is the manifest's other reader: the everything bar's `go-to` provider
 * searches the same entries this renders, so a destination cannot appear in one
 * and not the other (everything-bar design §5.2, invariant 1). It is also why
 * the four area layouts hold no destination data of their own any more — they
 * supply their `<nav>`'s name and the context their entries need, and nothing
 * else.
 *
 * Consecutive entries carrying the same `group` become one `NavListGroup`;
 * entries without one are ordinary rows, which `NavList` collects into lists of
 * their own. Order is exactly manifest order. Labels and headings arrive as
 * message descriptors and are resolved here, at render, so the sidebar follows
 * a locale change live.
 */
export default function ManifestNav({
  entries,
}: {
  entries: NavManifestEntry[];
}) {
  const intl = useAppIntl();
  const pathname = useRouterState({
    // The COMMITTED location. Active state and the drawer's close both derive
    // from it — never from a pending navigation, which a blocker may still
    // cancel (§6.5, §7.3).
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });

  return (
    <NavList>
      {groupRuns(entries).map((run) =>
        run.heading === undefined ? (
          <Fragment key={run.key}>
            {run.entries.map((entry) => (
              <ManifestNavItem
                key={entry.id}
                entry={entry}
                pathname={pathname}
              />
            ))}
          </Fragment>
        ) : (
          <NavListGroup key={run.key} heading={intl.formatMessage(run.heading)}>
            {run.entries.map((entry) => (
              <ManifestNavItem
                key={entry.id}
                entry={entry}
                pathname={pathname}
              />
            ))}
          </NavListGroup>
        ),
      )}
    </NavList>
  );
}

type GroupRun = {
  key: string;
  heading: MessageDescriptor | undefined;
  entries: NavManifestEntry[];
};

/**
 * Adjacent entries sharing a `group`, in manifest order. Sameness is the
 * descriptor's id — the stable identity a heading keeps across locales.
 */
function groupRuns(entries: NavManifestEntry[]): GroupRun[] {
  const runs: GroupRun[] = [];

  for (const entry of entries) {
    const last = runs.at(-1);
    if (last && last.heading?.id === entry.group?.id) {
      last.entries.push(entry);
      continue;
    }
    runs.push({ key: entry.id, heading: entry.group, entries: [entry] });
  }

  return runs;
}

function ManifestNavItem({
  entry,
  pathname,
}: {
  entry: NavManifestEntry;
  pathname: string;
}) {
  const intl = useAppIntl();

  if (entry.unavailableReason !== undefined) {
    // A destination this deployment does not have is shown and explained, never
    // linked: the researcher can see it exists as a Studio feature and that it
    // is not here, and cannot be sent to a URL this deployment 404s. No count
    // either — `NavItem` ignores one on an unavailable row, and a place that is
    // not here has nothing to count.
    return (
      <NavItem
        className={entry.className}
        href={entry.href}
        label={intl.formatMessage(entry.label)}
        icon={entry.icon}
        disabled
        unavailableReason={intl.formatMessage(entry.unavailableReason)}
      />
    );
  }

  return (
    <NavItem
      className={entry.className}
      href={entry.href}
      label={intl.formatMessage(entry.label)}
      icon={entry.icon}
      // Undefined until the area has the number, which is what keeps a row
      // that is still loading — or whose query failed — free of an invented 0.
      count={entry.count}
      current={entry.isCurrent(pathname)}
      renderLink={(props) => (
        <Link
          to={entry.link.to}
          params={entry.link.params}
          activeOptions={entry.link.activeOptions}
          className={props.className}
          // The router's own activeness is what reaches the DOM: it is applied
          // after the props passed here, and the row's styling reads the
          // attribute. `activeOptions` on the entry is what keeps a parent
          // destination from claiming `aria-current="page"` on every child.
          aria-current={props['aria-current']}
        >
          {props.children}
        </Link>
      )}
    />
  );
}
