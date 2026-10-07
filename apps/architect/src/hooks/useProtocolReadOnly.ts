import { createContext, useContext } from 'react';

/**
 * Whether the page on screen must offer no editing at all.
 *
 * Provided by ProtocolRouteGuard around every `/protocol` route, as
 * `useProtocolAccessMode() === 'read-only'`: true while another tab owns the
 * saved copy and nothing of this tab's is held open over the page. A control
 * that edits — adds, deletes, reorders, renames, imports, opens an editor,
 * undoes — is disabled (or, where it only appears on hover or exists only to
 * edit, not drawn) while it is true. Controls that only read — navigation,
 * search, filters, preview, print, download — ignore it.
 *
 * Deliberately narrower than "this tab cannot save" (`mode !== 'editable'`).
 * In the two held modes the work on screen is the researcher's and has to stay
 * operable until they decide what to do with it; the controls that would
 * commit it already refuse to (`StageEditorNav`, `useRefusedNestedCommit`), and
 * a held nested editor makes the page behind it inert. Those modes end in this
 * one as soon as the editor holding them closes.
 *
 * Outside the guard nothing is read-only, which keeps a component rendered on
 * its own (a story, a unit test) editable. The persistence gate
 * (`getProtocolOwnedHere`) is still the backstop: a control this misses has its
 * write dropped rather than saved.
 */
export const ProtocolReadOnlyContext = createContext(false);

export const useProtocolReadOnly = () => useContext(ProtocolReadOnlyContext);
