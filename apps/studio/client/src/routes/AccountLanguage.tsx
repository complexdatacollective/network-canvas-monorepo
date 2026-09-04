import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import LanguageChoice from '../i18n/LanguageChoice.tsx';

/**
 * `/account/language` (§5.3): the language Studio itself speaks to this
 * researcher.
 *
 * The choice is a preference, not a mode: "Automatic" is a real value meaning
 * "follow this browser", stored as `null`, and it is what a researcher who has
 * never chosen already has. Choosing saves immediately — there is nothing to
 * submit, because a language a researcher can see they have selected but has
 * not been applied is a worse state than either end.
 *
 * The control itself is `LanguageChoice`, which `/no-team` renders too: this
 * screen is the one a researcher navigates to, not the only place the choice
 * has to be offered.
 */

const messages = defineMessages({
  heading: {
    id: 'studio.accountLanguage.heading',
    defaultMessage: 'Language',
    description:
      "Heading of the account screen where the researcher chooses Studio's own language.",
  },
  intro: {
    id: 'studio.accountLanguage.intro',
    defaultMessage:
      'The language Studio speaks to you: its navigation, forms, and messages. This is a separate choice from the languages a protocol offers its participants, which each study sets for itself.',
    description:
      "Explanation under the language screen's heading, distinguishing the interface language from a protocol's participant languages.",
  },
});

export default function AccountLanguage() {
  const intl = useAppIntl();

  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.intro)}
        </Paragraph>
      </div>

      <Surface spacing="lg">
        <LanguageChoice />
      </Surface>
    </div>
  );
}
