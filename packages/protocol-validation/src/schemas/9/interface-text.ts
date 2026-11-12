import { z } from 'zod';

import type {
  LocaleTag,
  LocalizationDeclaration,
} from '../../localization/localeTag.ts';
import type { MessageArguments } from '../../localization/messageArguments.ts';
import {
  BUTTONS_INTERFACE_TEXT,
  CATEGORICAL_BIN_INTERFACE_TEXT,
  FAMILY_PEDIGREE_INTERFACE_TEXT,
  FAMILY_TREE_VIEW_INTERFACE_TEXT,
  FORMS_INTERFACE_TEXT,
  GEOSPATIAL_INTERFACE_TEXT,
  type InterfaceTextEntry,
  INTERVIEWER_INTERFACE_TEXT,
  MESSAGES_INTERFACE_TEXT,
  NARRATIVE_INTERFACE_TEXT,
  NARRATIVE_PEDIGREE_INTERFACE_TEXT,
  NAVIGATION_INTERFACE_TEXT,
  NETWORK_COMPOSER_INTERFACE_TEXT,
  PASSPHRASE_INTERFACE_TEXT,
  QUICK_ADD_INTERFACE_TEXT,
  SEARCH_INTERFACE_TEXT,
  VALIDATION_INTERFACE_TEXT,
} from './interface-text-wording.ts';
import {
  heldTranslations,
  type LocalizedString,
  localizedMessage,
  localizedString,
  nonBlankText,
} from './localized-string.ts';
import { placesByTapping } from './stage-wording/bins.ts';
import { hasExternalPanels, hasMapSearch } from './stage-wording/conditions.ts';
import { behaviourIsOn } from './stage-wording/configuration.ts';
import {
  choosesFraming,
  tracksCompleteness,
} from './stage-wording/family-pedigree.ts';
import { showsAtRiskStatuses } from './stage-wording/narrative-pedigree.ts';
import {
  hasEdgeTypes,
  hasGroups,
  hasInspectorForm,
  leavesEdgeTypesUndrawn,
} from './stage-wording/network-composer.ts';
import { suppliedTextFor } from './supplied-text.ts';

/**
 * The interface text a protocol holds: the words the interview shows that
 * are not one stage's own, in the protocol's own languages. A protocol may
 * hold any of it, or none: for each text it does not hold in a language, the
 * interview shows Network Canvas's own wording where Network Canvas has it in
 * that language (`interfaceTextShown`). Every text the protocol shows must
 * have text in the protocol's default language, counting Network Canvas's
 * wording for that language (`findBuiltInWordingProblems`). Text only screen
 * readers read is not interface text: the interview words it in English
 * whatever the protocol's languages, so no group holds a message the
 * interview gives only to screen readers.
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
 * A protocol shows only the text it can show: the `navigation`,
 * `interviewer` and `search` groups always, the `buttons` and `messages`
 * groups always but for the entries only some stages show (Yes and No where
 * a question is answered with them, Don't know on a Family Pedigree), each
 * other group only while the protocol uses what it is for, of a stage type's
 * group only the entries a stage of that type is configured to show (a
 * Network Composer's Groups tool only while one has groups), and of the
 * validation group only the messages of the rules it uses (see
 * `INTERFACE_TEXT_GROUPS`). A protocol holds an entry only where its author
 * changed the wording: Architect shows Network Canvas's wording for the rest,
 * keeps what the researcher changes or writes in a language Network Canvas
 * has no wording in, and removes an entry the protocol stops showing.
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

/** The names of the edge types the codebook defines. */
const codebookEdgeTypes = (codebook: unknown): readonly string[] =>
  isRecord(codebook) && isRecord(codebook.edge)
    ? Object.keys(codebook.edge)
    : [];

const stagesOf = (
  protocol: ProtocolDocument,
): readonly Readonly<Record<string, unknown>>[] =>
  (protocol.stages ?? []).filter(isRecord);

/** Whether any of the protocol's answers are encrypted. */
const encryptsAnswers = (protocol: ProtocolDocument) =>
  codebookVariables(protocol.codebook).some(
    (variable) => variable.encrypted === true,
  );

