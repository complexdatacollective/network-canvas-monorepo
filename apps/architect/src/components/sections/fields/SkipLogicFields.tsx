import type { ComponentType } from 'react';
import { useSelector } from 'react-redux';

import { Row } from '~/components/EditorLayout';
import ValidatedField from '~/components/Form/ValidatedField';
import {
  Query,
  ruleValidator,
  withFieldConnector,
  withStoreConnector,
} from '~/components/Query';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { getStageList } from '~/selectors/protocol';

import IssueAnchor from '../../IssueAnchor';
import SkipLogicDestinationField from './SkipLogicDestinationField';
import { SkipLogicRadioGroupReduxField } from './SkipLogicReduxFields';

const ConnectedQuery = (
  withFieldConnector as unknown as (
    c: ComponentType,
  ) => ComponentType<Record<string, unknown>>
)(
  withStoreConnector(
    Query as unknown as ComponentType,
  ) as unknown as ComponentType,
) as ComponentType<Record<string, unknown>>;

type SkipLogicFieldsProps = Pick<
  StageEditorSectionProps,
  'stagePath' | 'stagePosition'
>;

const SkipLogicFields = ({
  stagePath,
  stagePosition,
}: SkipLogicFieldsProps) => {
  const stages = useSelector(getStageList);

  return (
    <>
      <Row>
        <IssueAnchor
          fieldName="skipLogic.action"
          description="Skip Logic Action"
        />
        <ValidatedField
          name="skipLogic.action"
          component={SkipLogicRadioGroupReduxField}
          validation={{ required: true }}
          componentProps={{
            label: 'When the rules match',
            options: [
              { value: 'SHOW', label: 'Show this stage' },
              { value: 'SKIP', label: 'Skip this stage' },
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
      <Row>
        <IssueAnchor
          fieldName="skipLogic.destination"
          description="Skip Logic Destination"
        />
        <SkipLogicDestinationField
          stages={stages}
          stagePosition={stagePosition}
          isNewStage={stagePath === null}
        />
      </Row>
    </>
  );
};

export default SkipLogicFields;
