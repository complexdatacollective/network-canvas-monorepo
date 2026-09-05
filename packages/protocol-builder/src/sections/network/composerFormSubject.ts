import { createContext, useContext } from 'react';

import type { CodebookSubject } from '../../protocol-context.ts';

/**
 * Whose attributes the form field being edited may collect.
 *
 * A network composer authors more than one form on one stage — the node
 * inspector's, and one per connection type it draws — and each of them writes
 * a different entity's attributes. A row editor is handed nothing but its own
 * row, so the entity has to reach it some other way, and it cannot be a prop:
 * the row dialog mounts a form store of its own in a portal, and the list that
 * opened it is the only thing that knows which form this is.
 *
 * `undefined` means the entity is not settled yet — a composer whose node type
 * has not been chosen — and every picker then offers nothing rather than
 * offering the wrong thing.
 */
export const ComposerFormSubjectContext = createContext<
  CodebookSubject | undefined
>(undefined);

export function useComposerFormSubject(): CodebookSubject | undefined {
  return useContext(ComposerFormSubjectContext);
}
