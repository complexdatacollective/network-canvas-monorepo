import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedRichTextField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { finishSessionMessages } from './finishSessionMessages.ts';
import { useFinishMode } from './useFinishMode.ts';

const CONTENT_FIELD = 'content';

/**
 * The text a participant reads before finishing the interview, heading
 * included: the text is markdown, and its first line is usually a heading.
 *
 * Only a stage that asks participants to confirm has a closing screen, so the
 * section is absent in automatic mode. A protocol whose confirming finish
 * stage has no closing text in its default language cannot be downloaded; the
 * schema still accepts one while the protocol is being written, because a new
 * protocol in a language Network Canvas supplies no closing text for starts
 * with none.
 */
export default function ClosingScreenSection() {
  const intl = useAppIntl();
  const finishMode = useFinishMode();

  if (finishMode !== 'confirmation') return null;

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.closingTitle)}
      description={intl.formatMessage(
        finishSessionMessages.closingScreenDescription,
      )}
    >
      <Field<typeof LocalizedRichTextField>
        name={CONTENT_FIELD}
        component={LocalizedRichTextField}
        label={intl.formatMessage(finishSessionMessages.closingTextLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
