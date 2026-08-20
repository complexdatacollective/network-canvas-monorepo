import { useCallback, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Stage } from '@codaco/protocol-validation';
import { normalizeForComparison } from '@codaco/shared-consts';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/store';
import { getStage } from '~/selectors/protocol';

import { isVariableUsedBySibling } from '../Form/composerHelpers';
import DiseaseFields from './DiseaseFields';
import DiseasePreview from './DiseasePreview';

// `DiseaseFields` declares `nodeType` as a required prop rather than the
// array field's generic `Renderer` bag; DialogArrayField always spreads
// `editorProps` (which supplies it) into the dialog's fields component, so
// the cast is safe.
type Renderer = ComponentType<Record<string, unknown>>;

type DiseaseRow = {
  label: string;
  color: string;
  variable: string;
  inheritancePattern: string;
};
const diseaseTemplate = (): DiseaseRow => ({
  label: '',
  color: '',
  variable: '',
  inheritancePattern: '',
});
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
type FamilyPedigreeStage = Extract<
  Stage,
  {
    type: 'FamilyPedigree';
  }
>;
const Diseases = (_props: StageEditorSectionProps) => {
  const sourceStageId = useStageFormValue<string>('sourceStageId');
  // `initialValue` seeds the array field once; every gate below reads the live
  // rows instead (see `editorValidate`).
  const diseasesInitial =
    useStageInitialValue<Record<string, unknown>[]>('diseases');
  const diseaseRows = useStageFormValue('diseases');
  const nodeType = useSelector((state: RootState) => {
    if (!sourceStageId) return undefined;
    const stage = getStage(state, sourceStageId);
    if (!stage || stage.type !== 'FamilyPedigree') return undefined;
    return (stage as FamilyPedigreeStage).nodeConfig?.type;
  });
  // Two rows mapping one variable give the pedigree contradictory answers for
  // a single affected set, and two rows sharing a label are indistinguishable
  // in the key the participant reads. The pickers already drop an
  // already-mapped variable; these are the backstops for a stale draft and for
  // the label, which has no picker to filter.
  //
  // Read from the LIVE rows, not the committed snapshot — the same rule the
  // Form editor documents. A disease added in this editing session is not on
  // the saved stage yet, so a committed list would let its variable (or its
  // name) be reused a second time, leaving a stage the schema refuses on save;
  // and a name freed by a row just deleted would go on being rejected.
  const editorValidate = useCallback(
    (
      values: Record<string, unknown>,
      props?: { editIndex?: number },
    ): Record<string, unknown> => {
      const variable =
        typeof values.variable === 'string' ? values.variable : '';
      // The same predicate the Form editors apply to their own sibling rows,
      // so the two surfaces cannot drift; only the message is this domain's.
      if (isVariableUsedBySibling(diseaseRows, variable, props?.editIndex)) {
        return {
          variable:
            'This attribute is already mapped by another disease. Choose a different attribute, or edit the existing disease instead.',
        };
      }
      const label = typeof values.label === 'string' ? values.label : '';
      // The same comparison the schema and the repair make, by the same
      // helper: a label this editor accepts must be one the saved protocol is
      // still valid under, on every device it is opened on.
      const normalized = normalizeForComparison(label.trim());
      const duplicateLabel =
        normalized !== '' &&
        (Array.isArray(diseaseRows) ? diseaseRows : []).some(
          (row: unknown, index) =>
            index !== props?.editIndex &&
            isRecord(row) &&
            typeof row.label === 'string' &&
            normalizeForComparison(row.label.trim()) === normalized,
        );
      if (duplicateLabel) {
        return {
          label:
            'Another disease already uses this name. Give this one a name participants can tell apart.',
        };
      }
      return {};
    },
    [diseaseRows],
  );

  return (
    <Section
      title="Diseases"
      summary={
        <Paragraph>
          Define the diseases to visualize on the pedigree. Each disease maps to
          a boolean node attribute from the source Family Pedigree stage.
        </Paragraph>
      }
    >
      <ArchitectArrayField
        name="diseases"
        label="Diseases"
        labelHidden
        component={DialogArrayField}
        addButtonLabel="Create new disease"
        validation={{ notEmpty }}
        initialValue={diseasesInitial ?? []}
        addTitle="Edit Disease"
        editorFieldsComponent={DiseaseFields as unknown as Renderer}
        editorProps={{ nodeType, siblingDiseases: diseaseRows }}
        editorTitle="Edit Disease"
        editorValidate={editorValidate}
        itemLabel="disease"
        itemTemplate={diseaseTemplate}
        previewComponent={DiseasePreview}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};
export default Diseases;
