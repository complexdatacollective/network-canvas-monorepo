import { useCallback, useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { diseaseLabelKey } from '@codaco/protocol-validation';

import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField, {
  type DialogArrayEditorValidate,
} from '../../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import { variablesForSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import { usePedigreeVariableIndexes } from '../pedigree/entityTypeReset.ts';
import { slotCrossClassIssue } from '../pedigree/slotWiring.ts';
import { useRowRenderers } from '../rowRenderers.tsx';
import {
  DiseaseEditor,
  DiseasePreview,
  useDiseaseSubject,
} from './DiseaseRow.tsx';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import { sourceStageNodeType } from './sourceStage.ts';

const DISEASES_FIELD = 'diseases';

/**
 * The refusal about the LIST, encoded rather than formatted.
 *
 * It is stated by a rule the field registers, which runs outside React and can
 * see no formatter; the form's own error region decodes it (see
 * `formatMessageError`), so the researcher reads it in their own language.
 */
const AT_LEAST_ONE_DISEASE = createMessageError(
  narrativePedigreeMessages.diseasesAtLeastOne,
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The conditions this stage draws on the family it reads.
 *
 * Two rules decide whether a row may be saved, and both are asked of the LIVE
 * rows rather than the saved stage — a disease added in this session is not
 * saved yet, and one just deleted must free what it held at once:
 *
 * - one attribute per disease. Two rows on one attribute give the pedigree
 *   contradictory answers for a single affected set, and the genetics engine
 *   resolves one inheritance pattern per attribute.
 * - one name per disease. The name is the key the participant reads, so two
 *   rows sharing one are indistinguishable on screen whatever they map.
 *
 * Names are compared by the schema's own key, so a name this editor accepts is
 * one the saved protocol is still valid under on every device it is opened on.
 *
 * A third rule is the shared pedigree one, and it is stated twice on purpose:
 * a disease writes its attribute from the tree the participant draws, without
 * validation, so it may take neither an attribute another interface slot owns
 * nor one a form elsewhere collects. The picker never offers such an
 * attribute; this gate is what catches one that reached the row another way —
 * an imported protocol, or a draft made before the rule. The row's own
 * COMMITTED attribute escapes, found BY ROW ID rather than by the row the
 * dialog opened on, so a conflict this edit did not introduce leaves the
 * researcher an editor they can close.
 */
export default function DiseasesSection() {
  const intl = useAppIntl();
  const { committedFields, protocolContext } = useStageEditorForm();
  const { roleMap, slotMap } = usePedigreeVariableIndexes();
  const subject = useDiseaseSubject();
  const sourceStageId = useStageValue('sourceStageId');
  const rows = useStageValue(DISEASES_FIELD);
  const waiting =
    sourceStageNodeType(protocolContext, sourceStageId) === undefined;

  const allVariables = useMemo(
    () =>
      subject === null ? {} : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  /** This row's own saved attribute, found by the row's stable id. */
  const committedVariableFor = useCallback(
    (rowId: unknown): string => {
      const committed: unknown = committedFields[DISEASES_FIELD];
      if (!Array.isArray(committed) || typeof rowId !== 'string') return '';
      const row = committed.find(
        (candidate) => isRecord(candidate) && candidate.id === rowId,
      );
      const variable = isRecord(row) ? row.variable : undefined;
      return typeof variable === 'string' ? variable : '';
    },
    [committedFields],
  );

  const onBeforeSave = useCallback(
    (value: unknown) => {
      if (!isRecord(value)) return value;
      const issue = slotCrossClassIssue({
        roleMap,
        slotMap,
        subject,
        variableId: value.variable,
        committedValue: committedVariableFor(value.id),
        // No `ownSlot`: a disease mapping fills no interface slot of its own.
        writerClass: 'unvalidated',
        allVariables,
      });
      if (issue === undefined) return value;
      return { success: false, fieldErrors: { variable: [issue] } };
    },
    [allVariables, committedVariableFor, roleMap, slotMap, subject],
  );

  const editorValidate = useCallback<DialogArrayEditorValidate>(
    (values, context) => {
      const editIndex = context?.editIndex;
      const liveRows = Array.isArray(rows) ? rows : [];
      const variable =
        typeof values.variable === 'string' ? values.variable : '';
      if (
        variable !== '' &&
        liveRows.some(
          (row, index) =>
            index !== editIndex && isRecord(row) && row.variable === variable,
        )
      ) {
        return {
          variable: intl.formatMessage(
            narrativePedigreeMessages.diseasesDuplicateVariable,
          ),
        };
      }

      const label = typeof values.label === 'string' ? values.label : '';
      const key = diseaseLabelKey(label);
      if (
        key !== '' &&
        liveRows.some(
          (row, index) =>
            index !== editIndex &&
            isRecord(row) &&
            typeof row.label === 'string' &&
            diseaseLabelKey(row.label) === key,
        )
      ) {
        return {
          label: intl.formatMessage(
            narrativePedigreeMessages.diseasesDuplicateLabel,
          ),
        };
      }
      return {};
    },
    [intl, rows],
  );

  const diseasesValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          Array.isArray(value) && value.length > 0
            ? undefined
            : AT_LEAST_ONE_DISEASE,
      ]),
    }),
    [],
  );

  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    DiseaseEditor,
    DiseasePreview,
  );

  return (
    <BuilderSection
      title={intl.formatMessage(narrativePedigreeMessages.diseasesTitle)}
      description={intl.formatMessage(
        waiting
          ? narrativePedigreeMessages.diseasesWaitingDescription
          : narrativePedigreeMessages.diseasesDescription,
      )}
      disabled={waiting}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={DISEASES_FIELD}
        label={intl.formatMessage(narrativePedigreeMessages.diseasesFieldLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.diseasesFieldHint)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(
          narrativePedigreeMessages.diseasesAddLabel,
        )}
        addTitle={intl.formatMessage(
          narrativePedigreeMessages.diseasesAddTitle,
        )}
        editorTitle={intl.formatMessage(
          narrativePedigreeMessages.diseasesEditTitle,
        )}
        itemLabel={narrativePedigreeMessages.diseaseNoun}
        emptyStateMessage={intl.formatMessage(
          narrativePedigreeMessages.diseasesEmptyState,
        )}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorValidate={editorValidate}
        onBeforeSave={onBeforeSave}
        editorDialogSize="editor"
        normalizeItem={withoutAbsentValues}
        sortable
        {...diseasesValidation}
      />
    </BuilderSection>
  );
}
