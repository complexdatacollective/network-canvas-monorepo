import { useCallback, useEffect, useMemo, useRef } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ArrayField from '@codaco/fresco-ui/form/fields/ArrayField/ArrayField';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { diseaseLabelKey } from '@codaco/protocol-validation';

import { withoutAbsentValues } from '../../../form/absentValues.ts';
import {
  RowDialog,
  RowList,
  RowListItem,
  rowId,
  rowTemplate,
  type RowListConfig,
  type RowSaveOutcome,
  type RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  DiseaseEditor,
  DiseasePreview,
  useDiseaseSubject,
} from './DiseaseRow.tsx';
import {
  diseasePickIssue,
  useDiseaseVariableIndexes,
} from './diseaseVariables.ts';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import {
  diseaseMarksNobody,
  sourceStageRecordedVariables,
} from './sourceStage.ts';

const DISEASES_FIELD = 'diseases';
const SOURCE_FIELD = 'sourceStageId';

/**
 * The refusal this list encodes rather than formats.
 *
 * Stated by a rule the field registers, which runs outside React and can see
 * no formatter; the form's own error region decodes it where it is rendered,
 * so a standing refusal follows a change of language.
 */
const AT_LEAST_ONE_DISEASE = createMessageError(
  narrativePedigreeMessages.diseasesAtLeastOne,
);

