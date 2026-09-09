import { useCallback, useEffect, useMemo, useRef } from 'react';

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
import {
  slotCrossClassIssue,
  unusableVariableIssue,
} from '../pedigree/slotWiring.ts';
import { useRowRenderers } from '../rowRenderers.tsx';
import {
  DiseaseEditor,
  DiseasePreview,
  useDiseaseSubject,
} from './DiseaseRow.tsx';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import {
  diseaseMarksNobody,
  sourceStageNodeType,
  sourceStageRecordedVariables,
} from './sourceStage.ts';

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

/**
 * The refusal a pick nothing collects earns, encoded for the same reason.
 *
 * Stated here as well as kept out of the picker because the two answer
 * different questions: the picker decides what a researcher may choose NOW,
 * and this decides what may be SAVED — a row whose attribute stopped being
 * recorded while the dialog was open, or one an import brought in, never went
 * through the picker at all.
 */
const NOT_RECORDED = createMessageError(
  narrativePedigreeMessages.diseasesNotRecorded,
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
 * Two more rules are the ones the picker applies, stated again here on
 * purpose, because the picker decides what may be CHOSEN and this decides what
 * may be SAVED — an attribute that stopped qualifying while the dialog was
 * open, or a row an import brought in, never went through the picker:
 *
 * - a disease writes its attribute from the tree the participant draws,
 *   without validation, so it may take neither an attribute another interface
 *   slot owns nor one a form elsewhere collects; and
 * - it may take only an attribute the source pedigree RECORDS — one a
 *   nomination prompt of it writes. A disease mapped to anything else marks
 *   nobody: the attribute is never set, and the genetics engine treats only an
 *   explicit `true` as affected, so the participant is shown their family with
 *   nothing on it and no error says why.
 *
 * The row's own COMMITTED attribute escapes both, found BY ROW ID rather than
 * by the row the dialog opened on, so a mapping this edit did not introduce
 * leaves the researcher an editor they can close.
 *
 * What it does NOT escape is the attribute having gone: an attribute deleted,
 * retyped, or left behind by a change of source pedigree is not an authoring
 * decision anybody made, and nothing can be recorded under it. That is asked
 * first, of the row's attribute whatever its history, exactly as the pedigree's
 * own nomination-prompt rows and slot controls ask it.
 */
export default function DiseasesSection() {
  const intl = useAppIntl();
  const { committedFields, protocolContext, storeApi } = useStageEditorForm();
  const { roleMap, slotMap } = usePedigreeVariableIndexes();
  const subject = useDiseaseSubject();
  const sourceStageId = useStageValue('sourceStageId');
  const rows = useStageValue(DISEASES_FIELD);
  const waiting =
    sourceStageNodeType(protocolContext, sourceStageId) === undefined;

  // Read from the protocol context, so a nomination prompt a collaborator adds
  // to or removes from the source pedigree is seen here without this section
  // doing anything.
  const recorded = useMemo(
    () => sourceStageRecordedVariables(protocolContext, sourceStageId),
    [protocolContext, sourceStageId],
  );

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

      // The attribute itself, before anything about who else writes it, and
      // before the committed value escapes anything below: a collaborator can
      // delete it or retype it — and repointing this stage's pedigree at
      // another node type takes it away just as completely — while the row's
      // dialog is open. The picker drops it at once, being built from the same
      // codebook, but the row is already holding it and the required rule sees
      // a nonempty value, so Save closed the row over a reference whole-protocol
      // validation then refuses. There is deliberately no committed-value
      // escape here: a pre-existing conflict is somebody's authoring decision,
      // an attribute that is gone is not, and nothing can be recorded under it.
      // The same order, and the same seam, as the pedigree's nomination-prompt
      // rows and its slot controls.
      const unusable =
        subject === null
          ? undefined
          : unusableVariableIssue(allVariables, value.variable, 'boolean');
      if (unusable !== undefined) {
        return { success: false, fieldErrors: { variable: [unusable] } };
      }

      const committed = committedVariableFor(value.id);
      const issue = slotCrossClassIssue({
        roleMap,
        slotMap,
        subject,
        variableId: value.variable,
        committedValue: committed,
        // No `ownSlot`: a disease mapping fills no interface slot of its own.
        writerClass: 'unvalidated',
        allVariables,
      });
      if (issue !== undefined) {
        return { success: false, fieldErrors: { variable: [issue] } };
      }
      const pick = typeof value.variable === 'string' ? value.variable : '';
      if (pick !== '' && pick !== committed && !recorded.has(pick)) {
        return { success: false, fieldErrors: { variable: [NOT_RECORDED] } };
      }
      return value;
    },
    [allVariables, committedVariableFor, recorded, roleMap, slotMap, subject],
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

  /**
   * The recorded set as it is NOW, read through a ref.
   *
   * `useField` memoises a field's validation on a JSON of its props, which
   * drops functions: a rule rebuilt each render serialises identically and
   * pins the first closure — and its first protocol — forever. One entry for
   * the field's lifetime, reading the current set, keeps the rule live without
   * ever re-registering the field. The same reason `SourceStageSection` reads
   * its verdict through one.
   */
  const recordedRef = useRef(recorded);
  recordedRef.current = recorded;

  /**
   * The rows nothing would ever mark, by the name the researcher gave them.
   *
   * A row with no name of its own is named by the same stand-in its collapsed
   * row shows, carried as a nested message error so the whole refusal is
   * resolved in the reader's language where it is finally rendered.
   */
  const unrecordedNames = useCallback(
    (value: unknown): (string | Readonly<{ messageError: string }>)[] => {
      if (!Array.isArray(value)) return [];
      return value.flatMap((row: unknown) =>
        diseaseMarksNobody(row, recordedRef.current)
          ? [
              isRecord(row) && typeof row.label === 'string' && row.label !== ''
                ? row.label
                : {
                    messageError: createMessageError(
                      narrativePedigreeMessages.diseaseUnnamed,
                    ),
                  },
            ]
          : [],
      );
    },
    [],
  );

  /**
   * What the LIST refuses.
   *
   * The recorded-attribute rule is asked of every row, not only of the one a
   * dialog just saved: `onBeforeSave` runs when a row is committed and lets
   * the row's own committed attribute through, so a mapping a collaborator
   * invalidated while the editor sat untouched — and one an import brought in
   * — reached the host with nothing anywhere refusing it. The saved stage then
   * draws an unmarked family in every interview, and the protocol schema
   * accepts it because it checks that the attribute exists and is a boolean,
   * not that anything ever writes it.
   */
  const diseasesValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          Array.isArray(value) && value.length > 0
            ? undefined
            : AT_LEAST_ONE_DISEASE,
        (value: unknown) => {
          const names = unrecordedNames(value);
          return names.length === 0
            ? undefined
            : createMessageError(narrativePedigreeMessages.diseasesMarkNobody, {
                count: names.length,
                diseaseNames: { list: names },
              });
        },
      ]),
    }),
    [unrecordedNames],
  );

  // Field validation runs when the researcher touches a control, and on
  // submit. Neither covers how this problem appears: a collaborator deletes
  // the nomination prompt behind a disease while this editor sits untouched.
  // Re-running the list's validation whenever that set of rows changes is what
  // reports it the moment it appears rather than at the next save — and only
  // when there is something to report, or an error already standing that it
  // would now clear, so an untouched empty list is not given the "add at least
  // one" refusal nobody has earned yet.
  const unrecordedCount = unrecordedNames(rows).length;
  useEffect(() => {
    const state = storeApi.getState();
    if (
      unrecordedCount === 0 &&
      state.getFieldErrors(DISEASES_FIELD) === null
    ) {
      return;
    }
    void state.validateField(DISEASES_FIELD);
  }, [storeApi, unrecordedCount]);

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
