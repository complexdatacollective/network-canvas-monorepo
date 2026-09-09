import { useCallback } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import {
  hasParameterIssues,
  validateParameters,
} from '../../codebook/variableParameters.ts';
import { variableDisplayName } from '../../codebook/variableValidation.ts';
import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField, {
  type DialogArrayEditorValidate,
  type DialogArrayFieldProps,
} from '../../form/arrayFields/DialogArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import { useRowRenderers } from '../rowRenderers.tsx';
import { useStageSubject, useSubjectVariables } from './codebookOptions.ts';
import { useComposerDraftWriters } from './composerDraftWriters.ts';
import {
  composerParameterShape,
  effectiveComposerParameters,
  PARAMETERS_FIELD,
} from './ComposerFieldParameters.tsx';
import {
  ComposerFormFieldEditor,
  ComposerFormFieldPreview,
} from './ComposerFormFieldRow.tsx';
import { ComposerFormSubjectContext } from './composerFormSubject.ts';
import { networkCanvasMessages } from './networkCanvasMessages.ts';

type FormFieldRow = Record<string, unknown>;

const isRecord = (value: unknown): value is FormFieldRow =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The row as the protocol holds it.
 *
 * One thing the shared "drop what was left empty" rule cannot decide: a
 * validation hint that is switched OFF is written by its absence. `false` is an
 * answer in general — which is why the shared rule keeps it — but this toggle's
 * off position is the schema's own default, and stamping it on every field of
 * every form says nothing its absence did not already say. The same rule
 * `FormFieldsSection` applies to the same property.
 */
const normalizeComposerField = (value: unknown): unknown => {
  const cleaned = withoutAbsentValues(value);
  if (!isRecord(cleaned)) return cleaned;
  if (cleaned.showValidationHints !== false) return cleaned;
  const { showValidationHints: _off, ...field } = cleaned;
  return field;
};

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
  disabled = false,
  ...listProps
}: ComposerFormFieldsListProps) {
  const intl = useAppIntl();
  /**
   * Read-only is a property of the SESSION, not of any one mount.
   *
   * A composer's node form reaches this list through `ProtocolField`, which
   * hands every field the session's read-only state; each connection form is
   * mounted directly, because it is reached through a row's position rather
   * than a path of its own — and arrived with neither `disabled` nor
   * `readOnly`. Its add, edit, delete and reorder controls therefore stayed
   * live while another collaborator held the lease, and a deletion took effect
   * on the local draft at once and was saved when access came back. Asked here
   * so the answer cannot depend on which way the list was mounted.
   */
  const { readOnly } = useStageEditorForm();
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    ComposerFormFieldEditor,
    ComposerFormFieldPreview,
  );
  const variables = useSubjectVariables(subject);
  /**
   * What this stage itself writes around the codebook's rules, which the role
   * map behind the picker cannot see: it is built with the edited stage
   * excluded. Judged here as well as offered there, so the dialog cannot refuse
   * what the picker offered — or accept a pick that survived from a stale
   * draft.
   */
  const stageSubject = useStageSubject();
  const draftWriters = useComposerDraftWriters();
  const judgedAgainstTheStage =
    subject !== undefined &&
    stageSubject !== undefined &&
    subject.entity === stageSubject.entity &&
    (subject.entity === 'ego' ||
      ('type' in subject &&
        'type' in stageSubject &&
        subject.type === stageSubject.type));

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
        return {
          variable: intl.formatMessage(
            networkCanvasMessages.duplicateVariableRefusal,
          ),
        };
      }
      /**
       * And nothing this stage already writes around the codebook's rules.
       *
       * Escapes the row's PRE-EDIT pick, the way every other cross-class gate
       * in this package does: re-saving a row that arrived conflicting must
       * never be refused for a conflict this edit did not introduce.
       */
      const committed =
        typeof context?.initialValues === 'object' &&
        context.initialValues !== null
          ? Reflect.get(context.initialValues, 'variable')
          : undefined;
      if (
        judgedAgainstTheStage &&
        variable !== '' &&
        variable !== committed &&
        draftWriters.unvalidated.has(variable)
      ) {
        return {
          variable: createMessageError(
            networkCanvasMessages.unvalidatedOnThisStageRefusal,
            { variableName: variableDisplayName(variables, variable) },
          ),
        };
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
        // Judged on what the control would actually run with: a field that
        // omits `parameters` inherits the codebook attribute's block, and
        // judged on the absent key alone a scale validly inheriting its two end
        // labels was refused for not having them.
        const issues = validateParameters(
          shape,
          effectiveComposerParameters(
            variables,
            values.variable,
            values.component,
            values[PARAMETERS_FIELD],
          ),
        );
        if (hasParameterIssues(issues)) {
          return { [PARAMETERS_FIELD]: Object.values(issues).flat() };
        }
      }
      return {};
    },
    [draftWriters, intl, judgedAgainstTheStage, value, variables],
  );

  return (
    <ComposerFormSubjectContext value={subject}>
      <DialogArrayField<FormFieldRow>
        {...listProps}
        value={value}
        disabled={disabled || readOnly}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorValidate={editorValidate}
        editorDialogSize="editor"
        normalizeItem={normalizeComposerField}
        sortable
      />
    </ComposerFormSubjectContext>
  );
}
