import { CircleCheck, PenLine } from 'lucide-react';
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
  useId,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';

import {
  createMessageError,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { Label } from '@codaco/fresco-ui/Label';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';
import {
  EnclosingHeadingLevel,
  type HeadingTag,
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { interfaceDisplayName } from '@codaco/protocol-builder/interfaces/interfaceNames';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import { localeDirection } from '@codaco/protocol-builder/localization/localizedText';
import {
  collectLocalizedStrings,
  type CurrentProtocol,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringFormat,
} from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import { setProtocolLocalizedString } from '~/ducks/modules/activeProtocol';
import type { RootState } from '~/ducks/store';
import {
  getLocalizationCoverage,
  getMissingTranslationGroups,
  type LocaleCoverage,
  type MissingTranslationField,
  type TranslationPlace,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { translationText } from '~/utils/localizedText';

import TranslationDialog from './TranslationDialog';
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
  stages: {
    id: 'architect.localization.missingTranslations.stages',
    defaultMessage: 'Stages',
    description:
      'Heading of the part of the list of missing translations that holds the texts in the protocol’s stages.',
  },
  codebook: {
    id: 'architect.localization.missingTranslations.codebook',
    defaultMessage: 'Codebook',
    description:
      'Heading of the part of the list of missing translations that holds the texts in the protocol’s codebook: its node types, edge types and ego.',
  },
  stagePosition: {
    id: 'architect.localization.missingTranslations.stagePosition',
    defaultMessage: 'Stage {position, number}',
    description:
      'Shown above the interface name of a stage that has missing translations. position is the stage’s place in the protocol, counting from 1.',
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
  placeTitle: {
    id: 'architect.localization.missingTranslations.placeTitle',
    defaultMessage: '{place} · {name}',
    description:
      'Title of the dialog that edits a text’s translations, naming where the text is. place is the kind of place, such as “Stage 4” or “Node type”; name is the stage’s interface name or the type’s name.',
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
      '{language} translation saved. Every text now has a {language} translation, so the list shows texts with no {next} translation instead.',
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
  translationsSaved: {
    id: 'architect.localization.missingTranslations.translationsSaved',
    defaultMessage: 'Translations saved.',
    description:
      'Screen-reader announcement after a text’s translations are saved from the list of missing translations, when the translation the list is showing is still missing.',
  },
  saveFailed: {
    id: 'architect.localization.missingTranslations.saveFailed',
    defaultMessage:
      'These translations could not be saved, because this text or one of its languages has been removed from the protocol. Select Cancel to close the dialog.',
    description:
      'Error shown in the dialog that edits a text’s translations when the protocol no longer accepts them: the text, or a language they are written in, was removed from the protocol. Cancel is the label of the button that closes the dialog.',
  },
});

type FieldPath = MissingTranslationField['field'];

type PlaceDetails = {
  /** What kind of place it is, such as "Stage 4" or "Node type". */
  kind: string;
  /** The stage's interface name or the type's name; null where `kind` says it all. */
  name: string | null;
  stageType: string | null;
  href: string | null;
  variableNames: (id: string) => string | undefined;
};

const describePlace = (
  intl: IntlShape,
  protocol: CurrentProtocol,
  place: TranslationPlace,
): PlaceDetails => {
  const { codebook } = protocol;
  const unnamed = intl.formatMessage(messages.unnamed);
  switch (place.kind) {
    case 'stage': {
      const index = protocol.stages.findIndex(({ id }) => id === place.stageId);
      const stage = protocol.stages[index];
      return {
        kind: intl.formatMessage(messages.stagePosition, {
          position: index + 1,
        }),
        name: (stage && interfaceDisplayName(stage.type, intl)) ?? unnamed,
        stageType: stage?.type ?? null,
        href: `/protocol/stage/${place.stageId}`,
        variableNames: () => undefined,
      };
    }
    case 'codebook': {
      const definition = codebook[place.entity]?.[place.entityType];
      return {
        kind: intl.formatMessage(
          place.entity === 'node' ? messages.nodeType : messages.edgeType,
        ),
        name: definition?.name || unnamed,
        stageType: null,
        href: codebookHref({ entity: place.entity, type: place.entityType }),
        variableNames: (id) => definition?.variables?.[id]?.name,
      };
    }
    case 'ego':
      return {
        kind: intl.formatMessage(messages.ego),
        name: null,
        stageType: null,
        href: codebookHref(),
        variableNames: (id) => codebook.ego?.variables?.[id]?.name,
      };
    case 'protocol':
      return {
        kind: intl.formatMessage(messages.protocol),
        name: null,
        stageType: null,
        href: null,
        variableNames: () => undefined,
      };
  }
};

type Category = 'stages' | 'codebook' | 'protocol';

const CATEGORIES: readonly Category[] = ['stages', 'codebook', 'protocol'];

const categoryOf = (place: TranslationPlace): Category => {
  if (place.kind === 'stage') return 'stages';
  if (place.kind === 'protocol') return 'protocol';
  return 'codebook';
};

const PATH_SEPARATOR = ' › ';

/**
 * One step of a string's path, as researchers know it: an index counted from
 * 1, and a variable's name in place of its id.
 */
const formatSegment = (
  intl: IntlShape,
  field: FieldPath,
  index: number,
  variableNames: PlaceDetails['variableNames'],
) => {
  const segment = field[index];
  if (typeof segment === 'number') return intl.formatNumber(segment + 1);
  if (segment === undefined) return '';
  return field[index - 1] === 'variables'
    ? (variableNames(segment) ?? segment)
    : segment;
};

const formatFieldPath = (
  intl: IntlShape,
  field: FieldPath,
  variableNames: PlaceDetails['variableNames'],
) =>
  field
    .map((_, index) => formatSegment(intl, field, index, variableNames))
    .join(PATH_SEPARATOR);

/** One text with no translation in the language the list shows. */
type MissingText = {
  key: string;
  field: MissingTranslationField;
  fallbackLocale: LocaleTag;
};

type PathNode = {
  key: string;
  label: string;
  /** Set where a missing text's path ends. */
  text: MissingText | undefined;
  children: readonly PathNode[];
};

type TrieNode = {
  label: string;
  text: MissingText | undefined;
  children: Map<string, TrieNode>;
};

/**
 * The texts' paths below their place as a tree in which each run of steps
 * only one text takes is a single node, so a branch is drawn only where texts
 * part ways.
 */
const buildPathTree = (
  texts: readonly MissingText[],
  formatStep: (field: FieldPath, index: number) => string,
): PathNode[] => {
  const root: TrieNode = { label: '', text: undefined, children: new Map() };
  for (const text of texts) {
    const { field } = text.field;
    let node = root;
    field.forEach((segment, index) => {
      // Stringified so an index and a key spelled with the same digits differ.
      const id = JSON.stringify(segment);
      const existing = node.children.get(id);
      const child = existing ?? {
        label: formatStep(field, index),
        text: undefined,
        children: new Map<string, TrieNode>(),
      };
      if (!existing) node.children.set(id, child);
      node = child;
    });
    node.text = text;
  }

  const compress = (node: TrieNode, prefix: readonly string[]): PathNode[] =>
    [...node.children].map(([id, child]) => {
      const ids = [...prefix, id];
      const labels = [child.label];
      let current = child;
      while (current.text === undefined && current.children.size === 1) {
        const only = current.children.entries().next().value;
        if (only === undefined) break;
        const [nextId, next] = only;
        ids.push(nextId);
        labels.push(next.label);
        current = next;
      }
      return {
        key: ids.join('/'),
        label: labels.join(PATH_SEPARATOR),
        text: current.text,
        children: compress(current, ids),
      };
    });

  return compress(root, []);
};

/** Identifies one missing translation: a text, in one language. */
const textKey = (locale: LocaleTag, path: readonly (string | number)[]) =>
  JSON.stringify([locale, path]);

const samePath = (
  a: readonly (string | number)[],
  b: readonly (string | number)[],
) => JSON.stringify(a) === JSON.stringify(b);

const sameTranslations = (a: LocalizedString, b: LocalizedString) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
  );
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

const storedValue = (
  state: RootState,
  path: readonly (string | number)[],
): LocalizedString | undefined => {
  const protocol = getProtocol(state);
  return protocol
    ? collectLocalizedStrings(protocol).find((hit) => samePath(hit.path, path))
        ?.value
    : undefined;
};

const useHeadingTagBelow = (fallback: HeadingTag) => {
  const enclosingLevel = useEnclosingHeadingLevel();
  return enclosingLevel === null ? fallback : headingTagBelow(enclosingLevel);
};

const ITEM_TRANSITION: Transition = {
  type: 'spring',
  duration: 0.3,
  bounce: 0,
};

/** A list item that fades in and out as texts are listed and translated. */
const TreeItem = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion();
  return (
    <motion.li
      className={className}
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : ITEM_TRANSITION}
    >
      {children}
    </motion.li>
  );
};

