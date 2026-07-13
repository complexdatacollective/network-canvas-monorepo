import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Stage } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/store';
import { getStage } from '~/selectors/protocol';

import DiseaseFields from './DiseaseFields';
import DiseasePreview from './DiseasePreview';
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
const Diseases = ({ form }: StageEditorSectionProps) => {
  const formSelector = formValueSelector(form);
  const sourceStageId = useSelector(
    (state: RootState) =>
      formSelector(state, 'sourceStageId') as string | undefined,
  );
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
      <ValidatedFieldArray
        name="diseases"
        label="Diseases"
        labelHidden
        component={DialogArrayField}
        validation={{ notEmpty }}
        componentProps={{
          addTitle: 'Edit Disease',
          editorFieldsComponent: DiseaseFields,
          editorProps: { nodeType },
          editorTitle: 'Edit Disease',
          itemLabel: 'disease',
          itemTemplate: diseaseTemplate,
          previewComponent: DiseasePreview,
          requestedEditFormName: 'editable-list-form',
          sortable: true,
        }}
      />
    </Section>
  );
};
export default Diseases;
