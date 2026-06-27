import { useSelector } from 'react-redux';
import { formValueSelector } from 'redux-form';

import EditableList from '~/components/EditableList';
import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import type { RootState } from '~/ducks/store';

import PresetFields from './PresetFields';
import PresetPreview from './PresetPreview';

type DiseaseRow = {
  id: string;
  label: string;
};

type PresetRow = {
  id: string;
  label: string;
  diseases: string[];
  focal: string;
};

const presetTemplate = (): PresetRow => ({
  id: '',
  label: '',
  diseases: [],
  focal: '',
});

const Presets = ({ form }: StageEditorSectionProps) => {
  const formSelector = formValueSelector(form);

  const diseases = useSelector(
    (state: RootState) =>
      (formSelector(state, 'diseases') as DiseaseRow[] | undefined) ?? [],
  );

  const diseaseOptions = diseases
    .filter((d) => d.id && d.label)
    .map((d) => ({ value: d.id, label: d.label }));

  return (
    <Section
      title="Presets"
      summary={
        <p>
          Define one or more presets that combine selected diseases with a focal
          position. Participants can switch between presets during the
          interview.
        </p>
      }
    >
      <EditableList
        previewComponent={
          PresetPreview as React.ComponentType<Record<string, unknown>>
        }
        editComponent={PresetFields}
        title="Edit Preset"
        fieldName="presets"
        template={presetTemplate}
        form={form}
        editProps={{ diseaseOptions }}
      />
    </Section>
  );
};

export default Presets;
