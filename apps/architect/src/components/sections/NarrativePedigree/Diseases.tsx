import type { ComponentType } from 'react';
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
        editorProps={{ nodeType }}
        editorTitle="Edit Disease"
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
