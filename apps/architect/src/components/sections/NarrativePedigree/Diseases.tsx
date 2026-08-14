import { useCallback, type ComponentType } from 'react';
import { useSelector } from 'react-redux';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Stage } from '@codaco/protocol-validation';
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

import DiseaseFields, { isVariableUsedByAnotherDisease } from './DiseaseFields';
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
type FamilyPedigreeStage = Extract<
  Stage,
  {
    type: 'FamilyPedigree';
  }
>;
const Diseases = (_props: StageEditorSectionProps) => {
  const sourceStageId = useStageFormValue<string>('sourceStageId');
  const diseasesInitial =
    useStageInitialValue<Record<string, unknown>[]>('diseases');
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
  const editorValidate = useCallback(
    (
      values: Record<string, unknown>,
      props?: { editIndex?: number },
    ): Record<string, unknown> => {
      const variable =
        typeof values.variable === 'string' ? values.variable : '';
      if (
        isVariableUsedByAnotherDisease(
          diseasesInitial,
          variable,
          props?.editIndex,
        )
      ) {
        return {
          variable:
            'This variable is already mapped by another disease. Choose a different variable, or edit the existing disease instead.',
        };
      }
      const label = typeof values.label === 'string' ? values.label : '';
      const normalized = label.trim().toLocaleLowerCase();
      const duplicateLabel =
        normalized !== '' &&
        (diseasesInitial ?? []).some(
          (row, index) =>
            index !== props?.editIndex &&
            typeof row.label === 'string' &&
            row.label.trim().toLocaleLowerCase() === normalized,
        );
      if (duplicateLabel) {
        return {
          label:
            'Another disease already uses this name. Give this one a name participants can tell apart.',
        };
      }
      return {};
    },
    [diseasesInitial],
  );

  return (
    <Section
      title="Diseases"
      summary={
        <Paragraph>
          Define the diseases to visualize on the pedigree. Each disease maps to
          a boolean node variable from the source Family Pedigree stage.
        </Paragraph>
      }
    >
      <ArchitectArrayField
        name="diseases"
        label="Diseases"
        labelHidden
        component={DialogArrayField}
        validation={{ notEmpty }}
        initialValue={diseasesInitial ?? []}
        addTitle="Edit Disease"
        editorFieldsComponent={DiseaseFields as unknown as Renderer}
        editorProps={{ nodeType, siblingDiseases: diseasesInitial }}
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
