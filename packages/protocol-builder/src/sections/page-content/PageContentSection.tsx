import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { informationStage } from '@codaco/protocol-validation';

import { LocalizedRichTextField } from '../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { markdownTextShapeAt } from '../../localization/textShape.ts';
import BuilderSection from '../BuilderSection.tsx';

export const pageContentMessages = defineMessages({
  pageTitle: {
    id: 'protocolBuilder.pageContent.pageTitle',
    defaultMessage: 'Page content',
    description:
      'Heading of the section where a researcher builds a page of text and media that a participant reads instead of doing a task.',
  },
  contentDescription: {
    id: 'protocolBuilder.pageContent.contentDescription',
    defaultMessage:
      'Write the page participants will read. Use the toolbar to add headings, and to insert images, audio and video where they should appear.',
    description:
      'Description of the section where a researcher writes a page a participant reads instead of doing a task. The page is written in one text editor whose toolbar formats the text and inserts media files between its paragraphs.',
  },
  contentPlaceholder: {
    id: 'protocolBuilder.pageContent.contentPlaceholder',
    defaultMessage: 'Write your page here...',
    description:
      'Placeholder shown in the empty text editor where a researcher writes a page a participant reads. The trailing dots are an ellipsis written as three full stops.',
  },
});

const CONTENT_FIELD = 'content';

// What the page's text may hold, read from the stage's own declaration: text
// of several lines, with files of the protocol as blocks among them.
const CONTENT_SHAPE = markdownTextShapeAt(informationStage, [CONTENT_FIELD]);

/**
 * A page of content the participant reads, rather than a task they do.
 *
 * The stage IS the page, and the page is one text: its heading is a heading
 * in it, and each image, audio recording or video sits in it where the
 * participant meets it. So the section is one editor, and what it offers is
 * what the field declares (`CONTENT_SHAPE`).
 *
 * The field's label is the section's heading, which already names it.
 */
export default function PageContentSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(pageContentMessages.pageTitle)}
      description={intl.formatMessage(pageContentMessages.contentDescription)}
    >
      <Field<typeof LocalizedRichTextField>
        name={CONTENT_FIELD}
        component={LocalizedRichTextField}
        shape={CONTENT_SHAPE}
        dynamicValues="stageText"
        label={intl.formatMessage(pageContentMessages.pageTitle)}
        labelHidden
        placeholder={intl.formatMessage(pageContentMessages.contentPlaceholder)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
