import { z } from 'zod';

import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { MessageArguments } from '../../localization/messageArguments.ts';
import {
  BUTTONS_INTERFACE_TEXT,
  CATEGORICAL_BIN_INTERFACE_TEXT,
  EGO_FORM_INTERFACE_TEXT,
  FAMILY_PEDIGREE_INTERFACE_TEXT,
  FAMILY_TREE_VIEW_INTERFACE_TEXT,
  FORMS_INTERFACE_TEXT,
  type InterfaceTextEntry,
  INTERVIEWER_INTERFACE_TEXT,
  MESSAGES_INTERFACE_TEXT,
  NAVIGATION_INTERFACE_TEXT,
  NETWORK_COMPOSER_INTERFACE_TEXT,
  PASSPHRASE_INTERFACE_TEXT,
  QUICK_ADD_INTERFACE_TEXT,
  ROSTER_INTERFACE_TEXT,
  SEARCH_INTERFACE_TEXT,
  VALIDATION_INTERFACE_TEXT,
} from './interface-text-wording.ts';
import {
  type LocalizedString,
  localizedMessage,
  localizedString,
  nonBlankText,
} from './localized-string.ts';
import { hasExternalPanels } from './stage-wording/conditions.ts';
import { behaviourIsOn } from './stage-wording/configuration.ts';
import { requireSuppliedPlacements } from './supplied-stage-setting.ts';
import {
  type LanguageChange,
  suppliedTextAfterLanguageChange,
  suppliedTextFor,
} from './supplied-text.ts';

/**
 * The interface text a protocol holds: the words the interview shows that
 * are not one stage's own, in the protocol's own languages. Every word a
 * participant reads comes from the protocol, in the one language the
 * interview negotiates from the protocol's languages: the interview's
 * built-in text is English only, and what the protocol holds here stands in
 * for it. (Text only screen readers read stays in English.)
 *
 * Text several kinds of stage show alike, such as Save, a search box and the
 * automatic layout toggle, is interface text; so are the controls only an
 * interviewer uses, such as leaving a review or showing a screen the answers
 * have hidden, since the interview is in one language whoever is reading it.
 * So is the text every stage of one kind shows alike, such as a Family
 * Pedigree's tool descriptions, in a group named for that kind of stage,
 * which its stage editor's Wording section shows as shared by every such
 * stage. Text one stage words for itself is that stage's setting instead.
 *
 * A protocol holds only the text it can show: the `navigation`,
 * `interviewer` and `search` groups always, the `buttons` and `messages`
 * groups always but for the entries only some stages show (Yes and No with
 * forms, Don't know on a Family Pedigree), each other group only while the
 * protocol uses what it is for, and of the validation group only the
 * messages of the rules it uses (see `INTERFACE_TEXT_GROUPS`). Architect
 * writes and removes the groups as the protocol changes, with the wording
 * Network Canvas supplies, and the researcher may change and translate them
 * like any other text.
 */

