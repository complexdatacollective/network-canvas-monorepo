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
  useLayoutEffect,
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
import { Badge } from '@codaco/fresco-ui/Badge';
import { useAccessibilityAnnouncements } from '@codaco/fresco-ui/dnd/useAccessibilityAnnouncements';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import { Label } from '@codaco/fresco-ui/Label';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';
import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
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
import { nameLocalizedText } from '@codaco/protocol-builder/localization/localizedTextNames';
import {
  collectLocalizedStrings,
  type CurrentProtocol,
  type LocaleTag,
  type LocalizedString,
  type LocalizedStringFormat,
  sortByLanguageName,
} from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import { useAppDispatch, useAppStore } from '~/ducks/hooks';
import { setProtocolLocalizedString } from '~/ducks/modules/activeProtocol';
import type { RootState } from '~/ducks/store';
import {
  getLocalizationCoverage,
  getMissingTranslationGroups,
  type LocaleCoverage,
  type LocalizationCoverage,
  type MissingTranslationField,
  type TranslationPlace,
} from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { cx } from '~/utils/cva';
import {
  resolveLocalizedText,
  translationText,
  UNSPECIFIED_LOCALE,
} from '~/utils/localizedText';

import TranslationDialog, {
  type TextName,
  TextNameLabel,
} from './TranslationDialog';
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
  languagesLabel: {
    id: 'architect.localization.missingTranslations.languagesLabel',
    defaultMessage: 'Languages with missing translations',
    description:
      'Name of the row of tabs, one per language, that chooses which language’s missing translations are listed.',
  },
  languageTab: {
    id: 'architect.localization.missingTranslations.languageTab',
    defaultMessage:
      '{language}, {count, plural, one {# missing translation} other {# missing translations}}',
    description:
      'What a screen reader reads for the tab that lists one language’s missing translations. The tab shows the language’s name beside the count. count is how many of its translations are missing.',
  },
  filterLabel: {
    id: 'architect.localization.missingTranslations.filterLabel',
    defaultMessage: 'Show missing translations for',
    description:
      'Label of the menu that chooses which language’s missing translations are listed, used instead of tabs when many languages have missing translations.',
  },
  filterOption: {
    id: 'architect.localization.missingTranslations.filterOption',
    defaultMessage: '{language} ({count, number})',
    description:
      'Option for one language in the menu that chooses which language’s missing translations are listed. count is how many of its translations are missing.',
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
  stageTitle: {
    id: 'architect.localization.missingTranslations.stageTitle',
    defaultMessage: '{name} · {interfaceName}',
    description:
      'Names a stage that has missing translations, in the list and as the place in the title of the dialog that edits a text’s translations. name is the stage’s name in the protocol’s default language; interfaceName is its kind of interface, such as “Information”.',
  },
  stagePosition: {
    id: 'architect.localization.missingTranslations.stagePosition',
    defaultMessage: 'Stage {position, number}',
    description:
      'Shown above the name of a stage that has missing translations. position is the stage’s place in the protocol, counting from 1.',
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
      'Names where a text is in the codebook, in the title of the dialog that edits a text’s translations. place is the kind of place, such as “Node type”; name is the type’s name.',
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

export type PlaceDetails = {
  /** What kind of place it is, such as "Stage 4" or "Node type". */
  kind: string;
  /**
   * A stage's name, in the protocol's default language, or a type's name;
   * null where `kind` says it all.
   */
  name: Readonly<{ text: string; lang: LocaleTag | null }> | null;
  /** A stage's kind of interface, such as "Information". */
  interfaceName: string | null;
  /** Where a text here is, as the dialog that edits it says. */
  title: string;
  stageType: string | null;
  href: string | null;
  variableNames: (id: string) => string | undefined;
};

export const describePlace = (
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
      const label = resolveLocalizedText(stage?.label, protocol.localization);
      const name =
        label === null || label.text === ''
          ? { text: unnamed, lang: null }
          : {
              text: label.text,
              lang: label.locale === UNSPECIFIED_LOCALE ? null : label.locale,
            };
      const interfaceName =
        (stage && interfaceDisplayName(stage.type, intl)) ?? unnamed;
      return {
        kind: intl.formatMessage(messages.stagePosition, {
          position: index + 1,
        }),
        name,
        interfaceName,
        title: intl.formatMessage(messages.stageTitle, {
          name: name.text,
          interfaceName,
        }),
        stageType: stage?.type ?? null,
        href: `/protocol/stage/${place.stageId}`,
        variableNames: () => undefined,
      };
    }
    case 'codebook': {
      const definition = codebook[place.entity]?.[place.entityType];
      const kind = intl.formatMessage(
        place.entity === 'node' ? messages.nodeType : messages.edgeType,
      );
      const name = definition?.name || unnamed;
      return {
        kind,
        name: { text: name, lang: null },
        interfaceName: null,
        title: intl.formatMessage(messages.placeTitle, { place: kind, name }),
        stageType: null,
        href: codebookHref({ entity: place.entity, type: place.entityType }),
        variableNames: (id) => definition?.variables?.[id]?.name,
      };
    }
    case 'ego': {
      const kind = intl.formatMessage(messages.ego);
      return {
        kind,
        name: null,
        interfaceName: null,
        title: kind,
        stageType: null,
        href: codebookHref(),
        variableNames: (id) => codebook.ego?.variables?.[id]?.name,
      };
    }
    case 'protocol': {
      const kind = intl.formatMessage(messages.protocol);
      return {
        kind,
        name: null,
        interfaceName: null,
        title: kind,
        stageType: null,
        href: null,
        variableNames: () => undefined,
      };
    }
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
 * 1, and a variable's name in place of its id. Only for a text Architect has
 * no name for.
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

type Step = Readonly<{ key: string; label: string }>;

/**
 * The steps from a text's place down to the text, named by what each is,
 * such as "Prompt 2" then "Text". A text with no known name falls back to its
 * path, which reads as code.
 */
export const textSteps = (
  intl: IntlShape,
  protocol: CurrentProtocol,
  field: Pick<MissingTranslationField, 'path' | 'field'>,
  details: PlaceDetails,
): Readonly<{ steps: readonly Step[]; raw: boolean }> => {
  const named = nameLocalizedText(intl, protocol, field.path);
  if (named !== undefined) {
    // Prefixed so a named step and a path step never share a branch.
    return {
      steps: named.map(({ key, label }) => ({ key: `name:${key}`, label })),
      raw: false,
    };
  }
  return {
    steps: field.field.map((_, index) => ({
      key: `path:${JSON.stringify(field.field.slice(0, index + 1))}`,
      label: formatSegment(intl, field.field, index, details.variableNames),
    })),
    raw: true,
  };
};

/** One text with no translation in the language the list shows. */
type MissingText = {
  key: string;
  field: MissingTranslationField;
  fallbackLocale: LocaleTag;
  steps: readonly Step[];
  /** What the dialog calls the text. */
  name: TextName;
};

type PathNode = {
  key: string;
  /** The steps a single branch covers, as one name. */
  name: TextName;
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
 * The texts' steps below their place as a tree in which each run of steps
 * only one text takes is a single node, so a branch is drawn only where texts
 * part ways.
 */
const buildPathTree = (texts: readonly MissingText[]): PathNode[] => {
  const root: TrieNode = { label: '', text: undefined, children: new Map() };
  for (const text of texts) {
    let node = root;
    for (const step of text.steps) {
      const existing = node.children.get(step.key);
      const child = existing ?? {
        label: step.label,
        text: undefined,
        children: new Map<string, TrieNode>(),
      };
      if (!existing) node.children.set(step.key, child);
      node = child;
    }
    node.text = text;
  }

  const compress = (node: TrieNode): PathNode[] =>
    [...node.children].map(([key, child]) => {
      const labels = [child.label];
      let current = child;
      let last = key;
      while (current.text === undefined && current.children.size === 1) {
        const only = current.children.entries().next().value;
        if (only === undefined) break;
        const [nextKey, next] = only;
        labels.push(next.label);
        last = nextKey;
        current = next;
      }
      return {
        key: last,
        name: {
          label: labels.join(PATH_SEPARATOR),
          raw: last.startsWith('path:'),
        },
        text: current.text,
        children: compress(current),
      };
    });

  return compress(root);
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

/**
 * The first language after `locale` in `locales`, wrapping round, that still
 * has gaps.
 */
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

/** The keys of the texts still missing a translation in `locale`. */
const missingKeys = (coverage: LocalizationCoverage, locale: LocaleTag) =>
  new Set(
    coverage.warnings
      .filter((warning) => warning.locale === locale)
      .map((warning) => textKey(warning.locale, warning.path)),
  );

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
  const intl = useAppIntl();
  const headingTag = useHeadingTagBelow('h4');
  const { name, interfaceName, href } = details;
  const linked = (content: ReactNode) =>
    href ? (
      <NativeLink render={<Link href={href} />}>{content}</NativeLink>
    ) : (
      content
    );
  const nameText =
    name === null ? null : (
      <span
        lang={name.lang ?? undefined}
        dir={name.lang === null ? undefined : localeDirection(name.lang)}
      >
        {name.text}
      </span>
    );

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
        {nameText !== null && (
          <span className="text-sm font-normal text-current/70">
            {details.kind}
          </span>
        )}
        <span>
          {nameText !== null && interfaceName !== null
            ? intl.formatMessage(messages.stageTitle, {
                name: linked(nameText),
                interfaceName: (
                  <span className="font-normal text-current/70">
                    {interfaceName}
                  </span>
                ),
              })
            : linked(nameText ?? details.kind)}
        </span>
      </span>
    </Heading>
  );
};

const PREVIEW_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'br',
  'em',
  'strong',
];

// A button may only hold phrasing content, so each block participants see
// becomes a span on its own line.
const previewBlock = ({ children }: { children?: ReactNode }) => (
  <span className="block">{children}</span>
);

const PREVIEW_COMPONENTS = {
  p: previewBlock,
  h1: previewBlock,
  h2: previewBlock,
  h3: previewBlock,
  h4: previewBlock,
  h5: previewBlock,
  h6: previewBlock,
  ul: previewBlock,
  ol: previewBlock,
  li: previewBlock,
  blockquote: previewBlock,
};

/**
 * What participants see in place of the missing translation, cut to two
 * lines, keeping its paragraphs and emphasis but nothing a button cannot
 * hold, such as links.
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
      <RenderMarkdown
        allowedElements={PREVIEW_ELEMENTS}
        components={PREVIEW_COMPONENTS}
      >
        {text}
      </RenderMarkdown>
    ) : (
      text
    )}
  </span>
);

type MissingTextButtonProps = {
  text: MissingText;
  name: TextName;
  /** Keeps the button where focus can return to; returns its removal. */
  register: (key: string, element: HTMLElement) => () => void;
  onOpen: () => void;
};

