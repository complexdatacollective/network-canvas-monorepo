import { Plus } from 'lucide-react';
import {
  motion,
  type Transition,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';
import { Link } from 'wouter';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import RichTextField from '@codaco/protocol-builder/fields/RichTextField';
import {
  getLocaleMetadata,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringFormat,
} from '@codaco/protocol-validation';
import { translationText } from '~/utils/localizedText';

import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  fallbackLabel: {
    id: 'architect.localization.missingTranslations.fallbackLabel',
    defaultMessage:
      'Participants who choose {language} see this {fallback} text instead:',
    description:
      'Caption above a text that has no translation. language is the language the text is missing in; fallback is the language of the text shown below, which participants see in its place.',
  },
  addTranslation: {
    id: 'architect.localization.missingTranslations.addTranslation',
    defaultMessage: 'Add {language} translation',
    description:
      'Button that opens a field for writing the missing translation of the text above it. language is the language of the translation.',
  },
  translationLabel: {
    id: 'architect.localization.missingTranslations.translationLabel',
    defaultMessage: '{language} translation',
    description:
      'Label of the field where a missing translation is written. language is the language of the translation.',
  },
  required: {
    id: 'architect.localization.missingTranslations.required',
    defaultMessage: 'Write the {language} translation before saving.',
    description:
      'Error shown when a missing translation is saved with no text. language is the language of the translation.',
  },
});

type LanguageAttributes = { lang: LocaleTag; dir: 'ltr' | 'rtl' };

const languageAttributes = (locale: LocaleTag): LanguageAttributes => ({
  lang: locale,
  dir: getLocaleMetadata(locale).direction,
});

// The markdown editor takes no `lang` or `dir` of its own, so it is drawn
// inside them, as the stage editors draw it.
const MarkdownTranslationInput = ({
  lang,
  dir,
  ...props
}: ComponentProps<typeof RichTextField> & LanguageAttributes) => (
  <div lang={lang} dir={dir}>
    <RichTextField {...props} />
  </div>
);

// Participants see a heading in this text, but here it sits inside a card and
// must not add to the page's outline, so it keeps a heading's look only.
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

