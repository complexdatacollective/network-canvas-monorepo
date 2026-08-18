import { useSelector } from 'react-redux';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import type { SkipLogicDestination } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import { ruleValidator } from '~/components/Query';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
import { getStageList } from '~/selectors/protocol';

import IssueAnchor from '../../IssueAnchor';
import { QueryField, type RuleSetValue } from './RuleSetFields';
import SkipLogicDestinationField from './SkipLogicDestinationField';

type SkipLogicFieldsProps = Pick<
  StageEditorSectionProps,
  'stagePath' | 'stagePosition'
>;

const SkipLogicFields = ({
  stagePath,
  stagePosition,
}: SkipLogicFieldsProps) => {
  const stages = useSelector(getStageList);
  // Without an initialValue a field registers empty, so an existing stage's
  // committed skip logic would render blank — and save (which overwrites from
  // the registered fields) would then discard it.
  const initialAction = useStageInitialValue<string>('skipLogic.action');
  const initialFilter = useStageInitialValue<RuleSetValue>('skipLogic.filter');
  const initialDestination = useStageInitialValue<SkipLogicDestination>(
    'skipLogic.destination',
  );

  return (
    <>
      <IssueAnchor
        fieldName="skipLogic.action"
        description="Skip Logic Action"
      />
      <ArchitectField
        name="skipLogic.action"
        label="Action"
        hint="What should happen when the rules match?"
        component={RadioGroupField}
        initialValue={initialAction}
        validation={{ required: true }}
        options={[
          { value: 'SHOW', label: 'Show this stage' },
          { value: 'SKIP', label: 'Skip this stage' },
        ]}
      />

      <IssueAnchor
        fieldName="skipLogic.filter"
        description="Skip Logic Rules"
      />
      <ArchitectField
        name="skipLogic.filter"
        label="Rules"
        hint="Create one or more rules to determine when the action should occur."
        component={QueryField}
        initialValue={initialFilter}
        validation={{ required: true, validator: ruleValidator }}
      />
      <IssueAnchor
        fieldName="skipLogic.destination"
        description="Skip Logic Destination"
      />
      <SkipLogicDestinationField
        initialValue={initialDestination}
        stages={stages}
        stagePosition={stagePosition}
        isNewStage={stagePath === null}
      />
    </>
  );
};

export default SkipLogicFields;
