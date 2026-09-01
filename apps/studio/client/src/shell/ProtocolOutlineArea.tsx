import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  ArrowLeft,
  BookMarked,
  FileStack,
  Image,
  Languages,
  Play,
} from 'lucide-react';

import AppArea from '@codaco/fresco-ui/layout/AppArea';
import NavItem from '@codaco/fresco-ui/navigation/NavItem';
import NavList from '@codaco/fresco-ui/navigation/NavList';

/**
 * The protocol editor's area layout: the outline and the `<main>` it labels
 * (§5.3, §5.5).
 *
 * This region REPLACES the study sidebar rather than sitting beside it, which
 * is what makes the editor the full-attention screen it has to be. The
 * mechanism is the route tree, not this component: it and `StudyArea` are
 * sibling children of the component-less `studyRoute`, so exactly one of them
 * is ever matched.
 *
 * The outline #1272 specifies also lists the protocol's ordered stages, each
 * addressed by `/editor/stages/$stageId`. Those come from the draft, which
 * this slice does not fetch, so the outline here is its fixed destinations —
 * the ones that exist whatever the protocol contains.
 *
 * "Back to study" is the first row because the editor is the one screen a
 * researcher can be inside for hours with nothing else on it (§5.5); the way
 * out has to be where they will look for it.
 */
export default function ProtocolOutlineArea({ studyId }: { studyId: string }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const editor = `/study/${studyId}/editor`;

  return (
    <AppArea
      location={pathname}
      navigation={{
        label: 'Protocol outline',
        openLabel: 'Open protocol outline',
        closeLabel: 'Close protocol outline',
        content: (
          <NavList>
            <NavItem
              className="border-surface-2 mb-1 border-b pb-1"
              href={`/study/${studyId}`}
              label="Back to study"
              icon={ArrowLeft}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId"
                  params={{ studyId }}
                  // Every route in this area sits beneath the study's own
                  // path, so without this the router would mark the way out
                  // as the current page on all of them. Its activeness is
                  // applied after the props passed here, and the row's
                  // styling reads the attribute it writes.
                  activeOptions={{ exact: true }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={`${editor}/codebook`}
              label="Codebook"
              icon={BookMarked}
              current={pathname === `${editor}/codebook`}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId/editor/codebook"
                  params={{ studyId }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={editor}
              label="Stages"
              icon={FileStack}
              // A stage's own route is a destination of this one, so the row
              // stays current while a stage is being edited.
              current={
                pathname === editor || pathname.startsWith(`${editor}/stages`)
              }
              renderLink={(props) => (
                <Link
                  to="/study/$studyId/editor"
                  params={{ studyId }}
                  // Without this, the editor's path matches every route
                  // beneath it as a prefix and the router would mark Stages
                  // active on the codebook too — a second
                  // `aria-current="page"`.
                  activeOptions={{ exact: true }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={`${editor}/assets`}
              label="Assets"
              icon={Image}
              current={pathname === `${editor}/assets`}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId/editor/assets"
                  params={{ studyId }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={`${editor}/translations`}
              label="Translations"
              icon={Languages}
              current={pathname === `${editor}/translations`}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId/editor/translations"
                  params={{ studyId }}
                  className={props.className}
                  aria-current={props['aria-current']}
                >
                  {props.children}
                </Link>
              )}
            />
            <NavItem
              href={`${editor}/preview`}
              label="Preview"
              icon={Play}
              current={pathname === `${editor}/preview`}
              renderLink={(props) => (
                <Link
                  to="/study/$studyId/editor/preview"
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