type ProtocolDocument = Readonly<{
  localization: LocalizationDeclaration;
  codebook?: unknown;
  stages?: readonly unknown[];
  interfaceText?: unknown;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsIn = (
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
  isRecord(value) ? Object.values(value).filter(isRecord) : [];

/** Every attribute the codebook defines, of people, connections and ego. */
const codebookVariables = (
  codebook: unknown,
): readonly Readonly<Record<string, unknown>>[] => {
  if (!isRecord(codebook)) return [];
  const entities = [
    ...recordsIn(codebook.node),
    ...recordsIn(codebook.edge),
    ...(isRecord(codebook.ego) ? [codebook.ego] : []),
  ];
  return entities.flatMap((entity) => recordsIn(entity.variables));
};

const stagesOf = (
  protocol: ProtocolDocument,
): readonly Readonly<Record<string, unknown>>[] =>
  (protocol.stages ?? []).filter(isRecord);

/** Whether the protocol asks for a passphrase anywhere. */
const usesPassphrase = (protocol: ProtocolDocument) =>
  codebookVariables(protocol.codebook).some(
    (variable) => variable.encrypted === true,
  ) || stagesOf(protocol).some((stage) => stage.type === 'Anonymisation');

/**
 * Stage types that always show the form text and the Yes and No answers: a
 * form of their own, or a Dyad Census's Yes and No.
 */
const FORM_STAGE_TYPES: ReadonlySet<string> = new Set([
  'EgoForm',
  'AlterForm',
  'AlterEdgeForm',
  'NameGenerator',
  'NameGeneratorQuickAdd',
  'FamilyPedigree',
  'DyadCensus',
]);

/**
 * A roster's cards show the answers in the columns it lists, a yes-or-no one
 * as Yes or No; a roster that lists none shows only each person's name.
 */
const showsAnswersOnCards = (stage: Readonly<Record<string, unknown>>) =>
  stage.type === 'NameGeneratorRoster' &&
  isRecord(stage.cardOptions) &&
  Array.isArray(stage.cardOptions.additionalProperties) &&
  stage.cardOptions.additionalProperties.length > 0;

/**
 * A Categorical Bin asks for the answer behind its "other" bin in a form
 * dialog, on a prompt that names a variable for it.
 */
const asksInAFormDialog = (stage: Readonly<Record<string, unknown>>) =>
  stage.type === 'CategoricalBin' &&
  Array.isArray(stage.prompts) &&
  stage.prompts.some(
    (prompt) => isRecord(prompt) && typeof prompt.otherVariable === 'string',
  );

/**
 * Where a stage holds a form of its own: an edge's or a prompt's `form`, or
 * the form a Network Composer's inspector shows for a selected person.
 */
const FORM_KEYS = ['form', 'nodeForm'] as const;

/** A form the interview shows: one with fields to answer. */
const isShownForm = (value: unknown) =>
  isRecord(value) && Array.isArray(value.fields) && value.fields.length > 0;

const holdsAForm = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(holdsAForm);
  if (!isRecord(value)) return false;
  if (FORM_KEYS.some((key) => isShownForm(value[key]))) return true;
  return Object.values(value).some(holdsAForm);
};

/**
 * Whether the interview shows the form text and the Yes and No answers: a
 * stage's own form, such as a
 * Network Composer's fields or a Categorical Bin's dialog, a Dyad Census's
 * Yes and No, a roster's cards, or the form that asks for a passphrase.
 */
const usesForms = (protocol: ProtocolDocument) =>
  usesPassphrase(protocol) ||
  stagesOf(protocol).some(
    (stage) =>
      (typeof stage.type === 'string' && FORM_STAGE_TYPES.has(stage.type)) ||
      asksInAFormDialog(stage) ||
      showsAnswersOnCards(stage) ||
      holdsAForm(stage),
  );

/**
 * Every record the protocol holds anywhere in its codebook and stages: where
 * an input control and its parameters may be declared, since a Network
 * Composer's field can set its own.
 */
const recordsWithin = (
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] => {
  if (Array.isArray(value)) return value.flatMap(recordsWithin);
  if (!isRecord(value)) return [];
  return [value, ...Object.values(value).flatMap(recordsWithin)];
};

/** The validation rules whose message is held under another name. */
const VALIDATION_RULE_MESSAGES: Readonly<Record<string, string>> = {
  greaterThanVariable: 'greaterThan',
  lessThanVariable: 'lessThan',
  greaterThanOrEqualToVariable: 'greaterThanOrEqual',
  lessThanOrEqualToVariable: 'lessThanOrEqual',
};

/** The bounds a date control sets on its answer: each one's message. */
const dateBoundMessages = (
  control: Readonly<Record<string, unknown>>,
): readonly string[] => {
  // A relative date picker always bounds its answer on both sides, from its
  // anchor and the days before and after it.
  if (control.component === 'RelativeDatePicker') return ['minDate', 'maxDate'];
  if (control.component !== 'DatePicker') return [];
  const parameters = isRecord(control.parameters) ? control.parameters : {};
  return [
    ...(typeof parameters.min === 'string' ? ['minDate'] : []),
    ...(typeof parameters.max === 'string' ? ['maxDate'] : []),
  ];
};

/**
 * Stage types whose own question must be answered before going on: a Family
 * Pedigree's questions about each person, and each pair a Dyad Census or Tie
 * Strength Census asks about.
 */
const ANSWER_REQUIRED_STAGE_TYPES: ReadonlySet<string> = new Set([
  'FamilyPedigree',
  'DyadCensus',
  'TieStrengthCensus',
]);

/**
 * The rules the interview applies of its own accord, whatever the codebook
 * says: a passphrase must be given, confirmed and long enough (and no longer
 * than an Anonymisation stage allows), and some stages' own questions must be
 * answered.
 */
const interviewValidationMessages = (
  protocol: ProtocolDocument,
): readonly string[] => {
  const stages = stagesOf(protocol);
  return [
    ...(usesPassphrase(protocol) ? ['required', 'minLength', 'sameAs'] : []),
    ...(stages.some(
      (stage) =>
        stage.type === 'Anonymisation' &&
        isRecord(stage.validation) &&
        typeof stage.validation.maxLength === 'number',
    )
      ? ['maxLength']
      : []),
    ...(stages.some(
      (stage) =>
        typeof stage.type === 'string' &&
        ANSWER_REQUIRED_STAGE_TYPES.has(stage.type),
    )
      ? ['required']
      : []),
  ];
};

/**
 * The validation messages a protocol can show: one for each rule its
 * attributes use, one for each bound its date controls set, and those of the
 * rules the interview applies itself.
 */
const validationMessagesUsed = (
  protocol: ProtocolDocument,
): ReadonlySet<string> => {
  const used = new Set<string>(interviewValidationMessages(protocol));
  for (const variable of codebookVariables(protocol.codebook)) {
    if (!isRecord(variable.validation)) continue;
    for (const [rule, value] of Object.entries(variable.validation)) {
      if (value === undefined || value === false) continue;
      const message = VALIDATION_RULE_MESSAGES[rule] ?? rule;
      if (message in VALIDATION_INTERFACE_TEXT) used.add(message);
    }
  }
  for (const control of recordsWithin([protocol.codebook, protocol.stages])) {
    for (const message of dateBoundMessages(control)) used.add(message);
  }
  return used;
};

type InterfaceTextGroup = Readonly<{
  entries: Readonly<Record<string, InterfaceTextEntry>>;
  /** Whether a protocol shows the group's text; it is held only then. */
  usedBy: (protocol: ProtocolDocument) => boolean;
  /**
   * Which of the group's entries a protocol shows, when it shows only some;
   * the rest are not held. Absent, a used group holds every entry.
   */
  entriesUsedBy?: (protocol: ProtocolDocument) => ReadonlySet<string>;
}>;

const hasStage = (
  protocol: ProtocolDocument,
  shows: (stage: Readonly<Record<string, unknown>>) => boolean,
) => stagesOf(protocol).some(shows);

const ofType =
  (...types: readonly string[]) =>
  (stage: Readonly<Record<string, unknown>>) =>
    typeof stage.type === 'string' && types.includes(stage.type);

/** A Sociogram or Narrative shows the layout toggle while its layout is on. */
const showsLayoutToggle = (stage: Readonly<Record<string, unknown>>) =>
  ofType('Sociogram', 'Narrative')(stage) &&
  behaviourIsOn(stage, 'automaticLayout');

/**
 * A roster always reads its people from an external source, and another name
 * generator does when it has a panel that does: either says so when the
 * source cannot be loaded.
 */
const showsExternalData = (stage: Readonly<Record<string, unknown>>) =>
  ofType('NameGeneratorRoster')(stage) ||
  (ofType('NameGenerator', 'NameGeneratorQuickAdd')(stage) &&
    hasExternalPanels(stage));

/**
 * Which buttons the protocol shows: Cancel, Done, Delete and those that copy
 * a screen error's details always, Yes and No with a form, Save on a Family
 * Pedigree and in a Categorical Bin's dialog, Don't know, Undo, Redo and Skip
 * on a Family Pedigree, zooming on either pedigree, and the layout toggle on
 * a canvas whose automatic layout is on. A button any stage may come to show,
 * such as Undo or Zoom in, is worded once here rather than by each kind of
 * stage that shows it.
 */
const buttonsUsed = (protocol: ProtocolDocument): ReadonlySet<string> =>
  new Set([
    'cancel',
    'done',
    'delete',
    'copy',
    'copied',
    ...(usesForms(protocol) ? ['yes', 'no'] : []),
    ...(hasStage(protocol, ofType('FamilyPedigree')) ||
    hasStage(protocol, asksInAFormDialog)
      ? ['save']
      : []),
    ...(hasStage(protocol, ofType('FamilyPedigree'))
      ? ['dontKnow', 'undo', 'redo', 'skip']
      : []),
    ...(hasStage(protocol, ofType('FamilyPedigree', 'NarrativePedigree'))
      ? ['zoomIn', 'zoomOut']
      : []),
    ...(hasStage(protocol, showsLayoutToggle)
      ? ['pauseLayout', 'resumeLayout']
      : []),
  ]);

/**
 * Which messages the protocol shows: the errors and the loading notice any
 * interview may show, the name of someone left unnamed, and the external
 * data error on a stage that loads people from a file.
 */
const messagesUsed = (protocol: ProtocolDocument): ReadonlySet<string> =>
  new Set([
    'stageError',
    'itemUnavailable',
    'error',
    'loading',
    'unnamed',
    ...(hasStage(protocol, showsExternalData) ? ['externalDataError'] : []),
  ]);

/**
 * Every group of interface text, in the order Architect lists them, and when
 * a protocol holds it.
 */
const INTERFACE_TEXT_GROUPS = {
  navigation: { entries: NAVIGATION_INTERFACE_TEXT, usedBy: () => true },
  interviewer: { entries: INTERVIEWER_INTERFACE_TEXT, usedBy: () => true },
  buttons: {
    entries: BUTTONS_INTERFACE_TEXT,
    usedBy: () => true,
    entriesUsedBy: buttonsUsed,
  },
  messages: {
    entries: MESSAGES_INTERFACE_TEXT,
    usedBy: () => true,
    entriesUsedBy: messagesUsed,
  },
  // The interview's list of screens can always be searched.
  search: { entries: SEARCH_INTERFACE_TEXT, usedBy: () => true },
  passphrase: { entries: PASSPHRASE_INTERFACE_TEXT, usedBy: usesPassphrase },
  forms: { entries: FORMS_INTERFACE_TEXT, usedBy: usesForms },
  validation: {
    entries: VALIDATION_INTERFACE_TEXT,
    usedBy: (protocol) => validationMessagesUsed(protocol).size > 0,
    entriesUsedBy: validationMessagesUsed,
  },
  // Shared by every stage of one kind (see `STAGE_TYPE_INTERFACE_TEXT`).
  familyTreeView: {
    entries: FAMILY_TREE_VIEW_INTERFACE_TEXT,
    usedBy: (protocol) =>
      hasStage(protocol, ofType('FamilyPedigree', 'NarrativePedigree')),
  },
  familyPedigree: {
    entries: FAMILY_PEDIGREE_INTERFACE_TEXT,
    usedBy: (protocol) => hasStage(protocol, ofType('FamilyPedigree')),
  },
  categoricalBin: {
    entries: CATEGORICAL_BIN_INTERFACE_TEXT,
    usedBy: (protocol) => hasStage(protocol, ofType('CategoricalBin')),
  },
  quickAdd: {
    entries: QUICK_ADD_INTERFACE_TEXT,
    usedBy: (protocol) => hasStage(protocol, ofType('NameGeneratorQuickAdd')),
  },
  roster: {
    entries: ROSTER_INTERFACE_TEXT,
    usedBy: (protocol) => hasStage(protocol, ofType('NameGeneratorRoster')),
  },
  networkComposer: {
    entries: NETWORK_COMPOSER_INTERFACE_TEXT,
    usedBy: (protocol) => hasStage(protocol, ofType('NetworkComposer')),
  },
  egoForm: {
    entries: EGO_FORM_INTERFACE_TEXT,
    usedBy: (protocol) => hasStage(protocol, ofType('EgoForm')),
  },
} as const satisfies Readonly<Record<string, InterfaceTextGroup>>;

/**
 * The interface text groups every stage of a kind shares, by stage type: what
 * a stage editor's Wording section shows as shared by every stage of its
 * kind.
 */
export const STAGE_TYPE_INTERFACE_TEXT: Readonly<
  Record<string, readonly GroupName[]>
> = {
  FamilyPedigree: ['familyPedigree', 'familyTreeView'],
  NarrativePedigree: ['familyTreeView'],
  CategoricalBin: ['categoricalBin'],
  NameGeneratorQuickAdd: ['quickAdd'],
  NameGeneratorRoster: ['roster'],
  NetworkComposer: ['networkComposer'],
  EgoForm: ['egoForm'],
};

type GroupName = keyof typeof INTERFACE_TEXT_GROUPS;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys of the `as const` INTERFACE_TEXT_GROUPS table, so exactly GroupName
const GROUP_NAMES = Object.keys(INTERFACE_TEXT_GROUPS) as GroupName[];

const entrySchema = (entry: InterfaceTextEntry) =>
  entry.arguments === undefined
    ? localizedString(nonBlankText(), entry.format ?? 'plain')
    : localizedMessage(nonBlankText(), {
        arguments: requireSuppliedPlacements(entry.arguments, entry.message),
      });

const groupSchema = (entries: Readonly<Record<string, InterfaceTextEntry>>) =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [key, entrySchema(entry)]),
    ),
  );