// A nested list draws the tree's trunk down its start edge, and each item in
// it a short branch from the trunk to the item's first line.
const NESTED_LIST_CLASSES =
  'border-outline ms-3 flex flex-col gap-1 border-s ps-4';
const NESTED_ITEM_CLASSES =
  'before:border-outline relative before:absolute before:top-4 before:-start-4 before:w-3 before:border-t';

const PlaceHeading = ({ details }: { details: PlaceDetails }) => {
  const headingTag = useHeadingTagBelow('h4');
  const title = details.name ?? details.kind;
  return (
    <Heading
      level="h4"
      margin="none"
      render={createElement(headingTag)}
      className="flex items-center gap-3"
    >
      {details.stageType !== null && (
        <span className="w-16 shrink-0">
          <StageTypeImage
            type={details.stageType}
            alt=""
            ratio="4:3"
            sizes="4rem"
            className="w-full rounded-sm"
          />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        {details.name !== null && (
          <span className="text-sm font-normal text-current/70">
            {details.kind}
          </span>
        )}
        {details.href ? (
          <NativeLink render={<Link href={details.href} />}>{title}</NativeLink>
        ) : (
          title
        )}
      </span>
    </Heading>
  );
};

/**
 * What participants see in place of the missing translation, cut to two
 * lines. Markdown keeps only its emphasis: anything else it can hold is not
 * allowed inside a button.
 */
const FallbackPreview = ({
  id,
  text,
  locale,
  format,
}: {
  id: string;
  text: string;
  locale: LocaleTag;
  format: LocalizedStringFormat;
}) => (
  <span
    id={id}
    lang={locale}
    dir={localeDirection(locale)}
    className="line-clamp-2 text-current/70"
  >
    {format === 'markdown' ? (
      <RenderMarkdown allowedElements={['em', 'strong']}>{text}</RenderMarkdown>
    ) : (
      text
    )}
  </span>
);

type MissingTextButtonProps = {
  text: MissingText;
  label: string;
  /** Keeps the button where focus can return to; returns its removal. */
  register: (key: string, element: HTMLElement) => () => void;
  onOpen: () => void;
};

const MissingTextButton = ({
  text,
  label,
  register,
  onOpen,
}: MissingTextButtonProps) => {
  const labelId = useId();
  const previewId = useId();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      // The path, then the preview, as separate words whatever the spans'
      // display, which naming from content does not promise.
      aria-labelledby={`${labelId} ${previewId}`}
      ref={(element) => (element ? register(text.key, element) : undefined)}
      onClick={onOpen}
      className="focusable flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-start hover:bg-current/5"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          id={labelId}
          dir="ltr"
          className="font-monospace text-sm break-all"
        >
          {label}
        </span>
        <FallbackPreview
          id={previewId}
          text={translationText(text.field.value, text.fallbackLocale)}
          locale={text.fallbackLocale}
          format={text.field.format}
        />
      </span>
      <PenLine aria-hidden className="mt-0.5 size-4 shrink-0 text-current/70" />
    </button>
  );
};

/** The listed texts' keys, in the order the tree draws them. */
const treeKeys = (nodes: readonly PathNode[]): string[] =>
  nodes.flatMap((node) => [
    ...(node.text ? [node.text.key] : []),
    ...treeKeys(node.children),
  ]);

type PathListProps = {
  nodes: readonly PathNode[];
  renderText: (text: MissingText, label: string) => ReactNode;
};

const PathList = ({ nodes, renderText }: PathListProps) => (
  <ul className={NESTED_LIST_CLASSES}>
    <AnimatePresence initial={false}>
      {nodes.map((node) => (
        <TreeItem key={node.key} className={NESTED_ITEM_CLASSES}>
          {node.text ? (
            renderText(node.text, node.label)
          ) : (
            <span
              dir="ltr"
              className="font-monospace block px-2 py-1.5 text-sm break-all text-current/70"
            >
              {node.label}
            </span>
          )}
          {node.children.length > 0 && (
            <PathList nodes={node.children} renderText={renderText} />
          )}
        </TreeItem>
      ))}
    </AnimatePresence>
  </ul>
);

const CategoryHeading = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => {
  const headingTag = useHeadingTagBelow('h3');
  return (
    <>
      <Heading level="h3" margin="none" render={createElement(headingTag)}>
        {label}
      </Heading>
      <EnclosingHeadingLevel level={headingTag}>
        {children}
      </EnclosingHeadingLevel>
    </>
  );
};

/** The text being translated in the dialog, as it was when the dialog opened. */
type Editing = {
  /** Distinguishes each opening, so every one starts with a fresh form. */
  session: number;
  key: string;
  path: readonly (string | number)[];
  value: LocalizedString;
  format: LocalizedStringFormat;
  /** The language the list showed. */
  locale: LocaleTag;
  place: string;
  fieldPath: string;
  /** Every listed text, in order, for where focus goes if this one leaves. */
  order: readonly string[];
};

type MissingTranslationsProps = {
  /** The language to list; null, or one with no gaps, lists the first that has gaps. */
  language: LocaleTag | null;
  onLanguageChange: (locale: LocaleTag) => void;
  headingRef: RefObject<HTMLElement | null>;
};

/**
 * The texts participants see in another language, one language at a time, as
 * a tree of where each sits in the protocol. Choosing a text opens a dialog
 * for writing it in every language.
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
  const { announce } = useAccessibilityAnnouncements();
  const protocol = useSelector(getProtocol);
  const coverage = useSelector(getLocalizationCoverage);
  const groups = useSelector(getMissingTranslationGroups);
  const languageName = useLanguageName();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const sessions = useRef(0);
  const entries = useRef(new Map<string, HTMLElement>());

  if (!protocol) return null;

  const languagesWithGaps = coverage.locales.filter(
    ({ missing }) => missing > 0,
  );
  const shown =
    languagesWithGaps.find(({ locale }) => locale === language) ??
    languagesWithGaps[0];

  const places =
    shown === undefined
      ? []
      : groups.flatMap((group) => {
          const details = describePlace(intl, protocol, group.place);
          const texts = group.fields.flatMap((field) => {
            const gap = field.gaps.find(
              ({ locale }) => locale === shown.locale,
            );
            return gap
              ? [
                  {
                    key: textKey(shown.locale, field.path),
                    field,
                    fallbackLocale: gap.fallbackLocale,
                  },
                ]
              : [];
          });
          if (texts.length === 0) return [];
          return [
            {
              key: group.key,
              category: categoryOf(group.place),
              details,
              texts,
              tree: buildPathTree(texts, (field, index) =>
                formatSegment(intl, field, index, details.variableNames),
              ),
            },
          ];
        });
  const categories = CATEGORIES.flatMap((category) => {
    const members = places.filter((place) => place.category === category);
    return members.length > 0 ? [{ category, places: members }] : [];
  });
  const shownKeys = categories.flatMap(({ places: members }) =>
    members.flatMap(({ tree }) => treeKeys(tree)),
  );

  const categoryLabel: Record<Category, string> = {
    stages: intl.formatMessage(messages.stages),
    codebook: intl.formatMessage(messages.codebook),
    protocol: intl.formatMessage(messages.protocol),
  };

  const openDialog = (
    text: MissingText,
    details: PlaceDetails,
    locale: LocaleTag,
  ) => {
    sessions.current += 1;
    setEditing({
      session: sessions.current,
      key: text.key,
      path: text.field.path,
      value: text.field.value,
      format: text.field.format,
      locale,
      place:
        details.name === null
          ? details.kind
          : intl.formatMessage(messages.placeTitle, {
              place: details.kind,
              name: details.name,
            }),
      fieldPath: formatFieldPath(intl, text.field.field, details.variableNames),
      order: shownKeys,
    });
    setDialogOpen(true);
  };

  const announceSaved = (state: RootState, target: Editing) => {
    const { locale, path } = target;
    const { locales, warnings } = getLocalizationCoverage(state);
    if (
      warnings.some(
        (warning) => warning.locale === locale && samePath(warning.path, path),
      )
    ) {
      announce(intl.formatMessage(messages.translationsSaved));
      return;
    }

    const name = languageName(locale);
    if (locales.some((entry) => entry.locale === locale && entry.missing > 0)) {
      announce(intl.formatMessage(messages.saved, { language: name }));
      return;
    }

    const next = nextLanguageWithGaps(locales, locale);
    if (next === undefined) {
      announce(
        intl.formatMessage(messages.savedEverything, { language: name }),
      );
      return;
    }
    onLanguageChange(next);
    announce(
      intl.formatMessage(messages.savedLanguageComplete, {
        language: name,
        next: languageName(next),
      }),
    );
  };

  const save = (
    target: Editing,
    value: LocalizedString,
  ): FormSubmissionResult => {
    const before = store.getState();
    const stored = storedValue(before, target.path);
    if (stored !== undefined && sameTranslations(stored, value)) {
      setDialogOpen(false);
      return { success: true };
    }

    dispatch(setProtocolLocalizedString({ path: target.path, value }));
    const state = store.getState();
    if (getProtocol(state) === getProtocol(before)) {
      return {
        success: false,
        formErrors: [createMessageError(messages.saveFailed)],
      };
    }

    setDialogOpen(false);
    announceSaved(state, target);
    return { success: true };
  };

  // Base UI reads this as the dialog unmounts, which can be in the same commit
  // that removes the saved text, before this component's newer render reaches
  // the dialog. So it reads the store and the DOM rather than this render: a
  // text still listed has a gap in the listed language, and a button that is
  // leaving the list is inert.
  const returnFocus = () => {
    if (editing === null) return headingRef.current;
    const live = new Set(
      getLocalizationCoverage(store.getState())
        .warnings.filter(({ locale }) => locale === editing.locale)
        .map(({ locale, path }) => textKey(locale, path)),
    );
    const index = editing.order.indexOf(editing.key);
    const candidates = [
      editing.key,
      ...editing.order.slice(index + 1),
      ...editing.order.slice(0, Math.max(index, 0)).toReversed(),
    ];
    for (const key of candidates) {
      const element = live.has(key) ? entries.current.get(key) : undefined;
      if (element?.isConnected && element.closest('[inert]') === null) {
        return element;
      }
    }
    return headingRef.current;
  };

  // A button that the tree remounts while restructuring registers before the
  // old one's removal runs, so removal only forgets its own element.
  const register = (key: string, element: HTMLElement) => {
    entries.current.set(key, element);
    return () => {
      if (entries.current.get(key) === element) entries.current.delete(key);
    };
  };

  const renderText =
    (details: PlaceDetails, locale: LocaleTag) =>
    (text: MissingText, label: string) => (
      <MissingTextButton
        text={text}
        label={label}
        register={register}
        onOpen={() => openDialog(text, details, locale)}
      />
    );

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
              outright instead of animating one language's texts out. */}
          <ul key={shown.locale} className="flex flex-col gap-8">
            <AnimatePresence initial={false}>
              {categories.map(({ category, places: members }) => (
                <TreeItem key={category} className="flex flex-col gap-3">
                  <CategoryHeading label={categoryLabel[category]}>
                    <ul className={NESTED_LIST_CLASSES}>
                      <AnimatePresence initial={false}>
                        {members.map(({ key, details, tree }) => (
                          <TreeItem
                            key={key}
                            className={`${NESTED_ITEM_CLASSES} flex flex-col gap-2 py-1`}
                          >
                            {category !== 'protocol' && (
                              <PlaceHeading details={details} />
                            )}
                            <PathList
                              nodes={tree}
                              renderText={renderText(details, shown.locale)}
                            />
                          </TreeItem>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </CategoryHeading>
                </TreeItem>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
      {editing && (
        <TranslationDialog
          key={editing.session}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          place={editing.place}
          fieldPath={editing.fieldPath}
          value={editing.value}
          format={editing.format}
          initialLocale={editing.locale}
          onSave={(value) => save(editing, value)}
          finalFocus={returnFocus}
        />
      )}
    </Section>
  );
};

export default MissingTranslations;
