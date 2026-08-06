import type { RefObject } from 'react';

import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';

/**
 * Publishes a `DialogForm`'s dirty flag to its owner.
 *
 * `DialogForm` mounts the form store itself, so a Cancel handler that lives
 * outside it (the unsaved-changes guard) cannot call `useFormMeta`. Rendering
 * this among the dialog's children mirrors the flag into a ref the owner can
 * read at dismiss time.
 */
const DirtyProbe = ({ dirtyRef }: { dirtyRef: RefObject<boolean> }) => {
  const { isDirty } = useFormMeta();
  dirtyRef.current = isDirty;
  return null;
};

export default DirtyProbe;