/** A group whose entries are each held only while the protocol shows it. */
const partialGroupSchema = (
  entries: Readonly<Record<string, InterfaceTextEntry>>,
) =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [
        key,
        entrySchema(entry).optional(),
      ]),
    ),
  );

export const InterfaceTextSchema = z.strictObject({
  navigation: groupSchema(NAVIGATION_INTERFACE_TEXT).optional(),
  interviewer: groupSchema(INTERVIEWER_INTERFACE_TEXT).optional(),
  buttons: partialGroupSchema(BUTTONS_INTERFACE_TEXT).optional(),
  messages: partialGroupSchema(MESSAGES_INTERFACE_TEXT).optional(),
  search: groupSchema(SEARCH_INTERFACE_TEXT).optional(),
  passphrase: groupSchema(PASSPHRASE_INTERFACE_TEXT).optional(),
  forms: groupSchema(FORMS_INTERFACE_TEXT).optional(),
  validation: partialGroupSchema(VALIDATION_INTERFACE_TEXT).optional(),
  familyTreeView: groupSchema(FAMILY_TREE_VIEW_INTERFACE_TEXT).optional(),
  familyPedigree: groupSchema(FAMILY_PEDIGREE_INTERFACE_TEXT).optional(),
  categoricalBin: groupSchema(CATEGORICAL_BIN_INTERFACE_TEXT).optional(),
  quickAdd: groupSchema(QUICK_ADD_INTERFACE_TEXT).optional(),
  roster: groupSchema(ROSTER_INTERFACE_TEXT).optional(),
  networkComposer: groupSchema(NETWORK_COMPOSER_INTERFACE_TEXT).optional(),
  egoForm: groupSchema(EGO_FORM_INTERFACE_TEXT).optional(),
});

