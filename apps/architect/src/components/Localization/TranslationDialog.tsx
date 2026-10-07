import { ChevronDown } from 'lucide-react';
import {
  createElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Button from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import { useFormMeta } from '@codaco/fresco-ui/form/hooks/useFormState';
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
import { LanguageOptionLabel } from '@codaco/protocol-builder/localization/LanguageNaming';
import {
  asLocalizedString,
  fallbackDependsOnBrowser,
  localeDirection,
  type ProtocolLocalization,
  type ResolvedTranslation,
  resolveTranslation,
  translationText,
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
  sortByLanguageName,
} from '@codaco/protocol-validation';
import DialogForm, {
  type DialogFormProps,
} from '~/components/DialogForm/DialogForm';
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
  textHint: {
    id: 'architect.localization.missingTranslations.textHint',
    defaultMessage: 'At least one language needs this text.',
    description:
      'Hint under the label of the field where a text is written in each of the protocol’s languages: the text may be left out of some languages, but not all of them.',
  },
  textMissing: {
    id: 'architect.localization.missingTranslations.textMissing',
    defaultMessage: 'Write this text in at least one language.',
    description:
      'Error shown when the text has been removed from every one of the protocol’s languages.',
  },
  progress: {
    id: 'architect.localization.missingTranslations.progress',
    defaultMessage:
      'Text {position, number} of {count, number} to translate into {language}',
    description:
      'Shown under the title of the dialog that edits a text’s translations. position is which of the listed texts the dialog shows, counting from 1; count is how many texts were listed when the dialog opened; language is the language they are missing in.',
  },
  saveAndNext: {
    id: 'architect.localization.missingTranslations.saveAndNext',
    defaultMessage: 'Save and next',
    description:
      'Button in the dialog that edits a text’s translations. It saves the text, then shows the next text that is not translated into the same language, without closing the dialog.',
  },
  advanced: {
    id: 'architect.localization.missingTranslations.advanced',
    defaultMessage:
      'Saved. Showing text {position, number} of {count, number}: {place}, {text}.',
    description:
      'Screen-reader announcement after Save and next saves a text and shows the next one. position and count are as in “Text 2 of 5 to translate into French”; place is where the next text is, such as “Welcome · Information”; text names the text, such as “Page heading”.',
  },
  translatingFrom: {
    id: 'architect.localization.missingTranslations.translatingFrom',
    defaultMessage: 'Translating from {language}',
    description:
      'Heading above the text in another language, shown as a guide to what to translate, in the dialog that edits a text’s translations. When the text has more than one other language, it is a button that chooses which one. language is that language’s name.',
  },
  sourceLanguages: {
    id: 'architect.localization.missingTranslations.sourceLanguages',
    defaultMessage: 'Language to translate from',
    description:
      'Name of the menu that chooses which language’s text is shown as a guide to translate from.',
  },
  participantView: {
    id: 'architect.localization.missingTranslations.participantView',
    defaultMessage: 'What participants see',
    description:
      'Heading beside the translation field, above the text participants see in each of the protocol’s languages.',
  },
  editLanguage: {
    id: 'architect.localization.missingTranslations.editLanguage',
    defaultMessage: 'Edit {language}',
    description:
      'Name of the button on each language’s card, in the list of what participants see in each language, that makes the translation field edit that language. language is the language’s name, which the button shows.',
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
  shownIn: {
    id: 'architect.localization.missingTranslations.shownIn',
    defaultMessage: 'Shown in {language}',
    description:
      'Tag on a language’s card, in the list of what participants see in each language, when the text has no translation in that language and participants see it in another. language is the language they see it in.',
  },
  browserFootnote: {
    id: 'architect.localization.missingTranslations.browserFootnote',
    defaultMessage:
      'Participants whose browser also lists a language that has this text see it in that language instead.',
    description:
      'Footnote under the list of what participants see in each language, for the languages marked with an asterisk: where the text has no translation, a participant’s web browser may list another of the protocol’s languages that has one, and the participant then sees that.',
  },
  notTranslatedUnspecified: {
    id: 'architect.localization.missingTranslations.notTranslatedUnspecified',
    defaultMessage: 'Not translated yet.',
    description:
      'Note under the text participants see in a language the text has no translation for, when the text they see instead is in a language the protocol has not identified yet, or when there is no text at all.',
  },
});

