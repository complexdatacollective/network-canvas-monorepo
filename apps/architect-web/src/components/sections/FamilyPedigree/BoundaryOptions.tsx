import { FormSection } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

const BOUNDARY_REQUIREMENT_OPTIONS = [
  { value: 'required', label: 'Required' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'off', label: 'Off' },
];

const BoundaryOptions = (_props: StageEditorSectionProps) => (
  <Section
    title="Boundary Options"
    summary={
      <p>
        Configure whether participants must include grandparents and children
        who contribute to the family tree.
      </p>
    }
  >
    <FormSection name="boundaries">
      <Row>
        <IssueAnchor
          fieldName="boundaries.requireGrandparents"
          description="Require Grandparents"
        />
        <ValidatedField
          name="requireGrandparents"
          component={NativeSelect}
          validation={{}}
          componentProps={{
            label: 'Require Grandparents',
            options: BOUNDARY_REQUIREMENT_OPTIONS,
            placeholder: 'Select an option',
          }}
        />
      </Row>
      <Row>
        <IssueAnchor
          fieldName="boundaries.requireChildrenContributors"
          description="Require Children Contributors"
        />
        <ValidatedField
          name="requireChildrenContributors"
          component={NativeSelect}
          validation={{}}
          componentProps={{
            label: 'Require Children Contributors',
            options: BOUNDARY_REQUIREMENT_OPTIONS,
            placeholder: 'Select an option',
          }}
        />
      </Row>
    </FormSection>
  </Section>
);

export default BoundaryOptions;
