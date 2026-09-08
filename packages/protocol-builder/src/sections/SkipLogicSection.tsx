import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';

import SkipLogicDestinationField from '../fields/SkipLogicDestinationField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { NO_RULES_MESSAGE } from '../rules/ruleSet.ts';
import { QueryRuleSetField } from '../rules/RuleSetField.tsx';
import { useRuleSetValidation } from '../rules/useRuleSetValidation.ts';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';

/** Where the schema keeps a stage's skip-logic rules. */
const SKIP_LOGIC_RULES_FIELD = 'skipLogic.filter';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.skipLogic.title',
    defaultMessage: 'Skip logic',
    description:
      'Heading of the section where a researcher decides whether one step of an interview runs at all.',
  },
  description: {
    id: 'protocolBuilder.skipLogic.description',
    defaultMessage:
      'Determine whether this stage is shown, and where the interview continues when it is skipped.',
    description:
      'Description of the skip-logic section. A stage is one step of an interview.',
  },
  actionLabel: {
    id: 'protocolBuilder.skipLogic.actionLabel',
    defaultMessage: 'Action',
    description:
      'Label of the control where a researcher says what skip logic does when its rules match: show the stage, or skip it.',
  },
  actionHint: {
    id: 'protocolBuilder.skipLogic.actionHint',
    defaultMessage: 'What should happen when the rules match?',
    description:
      'Guidance under the control where a researcher says what skip logic does when its rules match.',
  },
  showAction: {
    id: 'protocolBuilder.skipLogic.showAction',
    defaultMessage: 'Show this stage',
    description:
      'Choice offered to a researcher: when the skip-logic rules match, this step of the interview runs.',
  },
  skipAction: {
    id: 'protocolBuilder.skipLogic.skipAction',
    defaultMessage: 'Skip this stage',
    description:
      'Choice offered to a researcher: when the skip-logic rules match, this step of the interview is passed over.',
  },
  rulesLabel: {
    id: 'protocolBuilder.skipLogic.rulesLabel',
    defaultMessage: 'Rules',
    description:
      'Label of the rule builder inside the skip-logic section, where a researcher writes the rules that decide whether the stage runs.',
  },
  rulesHint: {
    id: 'protocolBuilder.skipLogic.rulesHint',
    defaultMessage:
      'Create one or more rules to determine when the action should occur.',
    description:
      'Guidance under the rule builder inside the skip-logic section.',
  },
  destinationLabel: {
    id: 'protocolBuilder.skipLogic.destinationLabel',
    defaultMessage: 'When this stage is skipped',
    description:
      'Label of the control where a researcher chooses where the interview carries on after this step is passed over.',
  },
  destinationHint: {
    id: 'protocolBuilder.skipLogic.destinationHint',
    defaultMessage:
      'Choose where the interview should continue. Only later stages can be selected.',
    description:
      'Guidance under the control where a researcher chooses where the interview carries on after this step is passed over. A stage is one step of an interview.',
  },
  clearTitle: {
    id: 'protocolBuilder.skipLogic.clearTitle',
    defaultMessage: 'This will clear your skip logic',
    description:
      'Title of the confirmation asked before switching skip logic off, which throws away every rule in it.',
  },
  clearDescription: {
    id: 'protocolBuilder.skipLogic.clearDescription',
    defaultMessage:
      'This will clear your skip logic, and delete any rules you have created. Do you want to continue?',
    description:
      'Body of the confirmation asked before switching skip logic off, which throws away every rule in it.',
  },
  clearConfirm: {
    id: 'protocolBuilder.skipLogic.clearConfirm',
    defaultMessage: 'Clear skip logic',
    description:
      'Action that confirms switching skip logic off and discarding its rules.',
  },
});

/**
 * Skip logic is one value of the stage with three parts, and it is all or
 * nothing: the protocol schema requires an action and a rule set together, so
 * a stage cannot hold half of it. Switching the capability off therefore
 * removes all three, leaving `skipLogic` absent rather than an object with
 * pieces missing.
 */
const SKIP_LOGIC_CAPABILITY: SectionCapability = {
  fields: ['skipLogic.action', SKIP_LOGIC_RULES_FIELD, 'skipLogic.destination'],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

export type SkipLogicSectionProps = Readonly<{
  /**
   * Where a stage being created will be inserted, counting from zero.
   *
   * Only a stage the interview does not contain yet needs this: an existing
   * stage's position is read from the stage order. It decides which stages are
   * later than this one, and so which of them the interview may continue at.
   */
  position?: number;
}>;

/**
 * Whether this stage runs, and what happens when it does not.
 *
 * One of the three sections every stage editor composes, and the only one that
 * is a capability: a stage without skip logic always runs, which is what most
 * stages do, so the researcher switches it on to say otherwise.
 *
 * The rules and the destination both read the protocol — the codebook for what
 * a rule can ask about, the stage order for where the interview may continue —
 * through the editor's own context. Nothing here takes a stage path, a
 * selector, or a host store.
 */
export default function SkipLogicSection({ position }: SkipLogicSectionProps) {
  const intl = useAppIntl();
  const rulesValidation = useRuleSetValidation(SKIP_LOGIC_RULES_FIELD, 'query');

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      capability={SKIP_LOGIC_CAPABILITY}
    >
      <ProtocolField<typeof RadioGroupField>
        name="skipLogic.action"
        label={intl.formatMessage(messages.actionLabel)}
        hint={intl.formatMessage(messages.actionHint)}
        component={RadioGroupField}
        options={[
          { value: 'SHOW', label: intl.formatMessage(messages.showAction) },
          { value: 'SKIP', label: intl.formatMessage(messages.skipAction) },
        ]}
        required
      />
      <ProtocolField<typeof QueryRuleSetField>
        name={SKIP_LOGIC_RULES_FIELD}
        label={intl.formatMessage(messages.rulesLabel)}
        hint={intl.formatMessage(messages.rulesHint)}
        component={QueryRuleSetField}
        // The rule set's own words for holding nothing, so a capability
        // switched on and left empty is refused in the same sentence as one
        // whose last rule was deleted.
        required={NO_RULES_MESSAGE}
        custom={rulesValidation}
      />
      <ProtocolField<typeof SkipLogicDestinationField>
        name="skipLogic.destination"
        label={intl.formatMessage(messages.destinationLabel)}
        hint={intl.formatMessage(messages.destinationHint)}
        component={SkipLogicDestinationField}
        position={position}
      />
    </BuilderSection>
  );
}