/** Whether the protocol asks for a passphrase anywhere. */
const usesPassphrase = (protocol: ProtocolDocument) =>
  encryptsAnswers(protocol) ||
  stagesOf(protocol).some((stage) => stage.type === 'Anonymisation');

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

/** Stage types whose own question is answered Yes or No. */
const YES_OR_NO_STAGE_TYPES: ReadonlySet<string> = new Set([
  'DyadCensus',
  'FamilyPedigree',
]);

/**
 * Whether the interview shows the Yes and No answers: to a Dyad Census's
 * question or a Family Pedigree's, on a roster's cards, or to a yes-or-no
 * attribute, which any form may ask.
 */
const asksYesOrNo = (protocol: ProtocolDocument) =>
  codebookVariables(protocol.codebook).some(
    (variable) => variable.type === 'boolean',
  ) ||
  stagesOf(protocol).some(
    (stage) =>
      (typeof stage.type === 'string' &&
        YES_OR_NO_STAGE_TYPES.has(stage.type)) ||
      showsAnswersOnCards(stage),
  );

/**
 * Stage types whose form asks before discarding answers that cannot be
 * saved, as the participant goes back or jumps elsewhere.
 */
const DISCARDING_FORM_STAGE_TYPES: ReadonlySet<string> = new Set([
  'EgoForm',
  'AlterForm',
  'AlterEdgeForm',
]);

/**
 * Whether the interview can ask whether to discard changes: on a form stage,
 * or as a Network Composer's inspector leaves a form it cannot save.
 */
