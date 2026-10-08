import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { localizedMaxLength } from '../../../fields/localizedMaxLength.ts';
import { LocalizedRichTextField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { finishSessionMessages } from './finishSessionMessages.ts';

const TITLE_FIELD = 'title';
const CONTENT_FIELD = 'content';

/** A heading, so it has to read as one rather than as a paragraph. */
const TITLE_LIMIT = 50;

/**
 * The heading and text of the screen that ends the interview.
 *
 * Not a capability: a protocol whose finish stage has no heading or text in
 * its default language cannot be downloaded. The schema still accepts one
 * while the protocol is being written, because a new protocol in a language
 * Network Canvas supplies no closing text for starts with none. The heading is markdown restricted to one
 * line, because the interview renders its emphasis inside the heading and
 * nothing else.
 */
export default function ClosingScreenSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(finishSessionMessages.closingTitle)}
      description={intl.formatMessage(finishSessionMessages.closingDescription)}
    >
      <Field<typeof LocalizedRichTextField>
        name={TITLE_FIELD}
        component={LocalizedRichTextField}
        label={intl.formatMessage(finishSessionMessages.headingLabel)}
        singleLine
        required={REQUIRED}
        custom={localizedMaxLength(TITLE_LIMIT, intl)}
      />
      <Field<typeof LocalizedRichTextField>
        name={CONTENT_FIELD}
        component={LocalizedRichTextField}
        label={intl.formatMessage(finishSessionMessages.textLabel)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