/**
 * The interface text a protocol holds, by group and name. An entry of a group
 * held only in part (`buttons`, `messages`, `validation`) may be absent.
 */
export type InterfaceText = Readonly<
  Partial<
    Record<GroupName, Readonly<Record<string, LocalizedString | undefined>>>
  >
>;

const isGroupName = (group: string): group is GroupName =>
  Object.hasOwn(INTERFACE_TEXT_GROUPS, group);

/** The arguments one interface text may use, when it takes any. */
export const interfaceTextArguments = (
  group: string,
  key: string,
): MessageArguments | undefined => {
  if (!isGroupName(group)) return undefined;
  const entries: Readonly<Record<string, InterfaceTextEntry | undefined>> =
    INTERFACE_TEXT_GROUPS[group].entries;
  return entries[key]?.arguments;
};

/** Every interface text entry Network Canvas supplies wording for. */
export const INTERFACE_TEXT_WORDING: readonly InterfaceTextEntry[] =
  GROUP_NAMES.flatMap((group) =>
    Object.values<InterfaceTextEntry>(INTERFACE_TEXT_GROUPS[group].entries),
  );

/**
 * Where the protocol holds each interface text, and the messages of the
 * interview's (or a shared package's) catalog it stands in for: what the
 * interview overlays the protocol's text onto. An entry that stands in for
 * several messages has a row for each.
 */