const showsDiscardDialog = (protocol: ProtocolDocument) =>
  stagesOf(protocol).some(
    (stage) =>
      (typeof stage.type === 'string' &&
        DISCARDING_FORM_STAGE_TYPES.has(stage.type)) ||
      (stage.type === 'NetworkComposer' && hasInspectorForm(stage)),
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

/**
 * Whether a stage configured as it is shows a text, which may depend on the
 * rest of the protocol too (a Network Composer names a connection of a type
 * it does not draw only while the codebook has one).
 */
type ShownWhen = (
  stage: Readonly<Record<string, unknown>>,
  protocol: ProtocolDocument,
) => boolean;

/**
 * A group every stage of one type shows, held while the protocol has such a
 * stage (one that `shows` it, when only stages configured a certain way do).
 * An entry named in `shownWhen` is shown only by a stage configured a certain
 * way, and is held only while one is.
 */
const stageTypeGroup = (
  stageType: string,
  entries: Readonly<Record<string, InterfaceTextEntry>>,
  shownWhen: Readonly<Record<string, ShownWhen>> = {},
  shows: (stage: Readonly<Record<string, unknown>>) => boolean = () => true,
): InterfaceTextGroup => {
  const showsGroup = (stage: Readonly<Record<string, unknown>>) =>
    ofType(stageType)(stage) && shows(stage);
  return {
    entries,
    usedBy: (protocol) => hasStage(protocol, showsGroup),
    entriesUsedBy: (protocol) =>
      new Set(
        Object.keys(entries).filter((key) => {
          const when = shownWhen[key];
          return (
            when === undefined ||
            hasStage(
              protocol,
              (stage) => showsGroup(stage) && when(stage, protocol),
            )
          );
        }),
      ),
  };
};

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
 * Which buttons the protocol shows: Cancel and those that copy a screen
 * error's details always, Done on a Name Generator's form, Delete on a Family
 * Pedigree and in a Network Composer's inspector, Yes and No where a question
 * is answered with them (and Yes as the discard dialog's confirm button), Save
 * on a Family Pedigree and in a Categorical Bin's dialog, Don't know, Undo,
 * Redo and Skip on a Family Pedigree, zooming on either pedigree, and the
 * layout toggle on a canvas whose automatic layout is on. A button several
 * kinds of stage show, such as Zoom in, is worded once here rather than by
 * each kind of stage that shows it.
 */
const buttonsUsed = (protocol: ProtocolDocument): ReadonlySet<string> =>
  new Set([
    'cancel',
    'copy',
    'copied',
    ...(hasStage(protocol, ofType('NameGenerator')) ? ['done'] : []),
    ...(hasStage(protocol, ofType('FamilyPedigree', 'NetworkComposer'))
      ? ['delete']
      : []),
    ...(asksYesOrNo(protocol) || showsDiscardDialog(protocol) ? ['yes'] : []),
    ...(asksYesOrNo(protocol) ? ['no'] : []),
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

/** An Information stage that shows a file, which may fail to display. */
const showsAFile = (stage: Readonly<Record<string, unknown>>) =>
  stage.type === 'Information' &&
  Array.isArray(stage.items) &&
  stage.items.some((item) => isRecord(item) && item.type === 'asset');

/**
 * Which messages the protocol shows: the errors any interview may show and
 * the name of someone left unnamed, the notice that a file could not be
 * shown on an Information stage that shows one, and the loading notice and
 * the external data error on a stage that loads people from a file.
 */
const messagesUsed = (protocol: ProtocolDocument): ReadonlySet<string> =>
  new Set([
    'stageError',
    'error',
    'unnamed',
    ...(hasStage(protocol, showsAFile) ? ['itemUnavailable'] : []),
    ...(hasStage(protocol, showsExternalData)
      ? ['loading', 'externalDataError']
      : []),
  ]);

/** The passphrase text about answers that are encrypted. */
const ENCRYPTED_ANSWER_TEXT: ReadonlySet<string> = new Set([
  'protectedAnswersLocked',
  'protectedAnswersNotSaved',
  'answerUnavailable',
  'answerUnavailableKept',
]);

/**
 * Which passphrase text the protocol shows: what asks for the passphrase and
 * checks it always, what says answers are locked or could not be read only
 * while answers are encrypted, and the notice that the passphrase was
 * accepted only on an Anonymisation stage, where it is chosen.
 */
const passphraseTextUsed = (protocol: ProtocolDocument): ReadonlySet<string> =>
  new Set(
    Object.keys(PASSPHRASE_INTERFACE_TEXT).filter((key) => {
      if (ENCRYPTED_ANSWER_TEXT.has(key)) return encryptsAnswers(protocol);
      if (key === 'passphraseAccepted') {
        return hasStage(protocol, ofType('Anonymisation'));
      }
      return true;
    }),
  );

/**
 * Every group of interface text, in the order Architect lists them, and when
 * a protocol shows it.
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
  passphrase: {
    entries: PASSPHRASE_INTERFACE_TEXT,
    usedBy: usesPassphrase,
    entriesUsedBy: passphraseTextUsed,
  },
  forms: { entries: FORMS_INTERFACE_TEXT, usedBy: showsDiscardDialog },
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
  familyPedigree: stageTypeGroup(
    'FamilyPedigree',
    FAMILY_PEDIGREE_INTERFACE_TEXT,
    {
      framingControlLabel: choosesFraming,
      framingControlDescription: choosesFraming,
      framingChoiceTitle: choosesFraming,
      framingChoiceDescription: choosesFraming,
      trackerAllDetails: tracksCompleteness,
    },
  ),
  narrativePedigree: stageTypeGroup(
    'NarrativePedigree',
    NARRATIVE_PEDIGREE_INTERFACE_TEXT,
    { mayDevelop: showsAtRiskStatuses, mayCarry: showsAtRiskStatuses },
  ),
  // Only a Categorical Bin that places nodes by tapping shows its button.
  categoricalBin: stageTypeGroup(
    'CategoricalBin',
    CATEGORICAL_BIN_INTERFACE_TEXT,
    {},
    placesByTapping,
  ),
  quickAdd: stageTypeGroup('NameGeneratorQuickAdd', QUICK_ADD_INTERFACE_TEXT),
  networkComposer: stageTypeGroup(
    'NetworkComposer',
    NETWORK_COMPOSER_INTERFACE_TEXT,
    {
      overtakenEditNotice: hasInspectorForm,
      groupsHeading: hasGroups,
      drawEdgeTooltip: hasEdgeTypes,
      connection: (stage, protocol) =>
        leavesEdgeTypesUndrawn(stage, codebookEdgeTypes(protocol.codebook)),
    },
  ),
  // Only a Narrative whose drawing is on shows its drawing tools.
  narrative: stageTypeGroup(
    'Narrative',
    NARRATIVE_INTERFACE_TEXT,
    {},
    (stage) => behaviourIsOn(stage, 'freeDraw'),
  ),
  geospatial: stageTypeGroup('Geospatial', GEOSPATIAL_INTERFACE_TEXT, {
    searchFailed: hasMapSearch,
  }),
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
  NarrativePedigree: ['narrativePedigree', 'familyTreeView'],
  CategoricalBin: ['categoricalBin'],
  NameGeneratorQuickAdd: ['quickAdd'],
  NetworkComposer: ['networkComposer'],
  Narrative: ['narrative'],
  Geospatial: ['geospatial'],
};

type GroupName = keyof typeof INTERFACE_TEXT_GROUPS;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- keys of the `as const` INTERFACE_TEXT_GROUPS table, so exactly GroupName
const GROUP_NAMES = Object.keys(INTERFACE_TEXT_GROUPS) as GroupName[];

const entrySchema = (entry: InterfaceTextEntry) =>
  entry.arguments === undefined
    ? localizedString(
        nonBlankText(),
        entry.shape ?? { format: 'plain', lines: 'single' },
      )
    : localizedMessage(nonBlankText(), {
        arguments: entry.arguments,
      });

/**
 * A group whose entries are each optional: the interview shows Network
 * Canvas's wording for an entry the protocol does not hold.
 */
const groupSchema = (entries: Readonly<Record<string, InterfaceTextEntry>>) =>
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
  buttons: groupSchema(BUTTONS_INTERFACE_TEXT).optional(),
  messages: groupSchema(MESSAGES_INTERFACE_TEXT).optional(),
  search: groupSchema(SEARCH_INTERFACE_TEXT).optional(),
  passphrase: groupSchema(PASSPHRASE_INTERFACE_TEXT).optional(),
  forms: groupSchema(FORMS_INTERFACE_TEXT).optional(),
  validation: groupSchema(VALIDATION_INTERFACE_TEXT).optional(),
  familyTreeView: groupSchema(FAMILY_TREE_VIEW_INTERFACE_TEXT).optional(),
  familyPedigree: groupSchema(FAMILY_PEDIGREE_INTERFACE_TEXT).optional(),
  narrativePedigree: groupSchema(NARRATIVE_PEDIGREE_INTERFACE_TEXT).optional(),
  categoricalBin: groupSchema(CATEGORICAL_BIN_INTERFACE_TEXT).optional(),
  quickAdd: groupSchema(QUICK_ADD_INTERFACE_TEXT).optional(),
  networkComposer: groupSchema(NETWORK_COMPOSER_INTERFACE_TEXT).optional(),
  narrative: groupSchema(NARRATIVE_INTERFACE_TEXT).optional(),
  geospatial: groupSchema(GEOSPATIAL_INTERFACE_TEXT).optional(),
});

/**
 * The interface text a protocol holds, by group and name. An entry of a group
 * held only in part (`buttons`, `messages`, `passphrase`, `validation`, and a
 * stage type's entries shown only in some configurations) may be absent.
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

/**
 * Where a protocol may hold each interface text, and the messages of the
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
 * wording in exactly that language, and none in any other. An entry with no
 * wording in the default language must be written there before the protocol
 * leaves its editor (`findBuiltInWordingProblems`).
 */
const writtenIn = (
  entry: InterfaceTextEntry,
  locale: LocaleTag,
): string | undefined => suppliedTextFor(entry.message, locale);

const suppliedValue = (
  entry: InterfaceTextEntry,
  localization: LocalizationDeclaration,
): LocalizedString => {
  const value: Record<LocaleTag, string> = {};
  for (const locale of localization.locales) {
    const text = writtenIn(entry, locale);
    if (text !== undefined) value[locale] = text;
  }
  return value;
};

/**
 * Network Canvas's wording for one interface text in the languages
 * `localization` declares; undefined for an entry that does not exist.
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

/**
 * The text the interview shows for one interface text: Network Canvas's
 * wording in every protocol language it writes one in
 * (`suppliedInterfaceText`), with the protocol's own translations of the
 * entry laid over it per language. `interfaceText` is whatever the protocol
 * holds under `interfaceText`, so anything that is not a record of groups
 * reads as holding nothing. Undefined for an entry that does not exist.
 */
export const interfaceTextShown = (
  interfaceText: unknown,
  group: string,
  key: string,
  localization: LocalizationDeclaration,
): LocalizedString | undefined => {
  const supplied = suppliedInterfaceText(group, key, localization);
  if (supplied === undefined) return undefined;
  const entries = isRecord(interfaceText) ? interfaceText[group] : undefined;
  const held = isRecord(entries) ? entries[key] : undefined;
  return { ...supplied, ...heldTranslations(held) };
};

/**
 * Every interface text `protocol` shows, as the interview shows it
 * (`interfaceTextShown`): the entries of the groups the protocol uses, in the
 * order of `INTERFACE_TEXT_GROUPS`.
 */
export const interfaceTextShownBy = (
  protocol: ProtocolDocument,
): readonly Readonly<{
  group: string;
  key: string;
  value: LocalizedString;
}>[] =>
  usedInterfaceText(protocol).flatMap(({ group, keys }) =>
    keys.flatMap((key) => {
      const value = interfaceTextShown(
        protocol.interfaceText,
        group,
        key,
        protocol.localization,
      );
      return value === undefined ? [] : [{ group, key, value }];
    }),
  );

/**
 * Every interface text `protocol` shows, by group and name, as the interview
 * shows it (`interfaceTextShownBy`): what an editor of the protocol's words
 * lists and edits. Never what a protocol stores (see `interfaceTextFor`).
 */
export const interfaceTextAsShown = (
  protocol: ProtocolDocument,
): InterfaceText => {
  const shown: Record<string, Record<string, LocalizedString>> = {};
  for (const { group, key, value } of interfaceTextShownBy(protocol)) {
    shown[group] = { ...shown[group], [key]: value };
  }
  return shown;
};

const heldText = (protocol: ProtocolDocument): InterfaceText =>
  isRecord(protocol.interfaceText)
    ? (protocol.interfaceText as InterfaceText)
    : {};

/**
 * The groups `protocol` uses, each with the entries of it the protocol shows:
 * the interface text it shows, and so what `interfaceTextFor` keeps.
 */
const usedInterfaceText = (
  protocol: ProtocolDocument,
): readonly Readonly<{ group: GroupName; keys: readonly string[] }>[] =>
  GROUP_NAMES.flatMap((group) => usedGroup(group, protocol));

/** One group, with the entries of it `protocol` shows, when it uses it. */
const usedGroup = (
  group: GroupName,
  protocol: ProtocolDocument,
): readonly Readonly<{ group: GroupName; keys: readonly string[] }>[] => {
  const { entries, usedBy, entriesUsedBy }: InterfaceTextGroup =
    INTERFACE_TEXT_GROUPS[group];
  if (!usedBy(protocol)) return [];
  const shown = entriesUsedBy?.(protocol);
  const keys = Object.keys(entries).filter(
    (key) => shown === undefined || shown.has(key),
  );
  return [{ group, keys }];
};

/**
 * The shared interface text of `stage`'s kind (`STAGE_TYPE_INTERFACE_TEXT`)
 * that `protocol` would use with `stage` as it stands: in place of the stage
 * with its id, or added when the protocol has none. What a stage editor's
 * shared wording lists while the stage is open, so an entry a setting brings
 * in is there as the setting is turned on, and one it takes out goes as it
 * is turned off, before the stage is saved.
 */
export const sharedStageInterfaceTextUsed = (
  protocol: ProtocolDocument,
  stage: Readonly<Record<string, unknown>>,
): readonly Readonly<{ group: string; keys: readonly string[] }>[] => {
  const groups =
    typeof stage.type === 'string'
      ? (STAGE_TYPE_INTERFACE_TEXT[stage.type] ?? [])
      : [];
  if (groups.length === 0) return [];
  const stages = protocol.stages ?? [];
  const at = stages.findIndex(
    (candidate) => isRecord(candidate) && candidate.id === stage.id,
  );
  const withStage: ProtocolDocument = {
    ...protocol,
    stages: at === -1 ? [...stages, stage] : stages.with(at, stage),
  };
  return groups.flatMap((group) => usedGroup(group, withStage));
};

/**
 * The translations of `value` that are its author's own: every one but a
 * translation that reads exactly as Network Canvas's wording for the entry in
 * that language, which the interview shows whether or not the protocol holds
 * it. Anything that is not a language-to-text map has none.
 */
const ownWording = (
  entry: InterfaceTextEntry,
  value: unknown,
): LocalizedString =>
  Object.fromEntries(
    Object.entries(heldTranslations(value)).filter(
      ([locale, text]) => text !== writtenIn(entry, locale),
    ),
  );

/**
 * The interface text `protocol` should hold: of each entry it shows, the
 * translations that are its author's own (`ownWording`). An entry worded
 * entirely as Network Canvas words it is not held, nor is a group left with
 * no entry, nor any entry or group the protocol does not show.
 */
export const interfaceTextFor = (protocol: ProtocolDocument): InterfaceText => {
  const held = heldText(protocol);
  const next: Partial<Record<GroupName, Record<string, LocalizedString>>> = {};
  for (const { group, keys } of usedInterfaceText(protocol)) {
    const entries: Readonly<Record<string, InterfaceTextEntry>> =
      INTERFACE_TEXT_GROUPS[group].entries;
    const current = held[group] ?? {};
    const kept = keys.flatMap((key) => {
      const entry = entries[key];
      if (entry === undefined) return [];
      const own = ownWording(entry, current[key]);
      return Object.keys(own).length === 0 ? [] : [[key, own] as const];
    });
    if (kept.length > 0) next[group] = Object.fromEntries(kept);
  }
  return next;
};

const sameText = (a: InterfaceText, b: InterfaceText): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * `protocol` holding the interface text it should (see `interfaceTextFor`),
 * and no `interfaceText` at all when that is none: the same protocol when it
 * already does, so a caller can tell nothing changed.
 */
export const withInterfaceText = <Protocol extends ProtocolDocument>(
  protocol: Protocol,
): Protocol => {
  const next = interfaceTextFor(protocol);
  if (Object.keys(next).length === 0) {
    if (protocol.interfaceText === undefined) return protocol;
    const { interfaceText: _held, ...rest } = protocol;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `protocol` without its optional `interfaceText`, so still a Protocol
    return rest as Protocol;
  }
  return protocol.interfaceText !== undefined &&
    sameText(next, heldText(protocol))
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
 * `held` interface text after each of `updates`: the entry an update names
 * holds the translations of the update's value that are its author's own
 * (`ownWording`), and is removed, with a group it leaves empty, when there
 * are none. Every other entry and group is kept as it was. `held` is whatever
 * a protocol's settings hold, so anything that is not a record of groups
 * reads as holding none. An update naming an entry that does not exist is
 * written as it is, for the schema to refuse.
 */
export const interfaceTextWithUpdates = (
  held: unknown,
  updates: readonly InterfaceTextUpdate[],
): Readonly<Record<string, unknown>> => {
  const next: Record<string, unknown> = isRecord(held) ? { ...held } : {};
  for (const { group, key, value } of updates) {
    const current = next[group];
    const entries: Record<string, unknown> = isRecord(current)
      ? { ...current }
      : {};
    const declared: Readonly<Record<string, InterfaceTextEntry | undefined>> =
      isGroupName(group) ? INTERFACE_TEXT_GROUPS[group].entries : {};
    const entry = declared[key];
    const own = entry === undefined ? value : ownWording(entry, value);
    if (Object.keys(own).length === 0) delete entries[key];
    else entries[key] = own;
    if (Object.keys(entries).length === 0) delete next[group];
    else next[group] = entries;
  }
  return next;
};
