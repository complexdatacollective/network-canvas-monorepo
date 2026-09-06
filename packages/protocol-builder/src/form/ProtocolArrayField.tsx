import { useContext, useMemo } from 'react';

import type { ValidFieldComponent } from '@codaco/fresco-ui/form/Field/types';
import {
  resolveFieldPath,
  useFieldNamespacePath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

import { ArrayFieldBindingContext } from './arrayFields/useArrayFieldCommands.ts';
import ProtocolField, { type ProtocolFieldProps } from './ProtocolField.tsx';
import { useStageEditorForm } from './stageEditorContext.ts';

export type ProtocolArrayFieldProps<C extends ValidFieldComponent> =
  ProtocolFieldProps<C>;

/**
 * Array-valued counterpart to `ProtocolField`, for fresco-ui's `ArrayField`
 * and for the package's own list editors.
 *
 * The whole array is ONE field value: rows are rendered by the component from
 * the `value` it receives and are never registered as individual fields in the
 * form store. Registering per-index leaves would let a deleted row's dormant
 * value resurrect itself in the submitted values.
 *
 * Consequences for validation: array-level rules (`minTwoOptions`,
 * `completeOptions`, …) are ordinary entries in the same `validation` config
 * and receive the entire array as their value, so they can BLOCK a save. Rules
 * belonging to one cell of one row live on that row's `RowField`, where they
 * can only be displayed — see `RowField` for why that split is forced, and why
 * a rule that must refuse a save needs a counterpart here.
 *
 * What this adds over `ProtocolField` is the binding a list editor commits
 * through. A list held at a top-level key of the stage document is edited with
 * the document's own list commands — insert this row, move that one — instead
 * of being replaced wholesale, so a collaborator's client can replay the edit
 * onto a list that has since changed. A list nested inside a row has no key of
 * its own and is left as a plain form value, committed by the dialog that
 * edits the row around it.
 */
export default function ProtocolArrayField<C extends ValidFieldComponent>(
  props: ProtocolArrayFieldProps<C>,
) {
  const { storeApi } = useStageEditorForm();
  const nearestStore = useContext(FormStoreContext);
  const namespace = useFieldNamespacePath();
  const { name, nameMode } = props;

  const binding = useMemo(() => {
    // A list rendered inside a row dialog belongs to that dialog's form, and
    // the row it is part of is committed as a whole when the dialog saves.
    // Writing its rows into the stage document as they change would commit
    // half of an edit the researcher can still cancel.
    if (nearestStore !== storeApi) return { documentKey: undefined };
    const path = resolveFieldPath(namespace, name, nameMode);
    const [key, ...rest] = path;
    // The command vocabulary addresses a document key, so only a list that IS
    // one can be edited structurally.
    return {
      documentKey:
        rest.length === 0 && typeof key === 'string' ? key : undefined,
    };
  }, [name, nameMode, namespace, nearestStore, storeApi]);

  return (
    <ArrayFieldBindingContext value={binding}>
      <ProtocolField<C> {...props} />
    </ArrayFieldBindingContext>
  );
}
