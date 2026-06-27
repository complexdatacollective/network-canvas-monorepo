import { startCase } from 'es-toolkit/compat';
import { Field } from 'redux-form';

import { FOCAL_POSITIONS } from '@codaco/shared-consts';
import { Row, Section } from '~/components/EditorLayout';
import CheckboxGroup from '~/components/Form/Fields/CheckboxGroup';
import Select from '~/components/Form/Fields/Select';
import Text from '~/components/Form/Fields/Text';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';

const FOCAL_POSITION_OPTIONS = FOCAL_POSITIONS.map((value) => ({
  value,
  label: startCase(value),
}));

type DiseaseOption = {
  value: string;
  label: string;
};

type PresetFieldsProps = {
  diseaseOptions: DiseaseOption[];
};

const PresetFields = ({ diseaseOptions }: PresetFieldsProps) => (
  <>
    <Section title="Preset Label" layout="vertical">
      <Row>
        <IssueAnchor fieldName="label" description="Preset label" />
        <ValidatedField
          name="label"
          component={Text}
          validation={{ required: true }}
          componentProps={{
            label: 'Preset label',
            placeholder: 'Enter a label for this preset...',
          }}
        />
      </Row>
    </Section>
    <Section
      title="Diseases"
      layout="vertical"
      summary={<p>Select the diseases to include in this preset.</p>}
    >
      <Row>
        <IssueAnchor fieldName="diseases" description="Preset diseases" />
        <Field
          name="diseases"
          component={CheckboxGroup}
          label="Select diseases to include"
          options={diseaseOptions}
        />
      </Row>
    </Section>
    <Section
      title="Focal Position"
      layout="vertical"
      summary={<p>Select which family members are the focus of this preset.</p>}
    >
      <Row>
        <IssueAnchor fieldName="focal" description="Focal position" />
        <ValidatedField
          name="focal"
          component={Select}
          validation={{ required: true }}
          componentProps={{
            label: 'Focal position',
            options: FOCAL_POSITION_OPTIONS,
            placeholder: 'Select a focal position...',
          }}
        />
      </Row>
    </Section>
  </>
);

export default PresetFields;
