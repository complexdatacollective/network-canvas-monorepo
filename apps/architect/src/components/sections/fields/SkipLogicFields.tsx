import type { ComponentType } from 'react';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { Row } from '~/components/EditorLayout';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import {
  Query,
  ruleValidator,
  withFieldConnector,
  withStoreConnector,
} from '~/components/Query';

import IssueAnchor from '../../IssueAnchor';

const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;

const ConnectedQuery = (
  withFieldConnector as unknown as (
    c: ComponentType,
  ) => ComponentType<Record<string, unknown>>
)(
  withStoreConnector(
    Query as unknown as ComponentType,
  ) as unknown as ComponentType,
) as ComponentType<Record<string, unknown>>;

const SkipLogicFields = () => (
  <>
    <Row>
      <IssueAnchor
        fieldName="skipLogic.action"
        description="Skip Logic Action"
      />
      <ValidatedField
        name="skipLogic.action"
        component={FrescoReduxField}
        validation={{ required: true }}
        componentProps={{
          fieldComponent: FrescoRadioGroupField,
          label: 'Skip logic action',
          options: [
            { value: 'SHOW', label: 'Show this stage if' },
            { value: 'SKIP', label: 'Skip this stage if' },
          ],
        }}
      />
    </Row>
    <Row>
      <IssueAnchor
        fieldName="skipLogic.filter"
        description="Skip Logic Rules"
      />
      <ValidatedField
        component={ConnectedQuery}
        name="skipLogic.filter"
        validation={{ required: true, validator: ruleValidator }}
      />
    </Row>
  </>
);

export default SkipLogicFields;
