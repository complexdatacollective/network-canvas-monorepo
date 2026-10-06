import { CircleCheck } from 'lucide-react';
import {
  AnimatePresence,
  motion,
  type Transition,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import {
  createElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';

import {
  createMessageError,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { Label } from '@codaco/fresco-ui/Label';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Section from '@codaco/fresco-ui/Section';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { CurrentProtocol, LocaleTag } from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import { confirmDiscardNestedDraft } from '~/components/DialogForm/confirmDiscardNestedDraft';
import { useNestedDraft } from '~/components/DialogForm/nestedDraftRegistry';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import { setProtocolTranslation } from '~/ducks/modules/activeProtocol';
import {
  getLocalizationCoverage,
  getMissingTranslationGroups,
  type LocaleCoverage,
  type MissingTranslationField,
  type TranslationPlace,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { localizedText } from '~/utils/localizedText';

import MissingTranslationCard from './MissingTranslationCard';
import { useLanguageName } from './useLanguageName';

const messages = defineMessages({
  title: {
    id: 'architect.localization.missingTranslations.title',
    defaultMessage: 'Missing translations',
    description:
      'Heading of the list of texts that are not translated into every language.',
  },
  description: {
    id: 'architect.localization.missingTranslations.description',
    defaultMessage:
      'Missing translations do not stop you from saving, previewing or using the protocol. Participants see the text in another language instead.',
    description: 'Explanation above the list of missing translations.',
  },
  filterLabel: {
    id: 'architect.localization.missingTranslations.filterLabel',
    defaultMessage: 'Show missing translations for',
    description:
      'Label of the menu that chooses which language’s missing translations are listed.',
  },
  filterOption: {
    id: 'architect.localization.missingTranslations.filterOption',
    defaultMessage: '{language} ({count, number})',
    description:
      'Option for one language in the menu that chooses which language’s missing translations are listed. count is how many of its translations are missing.',
  },
  summary: {
    id: 'architect.localization.missingTranslations.summary',
    defaultMessage:
      '{count, plural, one {# text has no {language} translation.} other {# texts have no {language} translation.}}',
    description:
      'Shown above the list of missing translations for one language. count is how many texts are listed; language is the language they are missing in.',
  },
  complete: {
    id: 'architect.localization.missingTranslations.complete',
    defaultMessage: 'Every text is translated into every language.',
    description: 'Shown when no translation is missing.',
  },
  singleLanguage: {
    id: 'architect.localization.missingTranslations.singleLanguage',
    defaultMessage:
      'This protocol has one language. Add a language to start translating.',
    description: 'Shown when a protocol has only one language.',
  },
  stage: {
    id: 'architect.localization.missingTranslations.stage',
    defaultMessage: 'Stage',
    description: 'Kind of place a missing translation is in: a stage.',
  },
  nodeType: {
    id: 'architect.localization.missingTranslations.nodeType',
    defaultMessage: 'Node type',
    description: 'Kind of place a missing translation is in: a node type.',
  },
  edgeType: {
    id: 'architect.localization.missingTranslations.edgeType',
    defaultMessage: 'Edge type',
    description: 'Kind of place a missing translation is in: an edge type.',
  },
  ego: {
    id: 'architect.localization.missingTranslations.ego',
    defaultMessage: 'Ego',
    description:
      'Place a missing translation is in: the attributes of the ego (the participant).',
  },
  protocol: {
    id: 'architect.localization.missingTranslations.protocol',
    defaultMessage: 'Protocol',
    description: 'Place a missing translation is in: the protocol itself.',
  },
  unnamed: {
    id: 'architect.localization.missingTranslations.unnamed',
    defaultMessage: 'Untitled',
    description: 'Name shown for a stage or type that has no name.',
  },
  saved: {
    id: 'architect.localization.missingTranslations.saved',
    defaultMessage: '{language} translation saved.',
    description:
      'Screen-reader announcement after a missing translation is written from the list. language is the language of the translation.',
  },
  savedLanguageComplete: {
    id: 'architect.localization.missingTranslations.savedLanguageComplete',
    defaultMessage:
      '{language} translation saved. Every text now has a {language} translation, so the missing {next} translations are shown.',
    description:
      'Screen-reader announcement after the last missing translation in one language is written, when the list moves on to another language. language is the language just completed; next is the language now listed.',
  },
  savedEverything: {
    id: 'architect.localization.missingTranslations.savedEverything',
    defaultMessage:
      '{language} translation saved. Every text is now translated into every language.',
    description:
      'Screen-reader announcement after the last missing translation in the protocol is written. language is the language of the translation.',
  },
  saveFailed: {
    id: 'architect.localization.missingTranslations.saveFailed',
    defaultMessage:
      'This translation could not be saved, because the text or its language has changed since this field was opened. Cancel, then try again.',
    description:
      'Error shown in a missing-translation field when the protocol no longer accepts the translation, for example because the language was removed.',
  },
});

type FieldPath = MissingTranslationField['field'];

type PlaceDetails = {
  kind: string;
  name: string;
  href: string | null;
  variableNames: (id: string) => string | undefined;
  /** Where the string at a field path is edited, if a link can open it. */
  fieldHref: (field: FieldPath) => string | null;
};

const describePlace = (
  intl: IntlShape,
  protocol: CurrentProtocol,
  place: TranslationPlace,
): PlaceDetails => {
  const { localization, codebook } = protocol;
  const unnamed = intl.formatMessage(messages.unnamed);
  switch (place.kind) {
    case 'stage': {
      const stage = protocol.stages.find(({ id }) => id === place.stageId);
      return {
        kind: intl.formatMessage(messages.stage),
        name: localizedText(stage?.label, localization) || unnamed,
        href: `/protocol/stage/${place.stageId}`,
        variableNames: () => undefined,
        fieldHref: () => null,
      };
    }
    case 'codebook': {
      const definition = codebook[place.entity]?.[place.entityType];
      const typeHref = codebookHref({
        entity: place.entity,
        type: place.entityType,
      });
      return {
        kind: intl.formatMessage(
          place.entity === 'node' ? messages.nodeType : messages.edgeType,
        ),
        name:
          localizedText(definition?.label, localization) ||
          definition?.name ||
          unnamed,
        href: typeHref,
        variableNames: (id) => definition?.variables?.[id]?.name,
        fieldHref: (field) =>
          field.length === 1 && field[0] === 'label' ? typeHref : null,
      };
    }
    case 'ego':
      return {
        kind: intl.formatMessage(messages.ego),
        name: '',
        href: codebookHref(),
        variableNames: (id) => codebook.ego?.variables?.[id]?.name,
        fieldHref: () => null,
      };
    case 'protocol':
      return {
        kind: intl.formatMessage(messages.protocol),
        name: '',
        href: null,
        variableNames: () => undefined,
        fieldHref: () => null,
      };
  }
};

/**
 * The string's path below its place, as written in the protocol file, with
 * variable ids replaced by the variable names researchers know them by.
 */
const formatFieldPath = (
  field: FieldPath,
  variableNames: PlaceDetails['variableNames'],
) =>
  field
    .map((segment, index) => {
      if (typeof segment === 'number') return `[${segment}]`;
      const name =
        field[index - 1] === 'variables' ? variableNames(segment) : undefined;
      return `${index === 0 ? '' : '.'}${name ?? segment}`;
    })
    .join('');

// Rendered inside the Section, so its element sits one level below the
// Section's title; `level` only sets its size.
const PlaceHeading = ({ details }: { details: PlaceDetails }) => {
  const enclosingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingLevel === null ? 'h4' : headingTagBelow(enclosingLevel);
  return (
    <Heading level="h3" margin="none" render={createElement(headingTag)}>
      {details.name && (
        <span className="block text-sm font-normal text-current/70">
          {details.kind}
        </span>
      )}
      {details.href ? (
        <NativeLink render={<Link href={details.href} />}>
          {details.name || details.kind}
        </NativeLink>
      ) : (
        details.name || details.kind
      )}
    </Heading>
  );
};

const GROUP_TRANSITION: Transition = {
  type: 'spring',
  duration: 0.3,
  bounce: 0,
};

const PlaceGroup = ({ children }: { children: ReactNode }) => {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  return (
    <motion.li
      className="flex flex-col gap-3"
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : GROUP_TRANSITION}
    >
      {children}
    </motion.li>
  );
};

/** Identifies one missing translation: a text, in one language. */
const editorKey = (locale: LocaleTag, path: readonly (string | number)[]) =>
  JSON.stringify([locale, path]);

const withoutKey = (keys: ReadonlySet<string>, key: string) => {
  const next = new Set(keys);
  next.delete(key);
  return next;
};

/** The first language after `locale`, in declared order, that still has gaps. */
const nextLanguageWithGaps = (
  locales: readonly LocaleCoverage[],
  locale: LocaleTag,
) => {
  const index = locales.findIndex((entry) => entry.locale === locale);
  return [...locales.slice(index + 1), ...locales.slice(0, index)].find(
    ({ missing }) => missing > 0,
  )?.locale;
};

// A card's entry is its Add button, or its editor while that is open.
const focusEntry = (entry: HTMLElement | undefined) => {
  const target =
    entry instanceof HTMLButtonElement
      ? entry
      : entry?.querySelector<HTMLElement>('input, [contenteditable="true"]');
  target?.focus();
};

type MissingTranslationsProps = {
  /** The language to list; null, or one with no gaps, lists the first that has gaps. */
  language: LocaleTag | null;
  onLanguageChange: (locale: LocaleTag) => void;
  headingRef: RefObject<HTMLElement | null>;
};

/**
 * The texts participants see in another language, one language at a time,
 * each with a field for writing its translation in place.
 *
 * Any number of editors may be open at once, and each keeps its text while
 * another language is listed: nothing closes an editor except its own Cancel,
 * Escape or Save, so typed text is never dropped without asking.
 */
const MissingTranslations = ({
  language,
  onLanguageChange,
  headingRef,
}: MissingTranslationsProps) => {
  const intl = useAppIntl();
  const pickerId = useId();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { openDialog } = useDialog();
  const { announce } = useAccessibilityAnnouncements();
  const protocol = useSelector(getProtocol);
  const coverage = useSelector(getLocalizationCoverage);
  const groups = useSelector(getMissingTranslationGroups);
  const languageName = useLanguageName();

  const [openEditors, setOpenEditors] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [autoFocusKey, setAutoFocusKey] = useState<string | null>(null);
  const drafts = useRef(new Map<string, string>());
  const entries = useRef(new Map<string, HTMLElement>());

  const gapKeys = useMemo(
    () =>
      new Set(
        groups.flatMap(({ fields }) =>
          fields.flatMap(({ path, gaps }) =>
            gaps.map(({ locale }) => editorKey(locale, path)),
          ),
        ),
      ),
    [groups],
  );
  // An editor whose text has since been translated elsewhere (another tab, a
  // redo) is set aside rather than closed, so it returns with its text if an
  // undo brings the gap back.
  const activeEditors = [...openEditors].filter((key) => gapKeys.has(key));

  useNestedDraft(activeEditors.length > 0, () =>
    activeEditors.some((key) => (drafts.current.get(key) ?? '').trim() !== ''),
  );

  const clearAutoFocus = useCallback(() => setAutoFocusKey(null), []);

  if (!protocol) return null;

  const languagesWithGaps = coverage.locales.filter(
    ({ missing }) => missing > 0,
  );
  const shown =
    languagesWithGaps.find(({ locale }) => locale === language) ??
    languagesWithGaps[0];

  const visibleGroups =
    shown === undefined
      ? []
      : groups.flatMap((group) => {
          const details = describePlace(intl, protocol, group.place);
          const cards = group.fields.flatMap((field) => {
            const gap = field.gaps.find(
              ({ locale }) => locale === shown.locale,
            );
            return gap
              ? [
                  {
                    key: editorKey(shown.locale, field.path),
                    field,
                    fallbackLocale: gap.fallbackLocale,
                  },
                ]
              : [];
          });
          return cards.length > 0 ? [{ key: group.key, details, cards }] : [];
        });
  const shownKeys = visibleGroups.flatMap(({ cards }) =>
    cards.map(({ key }) => key),
  );

  const openEditor = (key: string) => {
    setAutoFocusKey(key);
    setOpenEditors((keys) => new Set(keys).add(key));
  };

  const closeEditor = async (key: string) => {
    const draft = drafts.current.get(key) ?? '';
    if (draft.trim() !== '' && !(await confirmDiscardNestedDraft(openDialog))) {
      return;
    }
    drafts.current.delete(key);
    flushSync(() => setOpenEditors((keys) => withoutKey(keys, key)));
    focusEntry(entries.current.get(key));
  };

  const save = (
    key: string,
    path: readonly (string | number)[],
    locale: LocaleTag,
    text: string,
  ): FormSubmissionResult => {
    const before = getProtocol(store.getState());
    dispatch(setProtocolTranslation({ path, locale, text }));
    const state = store.getState();
    if (getProtocol(state) === before) {
      return {
        success: false,
        formErrors: [createMessageError(messages.saveFailed)],
      };
    }

    drafts.current.delete(key);
    setOpenEditors((keys) => withoutKey(keys, key));

    const name = languageName(locale);
    const remaining = getLocalizationCoverage(state).locales;
    if (
      remaining.some((entry) => entry.locale === locale && entry.missing > 0)
    ) {
      announce(intl.formatMessage(messages.saved, { language: name }));
      const index = shownKeys.indexOf(key);
      const neighbour = [shownKeys[index + 1], shownKeys[index - 1]].find(
        (candidate) =>
          candidate !== undefined && entries.current.has(candidate),
      );
      if (neighbour === undefined) {
        headingRef.current?.focus();
      } else {
        focusEntry(entries.current.get(neighbour));
      }
      return { success: true };
    }

    const next = nextLanguageWithGaps(remaining, locale);
    if (next === undefined) {
      announce(
        intl.formatMessage(messages.savedEverything, { language: name }),
      );
    } else {
      onLanguageChange(next);
      announce(
        intl.formatMessage(messages.savedLanguageComplete, {
          language: name,
          next: languageName(next),
        }),
      );
    }
    headingRef.current?.focus();
    return { success: true };
  };

  return (
    <Section
      title={
        <span ref={headingRef} tabIndex={-1} className="focusable">
          {intl.formatMessage(messages.title)}
        </span>
      }
      description={intl.formatMessage(messages.description)}
    >
      {shown === undefined ? (
        protocol.localization.locales.length === 1 ? (
          <Paragraph margin="none">
            {intl.formatMessage(messages.singleLanguage)}
          </Paragraph>
        ) : (
          <Paragraph margin="none" className="flex items-center gap-2">
            <CircleCheck aria-hidden className="text-success shrink-0" />
            {intl.formatMessage(messages.complete)}
          </Paragraph>
        )
      ) : (
        <div className="flex flex-col gap-6">
          {languagesWithGaps.length > 1 && (
            <div className="flex max-w-md flex-col gap-2">
              <Label htmlFor={pickerId}>
                {intl.formatMessage(messages.filterLabel)}
              </Label>
              <NativeSelectField
                id={pickerId}
                name="missing-translations-language"
                value={shown.locale}
                onChange={(value) => {
                  if (typeof value === 'string') onLanguageChange(value);
                }}
                options={languagesWithGaps.map(({ locale, missing }) => ({
                  value: locale,
                  label: intl.formatMessage(messages.filterOption, {
                    language: languageName(locale),
                    count: missing,
                  }),
                }))}
              />
            </div>
          )}
          <Paragraph margin="none">
            {intl.formatMessage(messages.summary, {
              count: shown.missing,
              language: languageName(shown.locale),
            })}
          </Paragraph>
          {/* Keyed by language, so switching languages swaps the list
              outright instead of animating one language's cards out. */}
          <ul key={shown.locale} className="flex flex-col gap-8">
            <AnimatePresence initial={false}>
              {visibleGroups.map(({ key: groupKey, details, cards }) => (
                <PlaceGroup key={groupKey}>
                  <PlaceHeading details={details} />
                  <ul className="flex flex-col gap-3">
                    <AnimatePresence initial={false}>
                      {cards.map(({ key, field, fallbackLocale }) => {
                        const editorOpen = openEditors.has(key);
                        return (
                          <MissingTranslationCard
                            key={key}
                            value={field.value}
                            format={field.format}
                            locale={shown.locale}
                            fallbackLocale={fallbackLocale}
                            fieldPath={formatFieldPath(
                              field.field,
                              details.variableNames,
                            )}
                            fieldHref={details.fieldHref(field.field)}
                            editorOpen={editorOpen}
                            initialText={drafts.current.get(key) ?? ''}
                            autoFocus={autoFocusKey === key}
                            entryRef={(element) => {
                              if (element) entries.current.set(key, element);
                              else entries.current.delete(key);
                            }}
                            onOpen={() => openEditor(key)}
                            onAutoFocused={clearAutoFocus}
                            onCancel={() => void closeEditor(key)}
                            onSave={(text) =>
                              save(key, field.path, shown.locale, text)
                            }
                            onDraftChange={(text) => {
                              drafts.current.set(key, text);
                            }}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </PlaceGroup>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </Section>
  );
};

export default MissingTranslations;
