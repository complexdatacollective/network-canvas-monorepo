import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import FrescoBooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  nodeAvailability: {
    id: 'architect.sections.oneToManyDyadCensus.removeAfterConsideration.nodeAvailability',
    defaultMessage: 'Node availability',
    description:
      'The title text in components / sections / OneToManyDyadCensus / RemoveAfterConsideration.',
  },
  chooseWhetherAFocalNodeRemains: {
    id: 'architect.sections.oneToManyDyadCensus.removeAfterConsideration.chooseWhetherAFocalNodeRemains',
    defaultMessage:
      'Choose whether a focal node remains available after it has been considered.',
    description:
      'The description text in components / sections / OneToManyDyadCensus / RemoveAfterConsideration.',
  },
  removalBehavior: {
    id: 'architect.sections.oneToManyDyadCensus.removeAfterConsideration.removalBehavior',
    defaultMessage: 'Removal behavior',
    description:
      'The label text in components / sections / OneToManyDyadCensus / RemoveAfterConsideration.',
  },
  yesRemoveAfterConsideration: {
    id: 'architect.sections.oneToManyDyadCensus.removeAfterConsideration.yesRemoveAfterConsideration',
    defaultMessage: 'Yes, remove after consideration',
    description:
      'The label text in components / sections / OneToManyDyadCensus / RemoveAfterConsideration.',
  },
  noKeepInBinAfterConsideration: {
    id: 'architect.sections.oneToManyDyadCensus.removeAfterConsideration.noKeepInBinAfterConsideration',
    defaultMessage: 'No, keep in bin after consideration',
    description:
      'The label text in components / sections / OneToManyDyadCensus / RemoveAfterConsideration.',
  },
});

const RemoveAfterConsideration = () => {
  const intl = useAppIntl();
  const initialValue = useStageInitialValue<boolean>(
    'behaviours.removeAfterConsideration',
  );
  return (
    <Section
      title={intl.formatMessage(messages.nodeAvailability)}
      description={intl.formatMessage(messages.chooseWhetherAFocalNodeRemains)}
    >
      <ArchitectField
        name="behaviours.removeAfterConsideration"
        component={FrescoBooleanField}
        initialValue={initialValue}
        label={intl.formatMessage(messages.removalBehavior)}
        options={[
          {
            value: true,
            label: intl.formatMessage(messages.yesRemoveAfterConsideration),
          },
          {
            value: false,
            label: intl.formatMessage(messages.noKeepInBinAfterConsideration),
          },
        ]}
        noReset
      />
    </Section>
  );
};
export default RemoveAfterConsideration;
