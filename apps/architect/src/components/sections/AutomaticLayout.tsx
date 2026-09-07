import type { ComponentProps } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';

const configMessages = defineMessages({
  manualMode: {
    id: 'architect.sections.automaticLayout.config.manualMode',
    defaultMessage: 'Manual mode',
    description:
      'Presentation label or description in components/sections/AutomaticLayout.tsx. Identifiers are not translated.',
  },
  placesAllNodesInABucket: {
    id: 'architect.sections.automaticLayout.config.placesAllNodesInABucket',
    defaultMessage:
      'Places all nodes in a "bucket" at the bottom of the screen, from which the participant drags each one to where they want it.',
    description:
      'Presentation label or description in components/sections/AutomaticLayout.tsx. Identifiers are not translated.',
  },
  automaticMode: {
    id: 'architect.sections.automaticLayout.config.automaticMode',
    defaultMessage: 'Automatic mode',
    description:
      'Presentation label or description in components/sections/AutomaticLayout.tsx. Identifiers are not translated.',
  },
  positionsNodesWhenTheStageFirst: {
    id: 'architect.sections.automaticLayout.config.positionsNodesWhenTheStageFirst',
    defaultMessage:
      'Positions nodes when the stage first opens by simulating physical forces such as attraction and repulsion. The participant can pause and resume the simulation, and reposition nodes by hand while it is paused.',
    description:
      'Presentation label or description in components/sections/AutomaticLayout.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  sociogramLayout: {
    id: 'architect.sections.automaticLayout.sociogramLayout',
    defaultMessage: 'Sociogram layout',
    description: 'The title text in components / sections / AutomaticLayout.',
  },
  chooseHowNodesArePositionedWhen: {
    id: 'architect.sections.automaticLayout.chooseHowNodesArePositionedWhen',
    defaultMessage: 'Choose how nodes are positioned when the stage opens.',
    description:
      'The description text in components / sections / AutomaticLayout.',
  },
  layoutMode: {
    id: 'architect.sections.automaticLayout.layoutMode',
    defaultMessage: 'Layout mode',
    description: 'The label text in components / sections / AutomaticLayout.',
  },
  howInterviewerPositionsNodesOnThe: {
    id: 'architect.sections.automaticLayout.howInterviewerPositionsNodesOnThe',
    defaultMessage:
      'How Interviewer positions nodes on the sociogram when the stage opens.',
    description: 'The hint text in components / sections / AutomaticLayout.',
  },
});

const FIELD_PATH = 'behaviours.automaticLayout';

const MANUAL = 'manual';
const AUTOMATIC = 'automatic';

const LAYOUT_MODE_OPTIONS: MessageConfig<RichSelectOption>[] = [
  {
    value: MANUAL,
    label: configMessages.manualMode,
    description: configMessages.placesAllNodesInABucket,
  },
  {
    value: AUTOMATIC,
    label: configMessages.automaticMode,
    description: configMessages.positionsNodesWhenTheStageFirst,
  },
];

type LayoutModeFieldProps = Omit<
  ComponentProps<typeof RichSelectGroupField>,
  'value' | 'onChange' | 'options'
> & {
  value?: boolean;
  onChange?: (value: boolean) => void;
};

/**
 * The stage stores this choice as a boolean, but the card group speaks option
 * values, so this field bridges the two — the fresco-ui form store has no
 * `format`/`parse` hook of its own.
 */
const LayoutModeField = ({
  value,
  onChange,
  ...props
}: LayoutModeFieldProps) => {
  const intl = useAppIntl();
  return (
    <RichSelectGroupField
      {...props}
      options={formatConfig(LAYOUT_MODE_OPTIONS, intl)}
      value={value ? AUTOMATIC : MANUAL}
      onChange={(nextValue) => onChange?.(nextValue === AUTOMATIC)}
    />
  );
};

const AutomaticLayout = () => {
  const intl = useAppIntl();
  // Redux Form omitted an untouched field's value entirely; the interface
  // template seeds `true` for the interfaces that offer this choice, so an
  // absent committed value only happens for a protocol saved before this
  // field existed — fall back to Manual mode rather than silently opting in.
  const initialValue = useStageInitialValue<boolean>(FIELD_PATH) ?? false;

  return (
    <Section
      title={intl.formatMessage(messages.sociogramLayout)}
      description={intl.formatMessage(messages.chooseHowNodesArePositionedWhen)}
    >
      <ArchitectField
        name={FIELD_PATH}
        label={intl.formatMessage(messages.layoutMode)}
        hint={intl.formatMessage(messages.howInterviewerPositionsNodesOnThe)}
        component={LayoutModeField}
        initialValue={initialValue}
        validation={{ required: true }}
      />
    </Section>
  );
};
export default AutomaticLayout;
