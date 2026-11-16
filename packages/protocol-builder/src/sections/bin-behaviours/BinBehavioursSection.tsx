import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import InteractionModeField from '../../fields/InteractionModeField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { binBehavioursMessages } from './binBehavioursMessages.ts';

const INTERACTION_MODE_FIELD = 'behaviours.interactionMode';
const REQUIRE_COMPLETE_PLACEMENT_FIELD = 'behaviours.requireCompletePlacement';

/**
 * How the participant places nodes on an Ordinal or Categorical Bin stage
 * (#1652), and whether they must place every one (#1428). The two interfaces
 * share one `behaviours` object, so they share this section too.
 *
 * The completion gate starts off, which keeps today's behaviour: Next pulses
 * once every node is placed and is never blocked. Switched on, the participant
 * cannot leave a prompt with a node still in the drawer, and is told so in
 * words the stage's built-in wording holds (see `BinWordingSection`).
 */
export default function BinBehavioursSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(binBehavioursMessages.title)}
      description={intl.formatMessage(binBehavioursMessages.description)}
    >
      <Field<typeof InteractionModeField>
        name={INTERACTION_MODE_FIELD}
        component={InteractionModeField}
        label={intl.formatMessage(binBehavioursMessages.interactionModeLabel)}
      />
      <Field<typeof ToggleField>
        name={REQUIRE_COMPLETE_PLACEMENT_FIELD}
        component={ToggleField}
        label={intl.formatMessage(
          binBehavioursMessages.requireCompletePlacementLabel,
        )}
        hint={intl.formatMessage(
          binBehavioursMessages.requireCompletePlacementHint,
        )}
        inline
      />
    </BuilderSection>
  );
}