const FallbackText = ({
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

// Mirrors the field into the section's drafts, so text typed here survives
// this card leaving the screen while another language is shown.
const DraftReporter = ({
  onDraftChange,
}: {
  onDraftChange: (text: string) => void;
}) => {
  const { translation } = useFormValue(['translation']);
  useEffect(() => {
    onDraftChange(typeof translation === 'string' ? translation : '');
  }, [translation, onDraftChange]);
  return null;
};

type TranslationEditorProps = {
  locale: LocaleTag;
  format: LocalizedStringFormat;
  singleLine: boolean;
  initialText: string;
  autoFocus: boolean;
  onAutoFocused: () => void;
  onCancel: () => void;
  onSave: (text: string) => FormSubmissionResult;
  onDraftChange: (text: string) => void;
};

const TranslationEditor = ({
  locale,
  format,
  singleLine,
  initialText,
  autoFocus,
  onAutoFocused,
  onCancel,
  onSave,
  onDraftChange,
}: TranslationEditorProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const language = languageName(locale);
  // Read once: the markdown editor is rebuilt whenever `autoFocus` changes.
  const [focusOnMount] = useState(autoFocus);

  useEffect(() => {
    if (focusOnMount) onAutoFocused();
  }, [focusOnMount, onAutoFocused]);

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key !== 'Escape' ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      // A portaled popup (such as the editor's link menu) handles its own Escape.
      !(event.target instanceof Node) ||
      !event.currentTarget.contains(event.target)
    ) {
      return;
    }
    event.preventDefault();
    onCancel();
  };

  const fieldProps = {
    name: 'translation',
    label: intl.formatMessage(messages.translationLabel, { language }),
    required: intl.formatMessage(messages.required, { language }),
    autoFocus: focusOnMount,
    ...languageAttributes(locale),
  };

  return (
    <Form
      initialValues={{ translation: initialText }}
      onSubmit={(values) =>
        onSave(typeof values.translation === 'string' ? values.translation : '')
      }
      onKeyDown={handleKeyDown}
    >
      <DraftReporter onDraftChange={onDraftChange} />
      {format === 'markdown' ? (
        <Field<typeof MarkdownTranslationInput>
          {...fieldProps}
          component={MarkdownTranslationInput}
          singleLine={singleLine}
        />
      ) : (
        <Field {...fieldProps} component={InputField} />
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="text" onClick={onCancel}>
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
        <SubmitButton>{intl.formatMessage(commonMessages.save)}</SubmitButton>
      </div>
    </Form>
  );
};

const CARD_TRANSITION: Transition = {
  type: 'spring',
  duration: 0.3,
  bounce: 0,
};

type MissingTranslationCardProps = {
  value: LocalizedString;
  format: LocalizedStringFormat;
  /** The language the translation is missing in. */
  locale: LocaleTag;
  /** The language participants see instead. */
  fallbackLocale: LocaleTag;
  fieldPath: string;
  fieldHref: string | null;
  editorOpen: boolean;
  initialText: string;
  autoFocus: boolean;
  /** Receives the card's Add button, or its editor while that is open. */
  entryRef: (element: HTMLElement | null) => void;
  onOpen: () => void;
  onAutoFocused: () => void;
  onCancel: () => void;
  onSave: (text: string) => FormSubmissionResult;
  onDraftChange: (text: string) => void;
};

/**
 * One text with no translation in `locale`: what participants see in its
 * place, and a field for writing the translation. Rendered as a list item
 * directly inside `AnimatePresence`, so it can leave once it is translated.
 */
const MissingTranslationCard = ({
  value,
  format,
  locale,
  fallbackLocale,
  fieldPath,
  fieldHref,
  editorOpen,
  initialText,
  autoFocus,
  entryRef,
  onOpen,
  onAutoFocused,
  onCancel,
  onSave,
  onDraftChange,
}: MissingTranslationCardProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  const quoteId = useId();
  const language = languageName(locale);
  const fallbackText = translationText(value, fallbackLocale);

  return (
    <Surface
      as={motion.li}
      spacing="sm"
      shadow="none"
      noContainer
      className="flex flex-col gap-4"
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      layout="position"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={reduceMotion ? { duration: 0 } : CARD_TRANSITION}
    >
      <figure className="flex flex-col gap-2">
        <figcaption className="text-sm text-current/70">
          {intl.formatMessage(messages.fallbackLabel, {
            language,
            fallback: languageName(fallbackLocale),
          })}
        </figcaption>
        <blockquote
          id={quoteId}
          {...languageAttributes(fallbackLocale)}
          className="border-outline border-s-4 ps-4"
        >
          <FallbackText text={fallbackText} format={format} />
        </blockquote>
      </figure>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <code
          dir="ltr"
          className="font-monospace text-sm break-all text-current/70"
        >
          {fieldHref ? (
            <NativeLink render={<Link href={fieldHref} />}>
              {fieldPath}
            </NativeLink>
          ) : (
            fieldPath
          )}
        </code>
        {!editorOpen && (
          <Button
            ref={entryRef}
            size="sm"
            variant="text"
            icon={<Plus aria-hidden />}
            aria-describedby={quoteId}
            onClick={onOpen}
          >
            {intl.formatMessage(messages.addTranslation, { language })}
          </Button>
        )}
      </div>
      {editorOpen && (
        <div ref={entryRef}>
          <TranslationEditor
            locale={locale}
            format={format}
            singleLine={!fallbackText.includes('\n')}
            initialText={initialText}
            autoFocus={autoFocus}
            onAutoFocused={onAutoFocused}
            onCancel={onCancel}
            onSave={onSave}
            onDraftChange={onDraftChange}
          />
        </div>
      )}
    </Surface>
  );
};

export default MissingTranslationCard;