const FOOTNOTE_MARKER = '*';

// The first control a researcher types into, whichever editor draws it.
const EDITOR_SELECTOR = 'input, textarea, [contenteditable="true"]';

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

/** How a text is named: by its role, or by its path where it has none. */
export type TextName = Readonly<{ label: string; raw: boolean }>;

export const TextNameLabel = ({ name }: { name: TextName }) =>
  name.raw ? (
    <span dir="ltr" className="font-monospace break-all">
      {name.label}
    </span>
  ) : (
    <span>{name.label}</span>
  );

/**
 * Another language's text, as participants see it, to translate from: the
 * default language's where it has one, or else the alphabetically first
 * language's, unless the researcher chooses another.
 */
const SourceText = ({
  name,
  format,
}: {
  name: string;
  format: LocalizedStringFormat;
}) => {
  const intl = useAppIntl();
  const labelId = useId();
  const languageName = useLanguageName();
  const { localization, locale: editing } = useEditingLanguage();
  const { [name]: value } = useFormValue([name]);
  const [chosen, setChosen] = useState<LocaleTag | null>(null);

  if (localization === undefined || editing === undefined) return null;

  const candidates = sortByLanguageName(
    localization.locales.filter(
      (locale) => locale !== editing && translationText(value, locale) !== '',
    ),
    languageName,
    intl.locale,
  );
  const source =
    chosen !== null && candidates.includes(chosen)
      ? chosen
      : candidates.includes(localization.defaultLocale)
        ? localization.defaultLocale
        : candidates[0];
  if (source === undefined) return null;

  const label = intl.formatMessage(messages.translatingFrom, {
    language: languageName(source),
  });

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="mb-6 flex flex-col gap-2 rounded bg-current/5 p-4"
    >
      {candidates.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="sm" variant="text" className="self-start" />}
          >
            <span id={labelId}>{label}</span>
            <ChevronDown aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              aria-label={intl.formatMessage(messages.sourceLanguages)}
              value={source}
              onValueChange={(next) => {
                if (typeof next === 'string') setChosen(next);
              }}
            >
              {candidates.map((locale) => (
                <DropdownMenuRadioItem key={locale} value={locale} closeOnClick>
                  <LanguageOptionLabel locale={locale} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <p id={labelId} className="text-sm font-semibold">
          {label}
        </p>
      )}
      <div lang={source} dir={localeDirection(source)}>
        <ParticipantText
          text={translationText(value, source)}
          format={format}
        />
      </div>
    </div>
  );
};

type Seen =
  | { kind: 'translated' }
  /** Participants see another declared language's text. */
  | { kind: 'fallback'; locale: LocaleTag; dependsOnBrowser: boolean }
  /** Participants see text in no identified language, or none at all. */
  | { kind: 'unidentified' };

const seenInstead = (
  value: unknown,
  localization: ProtocolLocalization,
  shown: ResolvedTranslation,
  locale: LocaleTag,
): Seen => {
  if (shown.lang === locale) return { kind: 'translated' };
  if (shown.lang === undefined || shown.lang === UNSPECIFIED_LOCALE) {
    return { kind: 'unidentified' };
  }
  return {
    kind: 'fallback',
    locale: shown.lang,
    dependsOnBrowser: fallbackDependsOnBrowser(value, localization, shown),
  };
};

/**
 * The field's live value as each declared language's participants see it,
 * listed alphabetically by language name. Each card's button makes the field
 * edit that language.
 */
