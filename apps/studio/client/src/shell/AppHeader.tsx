import { Link } from '@tanstack/react-router';

import AccountMenu from './AccountMenu.tsx';
import TeamSwitcher from './TeamSwitcher.tsx';

/**
 * The application header's contents (§5.5). `AppFrame` renders the `<header>`
 * element itself; this is what goes inside it, and it is the same on every app
 * route.
 *
 * ## Gallery and Templates are missing on purpose
 *
 * §5.5 puts them here, between the team chip and the account menu. Neither
 * `/gallery` nor `/templates` is a route yet, and the header is constant
 * chrome: a link to an unmatched path would be a dead end on every screen in
 * the application, reached by a researcher who had no way of knowing it went
 * nowhere. In this app it is not even a soft failure — the router types
 * `Link`'s `to` against the registered tree, so the link could only be written
 * as a bare anchor, which leaves the SPA on a full document load to be told
 * the page does not exist.
 *
 * The absence is enforceable rather than remembered: adding `/gallery` and
 * `/templates` to the route tree is what makes `<Link to="/gallery">`
 * type-check, so the slice that ships those screens is the slice that can add
 * these two links, in this position.
 *
 * The same reasoning holds for the entries missing from the two menus — team
 * administration and "create a team" under the team chip, profile and language
 * under the account menu — and for the four team-sidebar destinations
 * `TeamArea` leaves out.
 */
export default function AppHeader() {
  return (
    <div className="border-surface-2 flex flex-wrap items-center gap-4 border-b px-4 py-2">
      <Link
        className="focusable font-heading rounded font-bold no-underline"
        to="/"
      >
        Studio
      </Link>
      <TeamSwitcher />
      {/* Gallery and Templates belong here — see the note above. */}
      <div className="ms-auto flex flex-wrap items-center justify-end gap-4">
        <AccountMenu />
      </div>
    </div>
  );
}
