import type { ComponentType } from 'react';
import { Field, FormSection } from 'redux-form';

import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import FrescoReduxField from '~/components/Form/FrescoReduxField';

const FrescoBooleanControl = FrescoBooleanField as ComponentType<
  Record<string, unknown>
>;

const RemoveAfterConsideration = () => (
  <Section
    title="Remove After Consideration"
    summary={
      <Paragraph>
        This toggle determines if a node should continue to be shown in the bin
        after it has been the main focal node. If it is set to true, the node
        will be removed from the pool after it has been shown in the primary
        position for consideration.
      </Paragraph>
    }
  >
    <Row>
      <FormSection name="behaviours">
        <Field
          name="removeAfterConsideration"
          component={FrescoReduxField}
          fieldComponent={FrescoBooleanControl}
          label="Remove after consideration"
          options={[
            {
              value: true,
              label: 'Yes, remove after consideration',
            },
            {
              value: false,
              label: 'No, keep in bin after consideration',
            },
          ]}
          noReset
        />
      </FormSection>
    </Row>
  </Section>
);
export default RemoveAfterConsideration;
