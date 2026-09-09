import { type ReactNode, useContext, useMemo } from 'react';

import {
  resolveFieldPath,
  useFieldNamespacePath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { ObjectPath } from '@codaco/fresco-ui/form/utils/objectPath';

import { useStageEditorForm } from '../stageEditorContext.ts';
import {
  type ArrayFieldBinding,
  ArrayFieldBindingContext,
} from './useArrayFieldCommands.ts';

const NOT_BOUND: ArrayFieldBinding = { documentPath: undefined };

/**
 * Object keys the whole way down.
 *
 * A segment that is an array INDEX — the tags of `prompts[0]` — names a
 * position rather than a place. A collaborator inserting a prompt above it
 * makes it address a different row, and every command the list issued
 * afterwards would land on that row instead.
 */
const isKeyPath = (path: ObjectPath): path is string[] =>
  path.every((segment) => typeof segment === 'string');

/**
 * Where in the stage document the list beneath this lives, for the list editor
 * to commit through.
 *
 * A list the stage document keeps at a path of its own — `prompts`, or a
 * Family Pedigree's family-member form at `nodeConfig.form` — is edited with
 * the document's own list commands, insert this row, move that one, instead of
 * being replaced wholesale. A list nested inside a ROW has no path of its own
 * that stays true, and is left as a plain form value, committed by the dialog
 * that edits the row around it.
 *
 * Rendered by the list component itself, from the name the form gave it, so a
 * section mounts a list the way it mounts any other control.
 */
export function ListBinding({
  name,
  children,
}: Readonly<{ name: string; children: ReactNode }>) {
  const { storeApi } = useStageEditorForm();
  const nearestStore = useContext(FormStoreContext);
  const namespace = useFieldNamespacePath();

  const binding = useMemo(() => {
    // A list rendered inside a row dialog belongs to that dialog's form, and
    // the row it is part of is committed as a whole when the dialog saves.
    // Writing its rows into the stage document as they change would commit
    // half of an edit the researcher can still cancel.
    if (nearestStore !== storeApi) return NOT_BOUND;
    const path = resolveFieldPath(namespace, name);
    // A list reached through a row's position stays an ordinary form value.
    return isKeyPath(path) ? { documentPath: path } : NOT_BOUND;
  }, [name, namespace, nearestStore, storeApi]);

  return (
    <ArrayFieldBindingContext value={binding}>
      {children}
    </ArrayFieldBindingContext>
  );
}
