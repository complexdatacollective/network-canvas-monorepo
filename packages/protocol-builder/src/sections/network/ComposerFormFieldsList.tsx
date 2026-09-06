import { useCallback } from 'react';

import {
  hasParameterIssues,
  validateParameters,
} from '../../codebook/variableParameters.ts';
import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField, {
  type DialogArrayEditorValidate,
  type DialogArrayFieldProps,
} from '../../form/arrayFields/DialogArrayField.tsx';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useRowRenderers } from '../rowRenderers.tsx';
import { useSubjectVariables } from './codebookOptions.ts';
import {
  composerParameterShape,
  PARAMETERS_FIELD,
} from './ComposerFieldParameters.tsx';
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
 * twice. A composer's node form has a place of its own in the stage document
 * — `nodeForm.fields` — and is mounted through `ProtocolArrayField`, which
 * binds it there, gives it an outline anchor, and gives the form's rules
 * somewhere to be reported. Each connection type's form has no such place: it
 * is reached through a row's position in `edges`, which a collaborator's
 * insert can move, so it is mounted with the value and change handler of the
 * control that owns that list, exactly as any other list nested inside a row.
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
  const variables = useSubjectVariables(subject);

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
      /**
       * The settings block, judged by the protocol's own parameter schemas
       * before the row is committed.
       *
       * The stage save catches this too, but by then the dialog has closed
       * over the two dates the message is about — and it answers against a
       * path rather than against the control the researcher has to fix in.
       * The same schemas run either way; this one just knows which field
       * asked.
       */
      const shape = composerParameterShape(
        variables,
        values.variable,
        values.component,
      );
      if (shape !== null) {
        const issues = validateParameters(shape, values[PARAMETERS_FIELD]);
        if (hasParameterIssues(issues)) {
          return { [PARAMETERS_FIELD]: Object.values(issues).flat() };
        }
      }
      return {};
    },
    [value, variables],
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