export const INTERFACE_TEXT_MESSAGES: readonly Readonly<{
  group: string;
  key: string;
  id: string;
}>[] = GROUP_NAMES.flatMap((group) =>
  Object.entries(INTERFACE_TEXT_GROUPS[group].entries).flatMap(
    ([key, entry]: [string, InterfaceTextEntry]) =>
      entry.ids.map((id) => ({ group, key, id })),
  ),
);

/**
 * The text Network Canvas writes for an entry in a protocol language: its
 * supplied wording there, or, in the default language when it supplies none,
 * the English wording, since every entry the protocol holds is required (the
 * rule for every supplied setting; see `supplied-stage-text.ts`).
 */
const writtenIn = (
  entry: InterfaceTextEntry,
  locale: LocaleTag,
  isDefault: boolean,
): string | undefined =>
  suppliedTextFor(entry.message, locale) ??
  (isDefault ? entry.message.en : undefined);

const suppliedValue = (
  entry: InterfaceTextEntry,
  localization: LocalizationDeclaration,
): LocalizedString => {
  const value: Record<LocaleTag, string> = {};
  for (const locale of localization.locales) {
    const text = writtenIn(
      entry,
      locale,
      locale === localization.defaultLocale,
    );
    if (text !== undefined) value[locale] = text;
  }
  return value;
};