/** What `unrecordedNames` signs as when no row maps anything unrecorded. */
const NOTHING_UNRECORDED = JSON.stringify([]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The conditions this stage draws on the family it reads.
 *
 * Two rules decide whether a row may be saved that are about the LIST rather
 * than about one attribute, and both are asked of the LIVE rows rather than of
 * the saved stage — a disease added in this session is not saved yet, and one
 * just deleted must free what it held at once:
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
 * Everything else a row's attribute has to be is `diseasePickIssue`, which the
 * picker in the dialog is built from as well — so the two cannot disagree
 * about which picks are legal, which would read as the editor changing its
 * mind between the pick and the save.
 */
export default function DiseasesSection() {
  const intl = useAppIntl();
  const { committedFields, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const { roleMap, slotMap } = useDiseaseVariableIndexes();
  const subject = useDiseaseSubject();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const rows = useStageValue(DISEASES_FIELD);
  const waiting = subject === null;

  // Read from the protocol context, so a nomination prompt a collaborator adds
  // to or removes from the source pedigree is seen here without this section
  // doing anything.
  const recorded = useMemo(
    () => sourceStageRecordedVariables(protocolContext, sourceStageId),
    [protocolContext, sourceStageId],
  );

  /** This row's own saved attribute, found by the row's stable id. */
  const committedVariableFor = useCallback(
    (id: unknown): string => {
      const committed: unknown = committedFields[DISEASES_FIELD];
      if (!Array.isArray(committed) || typeof id !== 'string') return '';
      const row = committed.find(
        (candidate) => isRecord(candidate) && candidate.id === id,
      );
      const variable = isRecord(row) ? row.variable : undefined;
      return typeof variable === 'string' ? variable : '';
    },
    [committedFields],
  );

  const beforeSave = useCallback(
    (row: RowValues, context: { editIndex?: number }): RowSaveOutcome => {
      const fieldErrors: Record<string, string[]> = {};

      const variable = typeof row.variable === 'string' ? row.variable : '';
      const liveRows = Array.isArray(rows) ? rows : [];
      const duplicateVariable =
        variable !== '' &&
        liveRows.some(
          (sibling, index) =>
            index !== context.editIndex &&
            isRecord(sibling) &&
            sibling.variable === variable,
        );
      const pickIssue = duplicateVariable
        ? createMessageError(
            narrativePedigreeMessages.diseasesDuplicateVariable,
          )
        : diseasePickIssue({
            context: protocolContext,
            roleMap,
            slotMap,
            subject,
            sourceStageId,
            variableId: row.variable,
            committedVariable: committedVariableFor(row.id),
          });
      if (pickIssue !== undefined) fieldErrors.variable = [pickIssue];

      const key = diseaseLabelKey(
        typeof row.label === 'string' ? row.label : '',
      );
      if (
        key !== '' &&
        liveRows.some(
          (sibling, index) =>
            index !== context.editIndex &&
            isRecord(sibling) &&
            typeof sibling.label === 'string' &&
            diseaseLabelKey(sibling.label) === key,
        )
      ) {
        fieldErrors.label = [
          createMessageError(narrativePedigreeMessages.diseasesDuplicateLabel),
        ];
      }

      // Every refusal the row has earned, in one answer: a researcher
      // repairing an imported row would otherwise be told about one of them,
      // fix it, and be told about the next.
      return Object.keys(fieldErrors).length === 0
        ? { row }
        : { refused: { fieldErrors } };
    },
    [
      committedVariableFor,
      protocolContext,
      roleMap,
      rows,
      slotMap,
      sourceStageId,
      subject,
    ],
  );

  /**
   * The recorded set as it is NOW, read through a ref.
   *
   * `useField` memoises a field's validation on a JSON of its props, which
   * drops functions: a rule rebuilt each render serialises identically and
   * pins the first closure — and its first protocol — forever. One entry for
   * the field's lifetime, reading the current set, keeps the rule live without
   * ever re-registering the field.
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
   * dialog just saved: `beforeSave` runs when a row is committed and lets the
   * row's own committed attribute through, so a mapping a collaborator
   * invalidated while the editor sat untouched — and one an import brought in
   * — would otherwise reach the host with nothing refusing it. The saved stage
   * then draws an unmarked family in every interview, and the protocol schema
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
  //
  // Keyed on the refusal the rows would earn rather than on how many rows earn
  // it. The sentence NAMES them, and one change to the source pedigree can
  // invalidate one disease and repair another at the same time — a nomination
  // prompt moved from one condition to the other leaves the count exactly as
  // it was, and the standing sentence would go on naming the row that had just
  // been repaired.
  const unrecordedSignature = JSON.stringify(unrecordedNames(rows));
  useEffect(() => {
    const state = storeApi.getState();
    if (
      unrecordedSignature === NOTHING_UNRECORDED &&
      state.getFieldErrors(DISEASES_FIELD) === null
    ) {
      return;
    }
    void state.validateField(DISEASES_FIELD);
  }, [storeApi, unrecordedSignature]);

  const rowList = useMemo<RowListConfig>(
    () => ({
      Preview: DiseasePreview,
      Editor: DiseaseEditor,
      addTitle: narrativePedigreeMessages.diseasesAddTitle,
      editTitle: narrativePedigreeMessages.diseasesEditTitle,
      formId: 'disease-editor',
      name: DISEASES_FIELD,
      beforeSave,
      normalize: (row) => withoutAbsentValues(row) as RowValues,
    }),
    [beforeSave],
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
      <RowList config={rowList}>
        <Field<typeof ArrayField<RowValues>>
          name={DISEASES_FIELD}
          label={intl.formatMessage(
            narrativePedigreeMessages.diseasesFieldLabel,
          )}
          hint={intl.formatMessage(narrativePedigreeMessages.diseasesFieldHint)}
          component={ArrayField}
          getId={rowId}
          addButtonLabel={intl.formatMessage(
            narrativePedigreeMessages.diseasesAddLabel,
          )}
          // A DESCRIPTOR rather than a word: every sentence the noun goes into
          // is formatted where it is read, so resolving it here would put an
          // English noun into a Spanish sentence.
          itemLabel={narrativePedigreeMessages.diseaseNoun}
          emptyStateMessage={intl.formatMessage(
            narrativePedigreeMessages.diseasesEmptyState,
          )}
          itemComponent={RowListItem}
          editorComponent={RowDialog}
          itemTemplate={rowTemplate()}
          sortable
          {...diseasesValidation}
        />
      </RowList>
    </BuilderSection>
  );
}
