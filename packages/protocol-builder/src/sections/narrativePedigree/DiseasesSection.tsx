import { useCallback, useMemo } from 'react';

import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { diseaseLabelKey } from '@codaco/protocol-validation';

import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField, {
  type DialogArrayEditorValidate,
} from '../../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { useRowRenderers } from '../rowRenderers.tsx';
import { DiseaseEditor, DiseasePreview } from './DiseaseRow.tsx';
import { sourceStageNodeType } from './sourceStage.ts';

const DISEASES_FIELD = 'diseases';

const AT_LEAST_ONE_DISEASE =
  'Add at least one disease. A narrative pedigree with none shows the participant an unmarked family.';

const DUPLICATE_VARIABLE =
  'This attribute is already mapped by another disease. Choose a different one, or edit the existing disease instead.';

const DUPLICATE_LABEL =
  'Another disease already uses this name. Give this one a name participants can tell apart.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type DiseasesCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /**
   * Said instead of `description` while the section is waiting on a source
   * stage, so the outline's "not available yet" has an explanation beside it.
   */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
  /** Visible text and accessible name of the add button. */
  addButtonLabel: string;
  addTitle: string;
  editorTitle: string;
  /** Noun used in row affordances ("Edit disease", "Remove disease"). */
  itemLabel: string;
  emptyStateMessage: string;
}>;

const DEFAULT_COPY: DiseasesCopy = {
  sectionTitle: 'Diseases',
  description:
    'Define the conditions this stage draws on the family, and how each is inherited.',
  waitingDescription:
    'Choose the Family Pedigree stage this one reads before defining its diseases.',
  fieldLabel: 'Diseases',
  fieldHint:
    "Each disease maps one boolean attribute of the source pedigree's family members. Drag to reorder them in the key.",
  addButtonLabel: 'Create new disease',
  addTitle: 'Create disease',
  editorTitle: 'Edit disease',
  itemLabel: 'disease',
  emptyStateMessage:
    'No diseases yet. Create one to mark who in the family is affected.',
};

export type DiseasesSectionProps = Readonly<{
  copy?: Partial<DiseasesCopy>;
}>;

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
 */
export default function DiseasesSection({ copy }: DiseasesSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { protocolContext } = useStageEditorForm();
  const sourceStageId = useStageValue('sourceStageId');
  const rows = useStageValue(DISEASES_FIELD);
  const waiting =
    sourceStageNodeType(protocolContext, sourceStageId) === undefined;

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
        return { variable: DUPLICATE_VARIABLE };
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
        return { label: DUPLICATE_LABEL };
      }
      return {};
    },
    [rows],
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
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={DISEASES_FIELD}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={DialogArrayField}
        addButtonLabel={words.addButtonLabel}
        addTitle={words.addTitle}
        editorTitle={words.editorTitle}
        itemLabel={words.itemLabel}
        emptyStateMessage={words.emptyStateMessage}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorValidate={editorValidate}
        editorDialogSize="editor"
        normalizeItem={withoutAbsentValues}
        sortable
        {...diseasesValidation}
      />
    </BuilderSection>
  );
}
