import { Field, FormSection } from 'redux-form';

import { Row, Section } from '~/components/EditorLayout';
import { Toggle } from '~/components/Form/Fields';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

const Behaviours = (_props: StageEditorSectionProps) => (
  <Section title="Behaviours">
    <FormSection name="behaviours">
      <Row>
        <IssueAnchor
          fieldName="allowFocalReselection"
          description="Allow focal reselection"
        />
        <h4>Allow focal reselection</h4>
        <Field
          name="allowFocalReselection"
          label="Allow the participant to change the focal position during the interview"
          component={Toggle}
        />
      </Row>
    </FormSection>
  </Section>
);

export default Behaviours;
