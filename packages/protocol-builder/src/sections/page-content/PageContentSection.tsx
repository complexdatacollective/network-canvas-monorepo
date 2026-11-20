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
    defaultMessage: 'Content',
    description:
      'Heading of the section where a researcher builds a page of text and media that a participant reads instead of doing a task.',
  },
  contentDescription: {
    id: 'protocolBuilder.pageContent.contentDescription',
    defaultMessage:
      'Create the content that participants will see on this stage.',
    description:
      'Description of the section where a researcher writes a page a participant reads instead of doing a task.',
  },
  contentLabel: {
    id: 'protocolBuilder.pageContent.contentLabel',
    defaultMessage: 'Rich Text',
    description:
      'Label of the text editor where a researcher writes a page a participant reads. Rich text is text that can hold headings, formatting and media files, as opposed to plain text.',
  },
  contentHint: {
    id: 'protocolBuilder.pageContent.contentHint',
    defaultMessage:
      'Use the toolbar to add headings and format text, as well as to insert images, audio and video.',
    description:
      'Guidance under the label of the text editor where a researcher writes a page a participant reads. The toolbar is the row of buttons above the text; it formats the text and inserts media files between its paragraphs.',
  },
  contentPlaceholder: {
    id: 'protocolBuilder.pageContent.contentPlaceholder',
    defaultMessage: 'Type your page content...',
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
 */
export default function PageContentSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      sectionKey="page-content"
      title={intl.formatMessage(pageContentMessages.pageTitle)}
      description={intl.formatMessage(pageContentMessages.contentDescription)}
    >
      <Field<typeof LocalizedRichTextField>
        name={CONTENT_FIELD}
        component={LocalizedRichTextField}
        shape={CONTENT_SHAPE}
        dynamicValues="stageText"
        label={intl.formatMessage(pageContentMessages.contentLabel)}
        hint={intl.formatMessage(pageContentMessages.contentHint)}
        placeholder={intl.formatMessage(pageContentMessages.contentPlaceholder)}
        required={REQUIRED}
      />
    </BuilderSection>
  );
}
