import { createElement, type ReactNode, useCallback, useId } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import {
  LocalizedInputField,
  LocalizedRichTextField,
} from '@codaco/protocol-builder/fields/LocalizedStringField';
import {
  asLocalizedString,
  resolveTranslation,
} from '@codaco/protocol-builder/localization/localizedText';
import {
  ProtocolLocalizationProvider,
  useEditingLanguage,
} from '@codaco/protocol-builder/localization/ProtocolLocalization';
import {
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringFormat,
  messageText,
} from '@codaco/protocol-validation';
import DialogForm, {
  type DialogFormProps,
} from '~/components/DialogForm/DialogForm';
import type { LenientSubmitHandler } from '~/components/DialogForm/formLevelValidate';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppSelector } from '~/ducks/hooks';
import { getLocalization } from '~/selectors/protocol';
import { cx } from '~/utils/cva';
import { UNSPECIFIED_LOCALE } from '~/utils/localizedText';

import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  textLabel: {
    id: 'architect.localization.missingTranslations.textLabel',
    defaultMessage: 'Text',
    description:
      'Label of the field, in the dialog opened from the list of missing translations, where a text is written in each of the protocol’s languages.',
  },
  participantView: {
    id: 'architect.localization.missingTranslations.participantView',
    defaultMessage: 'What participants see',
    description:
      'Heading beside the translation field, above the text participants see in each of the protocol’s languages.',
  },
  defaultLanguage: {
    id: 'architect.localization.missingTranslations.defaultLanguage',
    defaultMessage: 'Default',
    description:
      'Badge beside the name of the protocol’s default language, in the list of what participants see in each language.',
  },
  editingLanguage: {
    id: 'architect.localization.missingTranslations.editingLanguage',
    defaultMessage: 'Editing',
    description:
      'Badge beside the name of the language the translation field is currently editing, in the list of what participants see in each language.',
  },
  notTranslated: {
    id: 'architect.localization.missingTranslations.notTranslated',
    defaultMessage: 'Not translated yet. Shown in {fallback}.',
    description:
      'Note under the text participants see in a language the text has no translation for. fallback is the language of the text they see instead.',
  },
  notTranslatedUnspecified: {
    id: 'architect.localization.missingTranslations.notTranslatedUnspecified',
    defaultMessage: 'Not translated yet.',
    description:
      'Note under the text participants see in a language the text has no translation for, when the text they see instead is in a language the protocol has not identified yet, or when there is no text at all.',
  },
});

// Participants see a heading in this text, but here it sits beside the field
// and must not add to the dialog's outline, so it keeps a heading's look only.
const headingLookalike =
  (level: 'h1' | 'h2' | 'h3' | 'h4') =>
  ({ children }: { children?: ReactNode }) => (
    <Heading level={level} render={<p />}>
      {children}
    </Heading>
  );

const markdownHeadings = {
  h1: headingLookalike('h1'),
  h2: headingLookalike('h2'),
  h3: headingLookalike('h3'),
  h4: headingLookalike('h4'),
  h5: headingLookalike('h4'),
  h6: headingLookalike('h4'),
};

const ParticipantText = ({
  text,
  format,
}: {
  text: string;
  format: LocalizedStringFormat;
}) =>
  format === 'markdown' ? (
    <RenderMarkdown
      allowedElements={
        text.includes('\n') ? ALLOWED_MARKDOWN_SECTION_TAGS : undefined
      }
      components={markdownHeadings}
    >
      {text}
    </RenderMarkdown>
  ) : (
    <span className="whitespace-pre-line">{text}</span>
  );