/**
 * Network Canvas's wording for one interface text in the languages `localization`
 * declares, as a protocol is given it (see `interfaceTextFor`); undefined for
 * an entry that does not exist.
 */
export const suppliedInterfaceText = (
  group: string,
  key: string,
  localization: LocalizationDeclaration,
): LocalizedString | undefined => {
  if (!isGroupName(group)) return undefined;
  const entries: Readonly<Record<string, InterfaceTextEntry | undefined>> =
    INTERFACE_TEXT_GROUPS[group].entries;
  const entry = entries[key];
  return entry === undefined ? undefined : suppliedValue(entry, localization);
};

const heldText = (protocol: ProtocolDocument): InterfaceText =>
  isRecord(protocol.interfaceText)
    ? (protocol.interfaceText as InterfaceText)
    : {};

/**
 * The interface text `protocol` should hold: each group it uses, keeping
 * every entry it already has and gaining Network Canvas's wording for any it
 * lacks, and no group or entry it does not use.
 */
export const interfaceTextFor = (protocol: ProtocolDocument): InterfaceText => {
  const held = heldText(protocol);
  const next: Partial<Record<GroupName, Record<string, LocalizedString>>> = {};
  for (const group of GROUP_NAMES) {
    const { entries, usedBy, entriesUsedBy }: InterfaceTextGroup =
      INTERFACE_TEXT_GROUPS[group];
    if (!usedBy(protocol)) continue;
    const shown = entriesUsedBy?.(protocol);
    const current = held[group] ?? {};
    next[group] = Object.fromEntries(
      Object.entries(entries)
        .filter(([key]) => shown === undefined || shown.has(key))
        .map(([key, entry]) => [
          key,
          current[key] ?? suppliedValue(entry, protocol.localization),
        ]),
    );
  }
  return next;
};

const sameText = (a: InterfaceText, b: InterfaceText): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * `protocol` holding the interface text it should (see `interfaceTextFor`):
 * the same protocol when it already does, so a caller can tell nothing
 * changed.
 */
export const withInterfaceText = <Protocol extends ProtocolDocument>(
  protocol: Protocol,
): Protocol => {
  const next = interfaceTextFor(protocol);
  return sameText(next, heldText(protocol)) &&
    protocol.interfaceText !== undefined
    ? protocol
    : { ...protocol, interfaceText: next };
};

/** One interface text, by group and name, as it reads after a change. */
export type InterfaceTextUpdate = Readonly<{
  group: string;
  key: string;
  value: LocalizedString;
}>;

/**
 * The interface text that follows a change to the protocol's languages (see
 * `suppliedTextAfterLanguageChange`), as it reads after it: each entry whose
 * default-language text before the change is still Network Canvas's. One the
 * researcher has reworded is theirs, and is not among them.
 */
export const interfaceTextAfterLanguageChange = (
  text: InterfaceText,
  change: LanguageChange,
): readonly InterfaceTextUpdate[] => {
  const { defaultLocale } = change.before;
  return GROUP_NAMES.flatMap((group) =>
    Object.entries(INTERFACE_TEXT_GROUPS[group].entries).flatMap(
      ([key, entry]: [string, InterfaceTextEntry]) => {
        const value = text[group]?.[key];
        if (
          value?.[defaultLocale] === undefined ||
          value[defaultLocale] !== writtenIn(entry, defaultLocale, true)
        ) {
          return [];
        }
        return [
          {
            group,
            key,
            value: suppliedTextAfterLanguageChange(
              value,
              (locale, isDefault) => writtenIn(entry, locale, isDefault),
              change,
            ),
          },
        ];
      },
    ),
  );
};
