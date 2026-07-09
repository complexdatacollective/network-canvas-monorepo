import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { Stage } from '@codaco/protocol-validation';
import EditableList from '~/components/EditableList';
import { Section } from '~/components/EditorLayout';
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
// EditableList assigns a unique `id` to each new item.
const diseaseTemplate = (): DiseaseRow => ({
  label: '',
  color: '',
  variable: '',
  inheritancePattern: '',
});
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
      <EditableList
        previewComponent={
          DiseasePreview as React.ComponentType<Record<string, unknown>>
        }
        editComponent={DiseaseFields}
        title="Edit Disease"
        fieldName="diseases"
        template={diseaseTemplate}
        form={form}
        editProps={{ nodeType }}
      />
    </Section>
  );
};
export default Diseases;