/** The field's live value as each declared language's participants see it. */
const ParticipantView = ({ format }: { format: LocalizedStringFormat }) => {
  const intl = useAppIntl();
  const headingId = useId();
  const languageName = useLanguageName();
  const enclosingLevel = useEnclosingHeadingLevel();
  const { localization, locale: editing } = useEditingLanguage();
  const { value } = useFormValue(['value']);

  if (localization === undefined) return null;

  const headingTag =
    enclosingLevel === null ? 'h3' : headingTagBelow(enclosingLevel);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <Heading
        id={headingId}
        level="h4"
        margin="none"
        render={createElement(headingTag)}
      >
        {intl.formatMessage(messages.participantView)}
      </Heading>
      <ul className="flex flex-col gap-3">
        {localization.locales.map((locale) => {
          const shown = resolveTranslation(value, localization, locale);
          return (
            <li
              key={locale}
              className={cx(
                'flex flex-col gap-2 rounded border p-3',
                locale === editing ? 'border-primary' : 'border-outline',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{languageName(locale)}</span>
                {locale === localization.defaultLocale && (
                  <Badge render={<span />} size="sm" tone="primary">
                    {intl.formatMessage(messages.defaultLanguage)}
                  </Badge>
                )}
                {locale === editing && (
                  <Badge render={<span />} size="sm" appearance="outline">
                    {intl.formatMessage(messages.editingLanguage)}
                  </Badge>
                )}
              </div>
              {shown.text !== '' && (
                <div lang={shown.lang} dir={shown.dir}>
                  <ParticipantText text={shown.text} format={format} />
                </div>
              )}
              {shown.lang !== locale && (
                <p className="text-sm text-current/70">
                  {shown.lang === undefined || shown.lang === UNSPECIFIED_LOCALE
                    ? intl.formatMessage(messages.notTranslatedUnspecified)
                    : intl.formatMessage(messages.notTranslated, {
                        fallback: languageName(shown.lang),
                      })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

type TranslationDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Where the text is, such as "Stage 4 · Language Chooser". */
  place: string;
  /** The text's path below its place, such as "items › 1 › content". */
  fieldPath: string;
  value: LocalizedString;
  format: LocalizedStringFormat;
  /** The language the field edits first. */
  initialLocale: LocaleTag;
  onSave: (value: LocalizedString) => FormSubmissionResult;
  finalFocus: DialogFormProps['finalFocus'];
};

/**
 * Every translation of one participant-facing text, edited together, beside
 * what participants in each of the protocol's languages see while it is typed.
 */
const TranslationDialog = ({
  open,
  onClose,
  place,
  fieldPath,
  value,
  format,
  initialLocale,
  onSave,
  finalFocus,
}: TranslationDialogProps) => {
  const intl = useAppIntl();
  const localization = useAppSelector(getLocalization);

  const handleSubmit = useCallback<LenientSubmitHandler>(
    // A required field never submits without a translation, so an empty map
    // only reaches the save when the form held something unexpected, which the
    // protocol refuses.
    (values) => onSave(asLocalizedString(values.value) ?? {}),
    [onSave],
  );

  const fieldProps = {
    name: 'value',
    label: intl.formatMessage(messages.textLabel),
    initialValue: value,
    validation: { required: true },
  };

  return (
    <ProtocolLocalizationProvider
      localization={localization}
      initialLocale={initialLocale}
    >
      <DialogForm
        open={open}
        onClose={onClose}
        title={
          <>
            <span className="block">{place}</span>{' '}
            <span
              dir="ltr"
              className="font-monospace block text-sm font-normal text-current/70"
            >
              {fieldPath}
            </span>
          </>
        }
        formId="translation-dialog"
        submitLabel={intl.formatMessage(commonMessages.save)}
        onSubmit={handleSubmit}
        finalFocus={finalFocus}
        aside={<ParticipantView format={format} />}
      >
        {format === 'markdown' ? (
          <ArchitectField
            {...fieldProps}
            component={LocalizedRichTextField}
            singleLine={Object.values(value).every(
              (message) => !messageText(message).includes('\n'),
            )}
          />
        ) : (
          <ArchitectField {...fieldProps} component={LocalizedInputField} />
        )}
      </DialogForm>
    </ProtocolLocalizationProvider>
  );
};

export default TranslationDialog;
