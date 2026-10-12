import { createContext, useContext, type ReactNode } from 'react';

/**
 * Whether what is rendering sits inside an area's `<main id="main-content">`.
 *
 * One thing reads it, and one thing is enough: the router's error component,
 * which is the only screen that can appear at any depth of the tree. When a
 * descendant of an area throws, TanStack Router replaces THAT match and leaves
 * the area layout mounted around it, so the error renders inside the `<main>`
 * the area already supplies. When the area layout itself throws, it is replaced
 * too and nothing above it renders a landmark at all. The error screen has to
 * render a `<main>` in the second case and must not in the first — two mains
 * nested is what the skip link resolves against, and it resolves to the outer
 * one (§7.1) — and this is how it tells the cases apart: by where it actually
 * is, rather than by a list of route ids that goes stale the next time a route
 * is added.
 *
 * Studio-local rather than published with `AppArea`, which is what renders the
 * landmark: the fact is only interesting to something that can be rendered
 * under an unknown ancestor, fresco-ui has no such component, and no other
 * consumer of `AppArea` has an error screen to place.
 */
const InsideAreaMain = createContext(false);

/** For a component that must know whether a `<main>` is already open above it. */
export const useInsideAreaMain = () => useContext(InsideAreaMain);

/**
 * Wraps an area layout's outlet — everything the area renders into its own
 * `<main>`. Every area layout renders it, and an area that forgot would give
 * its error states two main landmarks; `__tests__/routeErrors.test.tsx` renders
 * all four and fails if one does.
 */
export default function AreaMain({ children }: { children: ReactNode }) {
  return <InsideAreaMain value={true}>{children}</InsideAreaMain>;
}
