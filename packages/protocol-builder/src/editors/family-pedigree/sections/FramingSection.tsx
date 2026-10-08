import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { RichSelectOption } from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import {
  FRAMING_SETTINGS,
  type FramingSetting,
} from '@codaco/protocol-validation';

import DefaultChoiceField from '../../../fields/DefaultChoiceField.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';

const FRAMING_FIELD = 'framing';

/** What a stage with no `framing` uses. */
const DEFAULT_FRAMING: FramingSetting = 'gendered';

/**
 * The words the interface uses to describe family members: everyday kinship
 * words, egg parent and sperm parent words, or whichever the participant
 * prefers.
 *
 * `framing` and nothing else. An absent value is the everyday words, so
 * choosing them removes the key rather than writing it: a stage never records a
 * decision nobody made, and opening and saving a stage that has none does not
 * add one. The setting changes only what the participant reads; nothing it
 * produces is stored.
 */
export default function FramingSection() {
  const intl = useAppIntl();

  const options = useMemo<Record<FramingSetting, RichSelectOption>>(
    () => ({
      gendered: {
        value: 'gendered',
        label: intl.formatMessage(messages.framingGenderedLabel),
        description: intl.formatMessage(messages.framingGenderedDescription),
      },
      gamete: {
        value: 'gamete',
        label: intl.formatMessage(messages.framingGameteLabel),
        description: intl.formatMessage(messages.framingGameteDescription),
      },
      participantPreference: {
        value: 'participantPreference',
        label: intl.formatMessage(messages.framingParticipantPreferenceLabel),
        description: intl.formatMessage(
          messages.framingParticipantPreferenceDescription,
        ),
      },
    }),
    [intl],
  );
  // Held for as long as the reader's language does not change: a control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const choices = useMemo(
    () => FRAMING_SETTINGS.map((setting) => options[setting]),
    [options],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.framingTitle)}
      description={intl.formatMessage(messages.framingDescription)}
    >
      <Field<typeof DefaultChoiceField>
        name={FRAMING_FIELD}
        component={DefaultChoiceField}
        label={intl.formatMessage(messages.framingLabel)}
        hint={intl.formatMessage(messages.framingHint)}
        options={choices}
        defaultOption={DEFAULT_FRAMING}
        orientation="vertical"
      />
    </BuilderSection>
  );
}