const ParticipantView = ({
  name,
  format,
  onEdit,
}: {
  name: string;
  format: LocalizedStringFormat;
  onEdit: (locale: LocaleTag) => void;
}) => {
  const intl = useAppIntl();
  const headingId = useId();
  const footnoteId = useId();
  const tagIdPrefix = useId();
  const languageName = useLanguageName();
  const enclosingLevel = useEnclosingHeadingLevel();
  const { localization, locale: editing } = useEditingLanguage();
  const { [name]: value } = useFormValue([name]);

  if (localization === undefined) return null;

  const headingTag =
    enclosingLevel === null ? 'h3' : headingTagBelow(enclosingLevel);

  const cards = sortByLanguageName(
    localization.locales,
    languageName,
    intl.locale,
  ).map((locale) => {
    const shown = resolveTranslation(value, localization, locale);
    return {
      locale,
      shown,
      seen: seenInstead(value, localization, shown, locale),
    };
  });
  const hasFootnote = cards.some(
    ({ seen }) => seen.kind === 'fallback' && seen.dependsOnBrowser,
  );

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
        {cards.map(({ locale, shown, seen }) => {
          const isEditing = locale === editing;
          const dependsOnBrowser =
            seen.kind === 'fallback' && seen.dependsOnBrowser;
          const tagId = `${tagIdPrefix}-${locale}`;
          const describedBy = [
            seen.kind === 'translated' ? null : tagId,
            dependsOnBrowser ? footnoteId : null,
          ].filter((id) => id !== null);
          return (
            <li
              key={locale}
              className={cx(
                'focusable-within relative flex flex-col gap-2 rounded border p-3',
                isEditing
                  ? 'border-primary'
                  : 'border-outline hover:bg-current/5',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={intl.formatMessage(messages.editLanguage, {
                    language: languageName(locale),
                  })}
                  aria-current={isEditing ? 'true' : undefined}
                  aria-describedby={
                    describedBy.length > 0 ? describedBy.join(' ') : undefined
                  }
                  onClick={() => onEdit(locale)}
                  // Stretched over the card, so the whole card chooses the
                  // language while the button alone is named and focused.
                  className="cursor-pointer text-start font-semibold outline-none after:absolute after:inset-0 after:rounded after:content-['']"
                >
                  {languageName(locale)}
                </button>
                {locale === localization.defaultLocale && (
                  <Badge render={<span />} size="sm" tone="primary">
                    {intl.formatMessage(messages.defaultLanguage)}
                  </Badge>
                )}
                {isEditing && (
                  <Badge render={<span />} size="sm" appearance="outline">
                    {intl.formatMessage(messages.editingLanguage)}
                  </Badge>
                )}
                {seen.kind === 'fallback' && (
                  <Badge
                    id={tagId}
                    render={<span />}
                    size="sm"
                    tone="neutral"
                    appearance="outline"
                  >
                    {intl.formatMessage(messages.shownIn, {
                      language: languageName(seen.locale),
                    })}
                    {dependsOnBrowser && (
                      <span aria-hidden="true">{FOOTNOTE_MARKER}</span>
                    )}
                  </Badge>
                )}
              </div>
              {shown.text !== '' && (
                <div
                  lang={shown.lang}
                  dir={shown.dir}
                  className={cx(
                    seen.kind !== 'translated' && 'text-current/70',
                  )}
                >
                  <ParticipantText text={shown.text} format={format} />
                </div>
              )}
              {seen.kind === 'unidentified' && (
                <p id={tagId} className="text-sm text-current/70">
                  {intl.formatMessage(messages.notTranslatedUnspecified)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hasFootnote && (
        <p id={footnoteId} className="flex gap-1 text-sm text-current/70">
          <span aria-hidden="true">{FOOTNOTE_MARKER}</span>
          {intl.formatMessage(messages.browserFootnote)}
        </p>
      )}
    </section>
  );
};

/**
 * Fields are disabled while the form saves, and a disabled input cannot take
 * focus, so the next text's input, which Save and next mounts mid-save, misses
 * its autoFocus. Once that save is over, this hands the editor focus.
 */
const FocusNextText = ({
  textId,
  area,
}: {
  textId: number;
  area: RefObject<HTMLDivElement | null>;
}) => {
  const { isSubmitting } = useFormMeta();
  const focusedText = useRef(textId);
  useEffect(() => {
    if (isSubmitting || focusedText.current === textId) return;
    focusedText.current = textId;
    const element = area.current;
    if (element === null || element.contains(document.activeElement)) return;
    element.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus();
  }, [isSubmitting, textId, area]);
  return null;
};

/** One text the dialog edits. */
export type TranslationText = Readonly<{
  /** Tells the texts the dialog moves through apart. */
  id: number;
  /** Where the text is, such as "Welcome · Information". */
  place: string;
  /** What the text is, such as "Page heading". */
  name: TextName;
  value: LocalizedString;
  format: LocalizedStringFormat;
}>;

type TranslationDialogProps = {
  open: boolean;
  onClose: () => void;
  text: TranslationText;
  /** The language the list shows, which every text starts out editing. */
  listLocale: LocaleTag;
  /** Where the text is among those listed when the dialog opened. */
  progress: Readonly<{ position: number; count: number }>;
  /** Whether a later listed text is still untranslated, to offer it next. */
  hasNext: boolean;
  /**
   * Saves the text's translations. `advance` asks for the next text, which
   * the caller passes back as `text`; without it the dialog is done.
   */
  onSave: (value: LocalizedString, advance: boolean) => FormSubmissionResult;
  finalFocus: DialogFormProps['finalFocus'];
};

const TranslationForm = ({
  open,
  onClose,
  text,
  listLocale,
  progress,
  hasNext,
  onSave,
  finalFocus,
}: TranslationDialogProps) => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const { locale, setLocale } = useEditingLanguage();
  const fieldArea = useRef<HTMLDivElement>(null);
  // The editor is remounted for each language and each text, so once the
  // researcher has asked for it, every new one takes focus as it mounts.
  const [focusOnMount, setFocusOnMount] = useState(false);
  const [firstTextId] = useState(text.id);
  const name = `text${text.id}`;

  const editLanguage = (target: LocaleTag) => {
    setFocusOnMount(true);
    if (target === locale) {
      fieldArea.current?.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus();
      return;
    }
    setLocale(target);
  };

  const handleSubmit: DialogFormProps['onSubmit'] = (values, submitter) => {
    const advance = submitter === 'secondary';
    const result = onSave(asLocalizedString(values[name]) ?? {}, advance);
    if (advance && result.success) {
      // The next text starts in the list's language, whichever this one
      // ended on, ready to type into.
      setFocusOnMount(true);
      setLocale(listLocale);
    }
    return result;
  };

  const fieldProps = {
    name,
    label: intl.formatMessage(messages.textLabel),
    hint: intl.formatMessage(messages.textHint),
    initialValue: text.value,
    hideUntranslatedNote: true,
    autoFocus: focusOnMount,
    validation: {
      inAtLeastOneLanguage: (value: unknown) =>
        asLocalizedString(value) === undefined
          ? intl.formatMessage(messages.textMissing)
          : undefined,
    },
  };

  return (
    <DialogForm
      open={open}
      onClose={onClose}
      title={
        <>
          <span className="block text-sm font-normal text-current/70">
            {text.place}
          </span>{' '}
          <span className="block">
            <TextNameLabel name={text.name} />
          </span>
        </>
      }
      description={intl.formatMessage(messages.progress, {
        position: progress.position,
        count: progress.count,
        language: languageName(listLocale),
      })}
      formId="translation-dialog"
      submitLabel={intl.formatMessage(commonMessages.save)}
      secondarySubmitLabel={
        hasNext ? intl.formatMessage(messages.saveAndNext) : undefined
      }
      onSubmit={handleSubmit}
      finalFocus={finalFocus}
      aside={
        <ParticipantView
          name={name}
          format={text.format}
          onEdit={editLanguage}
        />
      }
    >
      {/* Inside the dialog, which hides everything outside it from assistive
          technology while it is open. Silent for the text it opened on. */}
      <p role="status" className="sr-only">
        {text.id === firstTextId
          ? null
          : intl.formatMessage(messages.advanced, {
              position: progress.position,
              count: progress.count,
              place: text.place,
              text: text.name.label,
            })}
      </p>
      <SourceText key={text.id} name={name} format={text.format} />
      <FocusNextText textId={text.id} area={fieldArea} />
      <div ref={fieldArea}>
        {text.format === 'markdown' ? (
          <ArchitectField
            key={text.id}
            {...fieldProps}
            component={LocalizedRichTextField}
            singleLine={Object.values(text.value).every(
              (message) => !messageText(message).includes('\n'),
            )}
          />
        ) : (
          <ArchitectField
            key={text.id}
            {...fieldProps}
            component={LocalizedInputField}
          />
        )}
      </div>
    </DialogForm>
  );
};

/**
 * Every translation of one participant-facing text, edited together, beside
 * what participants in each of the protocol's languages see while it is typed.
 * Save and next moves on to the next text without closing.
 */
const TranslationDialog = (props: TranslationDialogProps) => {
  const localization = useAppSelector(getLocalization);
  return (
    <ProtocolLocalizationProvider
      localization={localization}
      initialLocale={props.listLocale}
    >
      <TranslationForm {...props} />
    </ProtocolLocalizationProvider>
  );
};

export default TranslationDialog;