const MissingTextButton = ({
  text,
  name,
  register,
  onOpen,
}: MissingTextButtonProps) => {
  const labelId = useId();
  const previewId = useId();
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      // The name, then the preview, as separate words whatever the spans'
      // display, which naming from content does not promise.
      aria-labelledby={`${labelId} ${previewId}`}
      ref={(element) => (element ? register(text.key, element) : undefined)}
      onClick={onOpen}
      className="focusable flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-start hover:bg-current/5"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={labelId} className={name.raw ? 'text-sm' : 'font-semibold'}>
          <TextNameLabel name={name} />
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

/** The listed texts, in the order the tree draws them. */
const treeTexts = (nodes: readonly PathNode[]): MissingText[] =>
  nodes.flatMap((node) => [
    ...(node.text ? [node.text] : []),
    ...treeTexts(node.children),
  ]);

type PathListProps = {
  nodes: readonly PathNode[];
  renderText: (text: MissingText, name: TextName) => ReactNode;
};

const PathList = ({ nodes, renderText }: PathListProps) => (
  <ul className={NESTED_LIST_CLASSES}>
    <AnimatePresence initial={false}>
      {nodes.map((node) => (
        <TreeItem key={node.key} className={NESTED_ITEM_CLASSES}>
          {node.text ? (
            renderText(node.text, node.name)
          ) : (
            <span
              className={cx(
                'block px-2 py-1.5 text-current/70',
                node.name.raw && 'text-sm',
              )}
            >
              <TextNameLabel name={node.name} />
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

/** A text the dialog can show, as it was listed when the dialog opened. */
type QueuedText = Readonly<{
  key: string;
  path: readonly (string | number)[];
  format: LocalizedStringFormat;
  place: string;
  name: TextName;
}>;

/** The text being translated in the dialog. */
type Editing = Readonly<{
  /** Distinguishes each opening, so every one starts with a fresh form. */
  session: number;
  /** The language the list showed. */
  locale: LocaleTag;
  /**
   * Every text listed when the dialog opened, in the list's order: where Save
   * and next goes, and where focus goes when the dialog closes.
   */
  queue: readonly QueuedText[];
  /** Which of `queue` the dialog shows. */
  index: number;
  /** Its translations as the dialog started on it. */
  value: LocalizedString;
}>;

/** The next text in the queue that is still missing a translation. */
const nextIndex = (editing: Editing, missing: ReadonlySet<string>) => {
  const index = editing.queue.findIndex(
    (queued, position) => position > editing.index && missing.has(queued.key),
  );
  return index === -1 ? undefined : index;
};

// Tabs fit a handful of languages; past that a menu lists them.
const MAX_LANGUAGE_TABS = 5;

/**
 * Whether the language tabs fit on one line of `area`. While the tabs show,
 * they are measured; once they overflow, the width they needed is kept, and
 * they return when the area is that wide again. `labels` names the tabs'
 * languages, so a different set of languages is measured afresh. A count
 * changing as texts are translated is not: it barely changes the width, and
 * trying the tabs again would rebuild the list under the researcher's focus.
 */
const useTabsFit = (labels: string) => {
  const area = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [needed, setNeeded] = useState<Readonly<{
    labels: string;
    width: number;
  }> | null>(null);
  const fits =
    needed?.labels !== labels || width === null || width >= needed.width;

  useLayoutEffect(() => {
    const element = area.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setWidth(element.clientWidth);
      const list = element.querySelector<HTMLElement>('[role="tablist"]');
      if (list !== null && list.scrollWidth > list.clientWidth) {
        setNeeded({ labels, width: list.scrollWidth });
      }
    };
    measure();
    // The tabs themselves are watched too, since their names widen them when
    // the font arrives without changing the area's size.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const tab of element.querySelectorAll('[role="tab"]')) {
      observer.observe(tab);
    }
    return () => observer.disconnect();
  }, [labels, fits]);

  return { area, fits };
};

type MissingTranslationsProps = {
  /**
   * The language to list; null, or one with no gaps, lists the alphabetically
   * first that has gaps.
   */
  language: LocaleTag | null;
  onLanguageChange: (locale: LocaleTag) => void;
  headingRef: RefObject<HTMLElement | null>;
};

/**
 * The texts participants see in another language, one language at a time, as
 * a tree of where each sits in the protocol. Choosing a text opens a dialog
 * for writing it in every language, which can go on to the next text.
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
  const tabs = useTabsFit(
    coverage.locales
      .filter(({ missing }) => missing > 0)
      .map(({ locale }) => languageName(locale))
      .join('\n'),
  );

  if (!protocol) return null;

  const byName = (locales: readonly LocaleCoverage[]) =>
    sortByLanguageName(
      locales,
      ({ locale }) => languageName(locale),
      intl.locale,
    );

  const languagesWithGaps = byName(coverage.locales).filter(
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
          const texts = group.fields.flatMap((field): MissingText[] => {
            const gap = field.gaps.find(
              ({ locale }) => locale === shown.locale,
            );
            if (!gap) return [];
            const { steps, raw } = textSteps(intl, protocol, field, details);
            return [
              {
                key: textKey(shown.locale, field.path),
                field,
                fallbackLocale: gap.fallbackLocale,
                steps,
                name: {
                  label: steps.map(({ label }) => label).join(PATH_SEPARATOR),
                  raw,
                },
              },
            ];
          });
          if (texts.length === 0) return [];
          return [
            {
              key: group.key,
              category: categoryOf(group.place),
              details,
              tree: buildPathTree(texts),
            },
          ];
        });
  const categories = CATEGORIES.flatMap((category) => {
    const members = places.filter((place) => place.category === category);
    return members.length > 0 ? [{ category, places: members }] : [];
  });
  const queue: QueuedText[] = categories.flatMap(({ places: members }) =>
    members.flatMap(({ details, tree }) =>
      treeTexts(tree).map((text) => ({
        key: text.key,
        path: text.field.path,
        format: text.field.format,
        place: details.title,
        name: text.name,
      })),
    ),
  );

  const categoryLabel: Record<Category, string> = {
    stages: intl.formatMessage(messages.stages),
    codebook: intl.formatMessage(messages.codebook),
    protocol: intl.formatMessage(messages.protocol),
  };

  const openDialog = (text: MissingText, locale: LocaleTag) => {
    sessions.current += 1;
    setEditing({
      session: sessions.current,
      locale,
      queue,
      index: queue.findIndex(({ key }) => key === text.key),
      value: text.field.value,
    });
    setDialogOpen(true);
  };

  const announceSaved = (
    state: RootState,
    locale: LocaleTag,
    path: readonly (string | number)[],
  ) => {
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

    const next = nextLanguageWithGaps(byName(locales), locale);
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
    advance: boolean,
  ): FormSubmissionResult => {
    const current = target.queue[target.index];
    if (current === undefined) {
      setDialogOpen(false);
      return { success: true };
    }
    const before = store.getState();
    const stored = storedValue(before, current.path);
    const unchanged = stored !== undefined && sameTranslations(stored, value);
    if (!unchanged) {
      dispatch(setProtocolLocalizedString({ path: current.path, value }));
      if (getProtocol(store.getState()) === getProtocol(before)) {
        return {
          success: false,
          formErrors: [createMessageError(messages.saveFailed)],
        };
      }
    }

    const state = store.getState();
    const next = advance
      ? nextIndex(
          target,
          missingKeys(getLocalizationCoverage(state), target.locale),
        )
      : undefined;
    const nextText = next === undefined ? undefined : target.queue[next];
    if (next !== undefined && nextText !== undefined) {
      setEditing({
        ...target,
        index: next,
        value: storedValue(state, nextText.path) ?? {},
      });
      return { success: true };
    }

    setDialogOpen(false);
    if (!unchanged) announceSaved(state, target.locale, current.path);
    return { success: true };
  };

  // Base UI reads this as the dialog unmounts, which can be in the same commit
  // that removes the saved text, before this component's newer render reaches
  // the dialog. So it reads the store and the DOM rather than this render: a
  // text still listed has a gap in the listed language, and a button that is
  // leaving the list is inert.
  const returnFocus = () => {
    const current = editing?.queue[editing.index];
    if (editing === null || current === undefined) return headingRef.current;
    const live = missingKeys(
      getLocalizationCoverage(store.getState()),
      editing.locale,
    );
    const order = editing.queue.map(({ key }) => key);
    const candidates = [
      current.key,
      ...order.slice(editing.index + 1),
      ...order.slice(0, editing.index).toReversed(),
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
    (locale: LocaleTag) => (text: MissingText, name: TextName) => (
      <MissingTextButton
        text={text}
        name={name}
        register={register}
        onOpen={() => openDialog(text, locale)}
      />
    );

  const editingText = editing?.queue[editing.index];

  const list =
    shown === undefined ? null : (
      // Keyed by language, so switching languages swaps the list outright
      // instead of animating one language's texts out.
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
                          renderText={renderText(shown.locale)}
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
        <div ref={tabs.area}>
          {languagesWithGaps.length > MAX_LANGUAGE_TABS || !tabs.fits ? (
            <div className="flex flex-col gap-6">
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
              {list}
            </div>
          ) : (
            <Tabs
              layout="top"
              aria-label={intl.formatMessage(messages.languagesLabel)}
              value={shown.locale}
              onValueChange={onLanguageChange}
              className="gap-6"
              tabs={languagesWithGaps.map(({ locale, missing }) => ({
                value: locale,
                label: (
                  <>
                    <span
                      aria-hidden="true"
                      className="flex items-center gap-2"
                    >
                      {languageName(locale)}
                      <Badge render={<span />} size="sm" tone="neutral">
                        {intl.formatNumber(missing)}
                      </Badge>
                    </span>
                    <span className="sr-only">
                      {intl.formatMessage(messages.languageTab, {
                        language: languageName(locale),
                        count: missing,
                      })}
                    </span>
                  </>
                ),
              }))}
            >
              {languagesWithGaps.map(({ locale }) => (
                <TabsPanel key={locale} value={locale}>
                  {locale === shown.locale ? list : null}
                </TabsPanel>
              ))}
            </Tabs>
          )}
        </div>
      )}
      {editing && editingText && (
        <TranslationDialog
          key={editing.session}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          text={{
            id: editing.index,
            place: editingText.place,
            name: editingText.name,
            value: editing.value,
            format: editingText.format,
          }}
          listLocale={editing.locale}
          progress={{
            position: editing.index + 1,
            count: editing.queue.length,
          }}
          hasNext={
            nextIndex(editing, missingKeys(coverage, editing.locale)) !==
            undefined
          }
          onSave={(value, advance) => save(editing, value, advance)}
          finalFocus={returnFocus}
        />
      )}
    </Section>
  );
};

export default MissingTranslations;
