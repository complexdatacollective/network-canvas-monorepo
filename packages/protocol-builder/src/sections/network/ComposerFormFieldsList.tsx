import { useCallback } from 'react';

import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField, {
  type DialogArrayEditorValidate,
  type DialogArrayFieldProps,
} from '../../form/arrayFields/DialogArrayField.tsx';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useRowRenderers } from '../rowRenderers.tsx';
import {
  ComposerFormFieldEditor,
  ComposerFormFieldPreview,
} from './ComposerFormFieldRow.tsx';
import { ComposerFormSubjectContext } from './composerFormSubject.ts';

type FormFieldRow = Record<string, unknown>;

const DUPLICATE_VARIABLE =
  'Another field on this form already records this attribute. Choose a different one, or edit the existing field instead.';

const isRecord = (value: unknown): value is FormFieldRow =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type ComposerFormFieldsListProps = Omit<
  DialogArrayFieldProps<FormFieldRow>,
  | 'editorDialogSize'
  | 'editorFieldsComponent'
  | 'editorValidate'
  | 'normalizeItem'
  | 'previewComponent'
> &
  Readonly<{
    /** Whose attributes these fields collect; see `ComposerFormSubjectContext`. */
    subject: CodebookSubject | undefined;
  }>;

/**
 * The fields of one form a network composer shows.
 *
 * A field component, so it can be mounted two ways without being written
 * twice. A composer's node form is a document key of its own and is mounted
 * through `ProtocolArrayField`, which gives it an outline anchor and a place
 * for the form's rules to be reported. Each connection type's form has no key
 * of its own — it lives inside a row of `edges` — so it is mounted with the
 * value and change handler of the control that owns that list, exactly as any
 * other list nested inside a row.
 *
 * One rule belongs to the form rather than to any field in it: a form may not
 * record one attribute twice, which is the protocol schema's own
 * `uniqueFormFieldVariables`. It is asked of the LIVE rows in the dialog, so a
 * field added in this session counts and one just deleted frees its attribute
 * at once.
 */
export default function ComposerFormFieldsList({
  subject,
  value,
  ...listProps
}: ComposerFormFieldsListProps) {
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    ComposerFormFieldEditor,
    ComposerFormFieldPreview,
  );

  const editorValidate = useCallback<DialogArrayEditorValidate>(
    (values, context) => {
      const editIndex = context?.editIndex;
      const rows = value ?? [];
      const variable =
        typeof values.variable === 'string' ? values.variable : '';
      if (
        variable !== '' &&
        rows.some(
          (row, index) =>
            index !== editIndex && isRecord(row) && row.variable === variable,
        )
      ) {
        return { variable: DUPLICATE_VARIABLE };
      }
      return {};
    },
    [value],
  );

  return (
    <ComposerFormSubjectContext value={subject}>
      <DialogArrayField<FormFieldRow>
        {...listProps}
        value={value}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorValidate={editorValidate}
        editorDialogSize="editor"
        normalizeItem={withoutAbsentValues}
        sortable
      />
    </ComposerFormSubjectContext>
  );
}
