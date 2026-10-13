import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import InteractionModeField from '../../fields/InteractionModeField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { binBehavioursMessages } from './binBehavioursMessages.ts';

const INTERACTION_MODE_FIELD = 'behaviours.interactionMode';

/**
 * How the participant places nodes on an Ordinal or Categorical Bin stage
 * (#1652). The two interfaces share one `behaviours` object, so they share
 * this section too.
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
    </BuilderSection>
  );
}
