import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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
const messages = defineMessages({
  skipLogicAction: {
    id: 'architect.sections.fields.skipLogicFields.skipLogicAction',
    defaultMessage: 'Skip Logic Action',
    description:
      'The description text in components / sections / fields / SkipLogicFields.',
  },
  action: {
    id: 'architect.sections.fields.skipLogicFields.action',
    defaultMessage: 'Action',
    description:
      'The label text in components / sections / fields / SkipLogicFields.',
  },
  whatShouldHappenWhenTheRules: {
    id: 'architect.sections.fields.skipLogicFields.whatShouldHappenWhenTheRules',
    defaultMessage: 'What should happen when the rules match?',
    description:
      'The hint text in components / sections / fields / SkipLogicFields.',
  },
  showThisStage: {
    id: 'architect.sections.fields.skipLogicFields.showThisStage',
    defaultMessage: 'Show this stage',
    description:
      'The label text in components / sections / fields / SkipLogicFields.',
  },
  skipThisStage: {
    id: 'architect.sections.fields.skipLogicFields.skipThisStage',
    defaultMessage: 'Skip this stage',
    description:
      'The label text in components / sections / fields / SkipLogicFields.',
  },
  skipLogicRules: {
    id: 'architect.sections.fields.skipLogicFields.skipLogicRules',
    defaultMessage: 'Skip Logic Rules',
    description:
      'The description text in components / sections / fields / SkipLogicFields.',
  },
  rules: {
    id: 'architect.sections.fields.skipLogicFields.rules',
    defaultMessage: 'Rules',
    description:
      'The label text in components / sections / fields / SkipLogicFields.',
  },
  createOneOrMoreRulesTo: {
    id: 'architect.sections.fields.skipLogicFields.createOneOrMoreRulesTo',
    defaultMessage:
      'Create one or more rules to determine when the action should occur.',
    description:
      'The hint text in components / sections / fields / SkipLogicFields.',
  },
  skipLogicDestination: {
    id: 'architect.sections.fields.skipLogicFields.skipLogicDestination',
    defaultMessage: 'Skip Logic Destination',
    description:
      'The description text in components / sections / fields / SkipLogicFields.',
  },
});

type SkipLogicFieldsProps = Pick<
  StageEditorSectionProps,
  'stagePath' | 'stagePosition'
>;

const SkipLogicFields = ({
  stagePath,
  stagePosition,
}: SkipLogicFieldsProps) => {
  const intl = useAppIntl();
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
        description={intl.formatMessage(messages.skipLogicAction)}
      />
      <ArchitectField
        name="skipLogic.action"
        label={intl.formatMessage(messages.action)}
        hint={intl.formatMessage(messages.whatShouldHappenWhenTheRules)}
        component={RadioGroupField}
        initialValue={initialAction}
        validation={{ required: true }}
        options={[
          { value: 'SHOW', label: intl.formatMessage(messages.showThisStage) },
          { value: 'SKIP', label: intl.formatMessage(messages.skipThisStage) },
        ]}
      />

      <IssueAnchor
        fieldName="skipLogic.filter"
        description={intl.formatMessage(messages.skipLogicRules)}
      />
      <ArchitectField
        name="skipLogic.filter"
        label={intl.formatMessage(messages.rules)}
        hint={intl.formatMessage(messages.createOneOrMoreRulesTo)}
        component={QueryField}
        initialValue={initialFilter}
        validation={{
          required: true,
          validator: (value: unknown) => ruleValidator(value, intl),
        }}
      />
      <IssueAnchor
        fieldName="skipLogic.destination"
        description={intl.formatMessage(messages.skipLogicDestination)}
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
