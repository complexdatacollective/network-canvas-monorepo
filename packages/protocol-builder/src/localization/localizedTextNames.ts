import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { CurrentProtocol, StageType } from '@codaco/protocol-validation';

import { variableValuesMessages } from '../codebook/codebookMessages.ts';
import { codebookEntityMessages } from '../codebook/components/CodebookEntityEditor.tsx';
import { booleanAnswerFieldMessages } from '../codebook/components/VariableBooleanAnswerFields.tsx';
import { parameterFieldMessages } from '../codebook/components/VariableParameterFields.tsx';
import { anonymisationMessages } from '../editors/anonymisation/sections/anonymisationMessages.ts';
import { categoricalBinPromptMessages } from '../editors/categorical-bin/sections/CategoricalBinPromptsSection.tsx';
import { censusMessages } from '../editors/dyad-census/sections/censusMessages.ts';
import { familyPedigreeMessages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import { finishSessionMessages } from '../editors/finish-session/sections/finishSessionMessages.ts';
import { cardDisplayMessages } from '../editors/name-generator-roster/sections/CardDisplaySection.tsx';
import { sortOptionsMessages } from '../editors/name-generator-roster/sections/SortOptionsSection.tsx';
import { narrativePedigreeMessages } from '../editors/narrative-pedigree/sections/narrativePedigreeMessages.ts';
import { narrativePresetMessages } from '../editors/narrative/sections/presets/narrativePresetMessages.ts';
import { composerMessages } from '../editors/network-composer/sections/composerMessages.ts';
import { sociogramPromptMessages } from '../editors/sociogram/sections/prompts/sociogramPromptMessages.ts';
import { tieStrengthPromptMessages } from '../editors/tie-strength-census/sections/TieStrengthCensusPromptsSection.tsx';
import { geospatialMessages } from '../fields/geospatial/geospatialMessages.ts';
import { stageNameMessages } from '../naming/stageNameInternals.ts';
import { contentBlockMessages } from '../sections/content-blocks/ContentBlockEditor.tsx';
import { composerFormFieldMessages } from '../sections/form-fields/composerFormFieldMessages.ts';
import { formFieldsMessages } from '../sections/form-fields/FormFieldsSection.tsx';
import { introductionMessages } from '../sections/introduction/IntroductionSection.tsx';
import { nameGeneratorPromptMessages } from '../sections/name-generator-prompts/NameGeneratorPromptsSection.tsx';
import { pageContentMessages } from '../sections/page-content/PageContentSection.tsx';
import { nodePanelsMessages } from '../sections/panels/NodePanelsSection.tsx';
import { promptsSectionMessages } from '../sections/PromptsSection.tsx';
import { isStageType } from '../stage-types.ts';

const messages = defineMessages({
  promptPosition: {
    id: 'protocolBuilder.localizedTextNames.promptPosition',
    defaultMessage: 'Prompt {position, number}',
    description:
      'Names one prompt of a stage where a text is listed without its translation. position is the prompt’s place in the stage’s list of prompts, counting from one.',
  },
  fieldPosition: {
    id: 'protocolBuilder.localizedTextNames.fieldPosition',
    defaultMessage: 'Field {position, number}',
    description:
      'Names one field of a form where a text is listed without its translation, used when the field records no attribute the codebook names. position is the field’s place in the form, counting from one.',
  },
  itemPosition: {
    id: 'protocolBuilder.localizedTextNames.itemPosition',
    defaultMessage: 'Item {position, number}',
    description:
      'Names one entry of a list in a stage — a block of page content, a row of a table — where a text is listed without its translation. position is the entry’s place in its list, counting from one.',
  },
  panelPosition: {
    id: 'protocolBuilder.localizedTextNames.panelPosition',
    defaultMessage: 'Panel {position, number}',
    description:
      'Names one side panel of a name generator where its title is listed without a translation. position is the panel’s place in the stage’s list of side panels, counting from one.',
  },
  presetPosition: {
    id: 'protocolBuilder.localizedTextNames.presetPosition',
    defaultMessage: 'Preset {position, number}',
    description:
      'Names one visualization preset of a narrative stage where a text is listed without its translation. position is the preset’s place in the stage’s list of presets, counting from one.',
  },
  interfaceTextGroup: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextGroup',
    defaultMessage:
      '{group, select, interview {Throughout the interview} passphrase {Passphrase} forms {Forms} validation {Answer checks} other {{group}}}',
    description:
      'Names a group of the words the interview itself shows, such as its buttons and messages, where they are listed for translation. group is which: those shown throughout the interview, those shown when answers are protected by a passphrase, those shown with forms, or the messages that say an answer breaks one of its rules.',
  },
  interfaceTextName: {
    id: 'protocolBuilder.localizedTextNames.interfaceTextName',
    defaultMessage:
      '{key, select, exitInterview {Exit button} exitInterviewDescription {Exit explanation} stageError {Screen error message} itemUnavailable {Missing item message} back {Back button} continue {Continue button} cancel {Cancel button} done {Done button} delete {Delete button} genericError {General error message} passphrase {Passphrase field} choosePassphraseHelp {Passphrase advice} passphraseIncorrect {Wrong passphrase message} protectedAnswersLocked {Locked answers message} protectedAnswersNotSaved {Unsaved answers message} protectedAnswersUnavailable {Unavailable answers message} answerUnavailable {Unavailable answer label} answerUnavailableKept {Earlier answer message} confirmPassphrase {Confirm passphrase field} passphraseAccepted {Passphrase accepted message} discardChanges {Discard button} discardChangesTitle {Discard question} discardChangesDescription {Discard explanation} yes {Yes answer} no {No answer} submitFailed {Form error message} required {Required answer message} minLength {Too short message} maxLength {Too long message} minValue {Too small message} maxValue {Too large message} minDate {Too early message} maxDate {Too late message} minSelected {Too few chosen message} maxSelected {Too many chosen message} unique {Repeated answer message} differentFrom {Must differ message} sameAs {Must match message} greaterThan {Must be greater message} lessThan {Must be less message} greaterThanOrEqual {Must be at least message} lessThanOrEqual {Must be at most message} other {{key}}}',
    description:
      'Names one of the words the interview itself shows, where it is listed for translation: a button, a field label or a message, by what it is for. key says which.',
  },
  diseasePosition: {
    id: 'protocolBuilder.localizedTextNames.diseasePosition',
    defaultMessage: 'Disease {position, number}',
    description:
      'Names one disease mapping of a narrative pedigree stage where its label is listed without a translation. position is the mapping’s place in the stage’s list of diseases, counting from one.',
  },
});

export type LocalizedTextStep = Readonly<{
  /** The path segments this step names, from the start of the place, JSON-encoded: identifies the step among its siblings. */
  key: string;
  /** What the editor calls it, in the reader's language. */
  label: string;
}>;

type Segment = string | number;
type Path = readonly Segment[];
type Codebook = CurrentProtocol['codebook'];

type Subject = Readonly<
  { entity: 'ego' } | { entity: 'node' | 'edge'; type: string }
>;

type NamingContext = Readonly<{
  intl: IntlShape;
  codebook: Codebook;
  /** The stage, or the codebook definition, the path starts in. */
  place: unknown;
  /** The segments a step names, from the start of the place. */
  at: Path;
}>;

type Label = (context: NamingContext) => string;

/** A step names the first `covers` segments after the place. */
type Step = readonly [covers: number, label: Label];

type Rule = Readonly<{ pattern: readonly string[]; steps: readonly Step[] }>;

const POSITION = '#';
const KEY = '*';

const segmentsOf = (pattern: string): readonly string[] => pattern.split('.');

const rule = (pattern: string, ...steps: Step[]): Rule => ({
  pattern: segmentsOf(pattern),
  steps,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const valueAt = (root: unknown, path: Path): unknown => {
  let value = root;
  for (const segment of path) {
    if (Array.isArray(value) && typeof segment === 'number') {
      value = value[segment];
    } else if (isRecord(value) && typeof segment === 'string') {
      value = value[segment];
    } else {
      return undefined;
    }
  }
  return value;
};

const textAt = (root: unknown, path: Path): string | undefined => {
  const value = valueAt(root, path);
  return typeof value === 'string' ? value : undefined;
};

// A rule places a position or a key only where its pattern matched one, so
// these fail only on a rule that reads the wrong segment.
const positionOf = (segment: Segment | undefined): number => {
  if (typeof segment !== 'number') {
    throw new Error(`${JSON.stringify(segment)} is not a list position.`);
  }
  return segment + 1;
};

const keyOf = (segment: Segment | undefined): string => {
  if (typeof segment !== 'string') {
    throw new Error(`${JSON.stringify(segment)} is not a key.`);
  }
  return segment;
};

const matches = (pattern: readonly string[], rest: Path): boolean =>
  pattern.length === rest.length &&
  pattern.every((token, index) => {
    const segment = rest[index];
    if (token === POSITION) return typeof segment === 'number';
    if (token === KEY) return typeof segment === 'string';
    return segment === token;
  });

const words =
  (
    descriptor: MessageDescriptor,
    values?: Readonly<Record<string, string>>,
  ): Label =>
  ({ intl }) =>
    intl.formatMessage(descriptor, values);

/** Names an entry by its position in the list the step ends in. */
const numbered =
  (descriptor: MessageDescriptor): Label =>
  ({ intl, at }) =>
    intl.formatMessage(descriptor, { position: positionOf(at.at(-1)) });

const subjectFrom = (value: unknown): Subject | undefined => {
  if (!isRecord(value)) return undefined;
  const { entity, type } = value;
  if (entity === 'ego') return { entity };
  if ((entity === 'node' || entity === 'edge') && typeof type === 'string') {
    return { entity, type };
  }
  return undefined;
};

const attributeName = (
  codebook: Codebook,
  subject: Subject,
  variable: string,
): string | undefined => {
  const variables =
    subject.entity === 'ego'
      ? codebook.ego?.variables
      : codebook[subject.entity]?.[subject.type]?.variables;
  return variables?.[variable]?.name;
};

type SubjectOf = (context: NamingContext) => Subject | undefined;

const stageSubject: SubjectOf = ({ place }) =>
  subjectFrom(valueAt(place, ['subject']));

const egoSubject: SubjectOf = () => ({ entity: 'ego' });

/**
 * Names a row by the attribute it records, as the codebook names it, else by
 * its position.
 */
const attributeOr =
  (fallback: MessageDescriptor, subjectOf: SubjectOf): Label =>
  (context) => {
    const variable = textAt(context.place, [...context.at, 'variable']);
    const subject = subjectOf(context);
    const name =
      variable === undefined || subject === undefined
        ? undefined
        : attributeName(context.codebook, subject, variable);
    return name ?? numbered(fallback)(context);
  };

/** Names a roster row by the data-file column it shows, else its position. */
const columnOr =
  (fallback: MessageDescriptor): Label =>
  (context) =>
    textAt(context.place, [...context.at, 'variable']) ??
    numbered(fallback)(context);

const STAGE_NAME = rule('label', [1, words(stageNameMessages.stageName)]);

const PROMPTS: Step = [1, words(promptsSectionMessages.title)];
const PROMPT: Step = [2, numbered(messages.promptPosition)];

const promptText = (textLabel: MessageDescriptor): Rule =>
  rule('prompts.#.text', PROMPTS, PROMPT, [3, words(textLabel)]);

const NAME_GENERATOR_PROMPT = promptText(nameGeneratorPromptMessages.textLabel);
const CENSUS_PROMPT = promptText(censusMessages.promptTextLabel);

const INTRODUCTION: Step = [1, words(introductionMessages.title)];
const INTRODUCTION_RULES: readonly Rule[] = [
  rule('introductionPanel.title', INTRODUCTION, [
    2,
    words(introductionMessages.headingLabel),
  ]),
  rule('introductionPanel.text', INTRODUCTION, [
    2,
    words(introductionMessages.textLabel),
  ]),
];

const FORM: Step = [1, words(formFieldsMessages.title)];

const formFieldRules = (subjectOf: SubjectOf): readonly Rule[] => {
  const field: Step = [3, attributeOr(messages.fieldPosition, subjectOf)];
  return [
    rule('form.fields.#.prompt', FORM, field, [
      4,
      words(formFieldsMessages.promptLabel),
    ]),
    rule('form.fields.#.hint', FORM, field, [
      4,
      words(formFieldsMessages.hintLabel),
    ]),
  ];
};

const PANEL_RULES: readonly Rule[] = [
  rule(
    'panels.#.title',
    [1, words(nodePanelsMessages.title)],
    [2, numbered(messages.panelPosition)],
    [3, words(nodePanelsMessages.panelTitleLabel)],
  ),
];

const contentItemRules = (
  section: Step,
  itemsPath: string,
): readonly Rule[] => {
  const itemCovers = segmentsOf(itemsPath).length + 1;
  const item: Step = [itemCovers, numbered(messages.itemPosition)];
  return [
    rule(`${itemsPath}.#.content`, section, item, [
      itemCovers + 1,
      words(contentBlockMessages.contentLabel),
    ]),
    rule(`${itemsPath}.#.description`, section, item, [
      itemCovers + 1,
      words(contentBlockMessages.descriptionLabel),
    ]),
  ];
};

// The page heading and the page's items sit side by side in one section, so
// the section names no segment of its own.
const PAGE_CONTENT: Step = [0, words(pageContentMessages.pageTitle)];
const FINISH_SCREEN: Step = [0, words(finishSessionMessages.closingTitle)];
const FINISHING: Step = [0, words(finishSessionMessages.finishingTitle)];

const NARRATIVE_PRESETS: Step = [
  1,
  words(narrativePresetMessages.presetsTitle),
];
const NARRATIVE_PRESET: Step = [2, numbered(messages.presetPosition)];

const highlightLabel: Label = (context) => {
  const highlight = context.at.slice(0, 4);
  const variable = textAt(context.place, [...highlight, 'variable']);
  if (variable === undefined) {
    return context.intl.formatMessage(messages.itemPosition, {
      position: positionOf(highlight.at(-1)),
    });
  }
  const subject = stageSubject(context);
  const attribute =
    (subject && attributeName(context.codebook, subject, variable)) ?? variable;
  return context.intl.formatMessage(
    narrativePresetMessages.presetHighlightLegendLabel,
    { attribute },
  );
};

// The pedigree's own prompt, and the extra questions it asks about each
// person, which read the stage subject like any other form.
const PEDIGREE_PERSON_FORM: Step = [
  1,
  words(familyPedigreeMessages.personFormTitle),
];
const PEDIGREE_PEOPLE: Step = [
  0,
  words(familyPedigreeMessages.nodeConfigurationTitle),
];
const PEDIGREE_COMPLETENESS: Step = [
  0,
  words(familyPedigreeMessages.completenessTitle),
];
/** The wording of the list, which `completeness` holds beside its settings. */
const PEDIGREE_TRACKER_TEXT: Step = [
  1,
  words(familyPedigreeMessages.trackerTextTitle),
];
const PEDIGREE_PERSON_FIELD: Step = [
  3,
  attributeOr(messages.fieldPosition, stageSubject),
];

const composerEdgeSubject: SubjectOf = ({ place, at }) =>
  subjectFrom(valueAt(place, [...at.slice(0, 2), 'subject']));

const composerEdgeForm: Label = (context) => {
  const type = textAt(context.place, [...context.at, 'subject', 'type']);
  if (type === undefined) return numbered(messages.itemPosition)(context);
  return context.intl.formatMessage(composerMessages.connectionFormLabel, {
    typeName: context.codebook.edge?.[type]?.name ?? type,
  });
};

const COMPOSER_FIELD_TEXTS: readonly (readonly [
  field: string,
  label: MessageDescriptor,
])[] = [
  ['label', composerFormFieldMessages.questionLabel],
  ['hint', composerFormFieldMessages.helpLabel],
  ['parameters.minLabel', parameterFieldMessages.minLabelLabel],
  ['parameters.maxLabel', parameterFieldMessages.maxLabelLabel],
];

const composerFieldRules = (
  fieldsPath: string,
  leading: readonly Step[],
  subjectOf: SubjectOf,
): readonly Rule[] => {
  const fieldCovers = segmentsOf(fieldsPath).length + 1;
  const field: Step = [
    fieldCovers,
    attributeOr(messages.fieldPosition, subjectOf),
  ];
  return COMPOSER_FIELD_TEXTS.map(([text, label]) =>
    rule(`${fieldsPath}.#.${text}`, ...leading, field, [
      fieldCovers + segmentsOf(text).length,
      words(label),
    ]),
  );
};

const STAGE_RULES: Readonly<Record<StageType, readonly Rule[]>> = {
  AlterEdgeForm: [...INTRODUCTION_RULES, ...formFieldRules(stageSubject)],
  AlterForm: [...INTRODUCTION_RULES, ...formFieldRules(stageSubject)],
  Anonymisation: [
    rule(
      'explanationText.title',
      [1, words(anonymisationMessages.explanationTitle)],
      [2, words(anonymisationMessages.explanationHeadingLabel)],
    ),
    rule(
      'explanationText.body',
      [1, words(anonymisationMessages.explanationTitle)],
      [2, words(anonymisationMessages.explanationBodyLabel)],
    ),
  ],
  CategoricalBin: [
    CENSUS_PROMPT,
    rule('prompts.#.otherOptionLabel', PROMPTS, PROMPT, [
      3,
      words(categoricalBinPromptMessages.otherBinLabel),
    ]),
    rule('prompts.#.otherVariablePrompt', PROMPTS, PROMPT, [
      3,
      words(categoricalBinPromptMessages.otherPromptLabel),
    ]),
  ],
  DyadCensus: [...INTRODUCTION_RULES, CENSUS_PROMPT],
  EgoForm: [...INTRODUCTION_RULES, ...formFieldRules(egoSubject)],
  FamilyPedigree: [
    rule(
      'prompt',
      [0, words(familyPedigreeMessages.promptTitle)],
      [1, words(familyPedigreeMessages.promptLabel)],
    ),
    rule('form.fields.#.prompt', PEDIGREE_PERSON_FORM, PEDIGREE_PERSON_FIELD, [
      4,
      words(formFieldsMessages.promptLabel),
    ]),
    rule('form.fields.#.hint', PEDIGREE_PERSON_FORM, PEDIGREE_PERSON_FIELD, [
      4,
      words(formFieldsMessages.hintLabel),
    ]),
    rule(
      'nominationPrompts.#.text',
      [1, words(familyPedigreeMessages.nominationTitle)],
      [2, numbered(messages.promptPosition)],
      [3, words(censusMessages.promptTextLabel)],
    ),
    rule('nodeConfiguration.nameField.prompt', PEDIGREE_PEOPLE, [
      3,
      words(familyPedigreeMessages.namePromptLabel),
    ]),
    rule('nodeConfiguration.nameField.hint', PEDIGREE_PEOPLE, [
      3,
      words(familyPedigreeMessages.nameHintTextLabel),
    ]),
    ...(
      [
        ['parents.listItem', familyPedigreeMessages.trackerParentsLabel],
        ['siblings.listItem', familyPedigreeMessages.trackerSiblingsLabel],
        ['siblings.noneButton', familyPedigreeMessages.trackerNoSiblingsLabel],
        [
          'siblings.question',
          familyPedigreeMessages.trackerSiblingsQuestionLabel,
        ],
        ['children.listItem', familyPedigreeMessages.trackerChildrenLabel],
        ['children.noneButton', familyPedigreeMessages.trackerNoChildrenLabel],
        [
          'children.question',
          familyPedigreeMessages.trackerChildrenQuestionLabel,
        ],
        ['details.listItem', familyPedigreeMessages.trackerDetailsLabel],
      ] as const
    ).map(([path, label]) =>
      rule(
        `completeness.itemText.${path}`,
        PEDIGREE_COMPLETENESS,
        PEDIGREE_TRACKER_TEXT,
        [4, words(label)],
      ),
    ),
    rule(
      'completeness.recommendedNote',
      PEDIGREE_COMPLETENESS,
      PEDIGREE_TRACKER_TEXT,
      [2, words(familyPedigreeMessages.trackerRecommendedNoteLabel)],
    ),
  ],
  Geospatial: [promptText(geospatialMessages.promptTextLabel)],
  Information: [
    rule('title', PAGE_CONTENT, [1, words(pageContentMessages.headingLabel)]),
    ...contentItemRules(PAGE_CONTENT, 'items'),
  ],
  LanguageChooser: [],
  FinishSession: [
    rule('title', FINISH_SCREEN, [
      1,
      words(finishSessionMessages.headingLabel),
    ]),
    rule('content', FINISH_SCREEN, [1, words(finishSessionMessages.textLabel)]),
    rule('finishLabel', FINISHING, [
      1,
      words(finishSessionMessages.finishLabelLabel),
    ]),
    rule('finishConfirmation', FINISHING, [
      1,
      words(finishSessionMessages.finishConfirmationLabel),
    ]),
    rule('finishedNotice', FINISHING, [
      1,
      words(finishSessionMessages.finishedNoticeLabel),
    ]),
    rule('finishFailed', FINISHING, [
      1,
      words(finishSessionMessages.finishFailedLabel),
    ]),
  ],
  NameGenerator: [
    NAME_GENERATOR_PROMPT,
    ...PANEL_RULES,
    rule('form.title', FORM, [2, words(formFieldsMessages.formTitleLabel)]),
    ...formFieldRules(stageSubject),
  ],
  NameGeneratorQuickAdd: [NAME_GENERATOR_PROMPT, ...PANEL_RULES],
  NameGeneratorRoster: [
    NAME_GENERATOR_PROMPT,
    rule('panelTitle', [1, words(nodePanelsMessages.panelTitleLabel)]),
    rule(
      'cardOptions.additionalProperties.#.label',
      [1, words(cardDisplayMessages.title)],
      [3, columnOr(messages.itemPosition)],
      [4, words(cardDisplayMessages.labelColumn)],
    ),
    rule(
      'sortOptions.sortableProperties.#.label',
      [1, words(sortOptionsMessages.title)],
      [3, columnOr(messages.itemPosition)],
      [4, words(sortOptionsMessages.labelColumn)],
    ),
  ],
  Narrative: [
    rule('presets.#.label', NARRATIVE_PRESETS, NARRATIVE_PRESET, [
      3,
      words(narrativePresetMessages.presetNameLabel),
    ]),
    rule('presets.#.highlight.#.label', NARRATIVE_PRESETS, NARRATIVE_PRESET, [
      5,
      highlightLabel,
    ]),
  ],
  NarrativePedigree: [
    rule(
      'diseases.#.label',
      [1, words(narrativePedigreeMessages.diseasesTitle)],
      [2, numbered(messages.diseasePosition)],
      [3, words(narrativePedigreeMessages.diseaseNameLabel)],
    ),
  ],
  NetworkComposer: [
    ...composerFieldRules(
      'nodeForm.fields',
      [
        [1, words(composerMessages.nodesTitle)],
        [2, words(composerMessages.nodeFormTitle)],
      ],
      stageSubject,
    ),
    ...composerFieldRules(
      'edges.#.form.fields',
      [
        [1, words(composerMessages.connectionsTitle)],
        [2, composerEdgeForm],
      ],
      composerEdgeSubject,
    ),
  ],
  OneToManyDyadCensus: [CENSUS_PROMPT],
  OrdinalBin: [CENSUS_PROMPT],
  Sociogram: [promptText(sociogramPromptMessages.promptTextLabel)],
  TieStrengthCensus: [
    ...INTRODUCTION_RULES,
    CENSUS_PROMPT,
    rule('prompts.#.negativeLabel', PROMPTS, PROMPT, [
      3,
      words(tieStrengthPromptMessages.declineLabel),
    ]),
  ],
};

const variableName: Label = ({ place, at }) =>
  textAt(place, [...at, 'name']) ?? keyOf(at.at(-1));

const optionLabel: Label = ({ intl, place, at }) => {
  const variable = valueAt(place, at.slice(0, 2));
  const value = valueAt(place, [...at.slice(0, 4), 'value']);
  if (
    isRecord(variable) &&
    variable.type === 'boolean' &&
    typeof value === 'boolean'
  ) {
    return intl.formatMessage(booleanAnswerFieldMessages.answerLabel, {
      records: String(value),
    });
  }
  // As text rather than a number, as the variable editor passes it.
  return intl.formatMessage(variableValuesMessages.optionLabelField, {
    index: String(positionOf(at[3])),
  });
};

const VARIABLE: Step = [2, variableName];

const VARIABLE_RULES: readonly Rule[] = [
  rule('variables.*.options.#.label', VARIABLE, [5, optionLabel]),
  rule('variables.*.parameters.minLabel', VARIABLE, [
    4,
    words(parameterFieldMessages.minLabelLabel),
  ]),
  rule('variables.*.parameters.maxLabel', VARIABLE, [
    4,
    words(parameterFieldMessages.maxLabelLabel),
  ]),
];

const entityRules = (entity: 'node' | 'edge'): readonly Rule[] => [
  rule('label', [1, words(codebookEntityMessages.labelLabel, { entity })]),
  ...VARIABLE_RULES,
];

const ENTITY_RULES: Readonly<Record<'node' | 'edge', readonly Rule[]>> = {
  node: entityRules('node'),
  edge: entityRules('edge'),
};

type Located = Readonly<{
  place: unknown;
  rules: readonly Rule[];
  rest: Path;
}>;

/** The interview's shared words: a group, then a text within it. */
const INTERFACE_TEXT_RULES: readonly Rule[] = [
  rule(
    '*.*',
    [
      1,
      ({ intl, at }) =>
        intl.formatMessage(messages.interfaceTextGroup, {
          group: keyOf(at[0]),
        }),
    ],
    [
      2,
      ({ intl, at }) =>
        intl.formatMessage(messages.interfaceTextName, { key: keyOf(at[1]) }),
    ],
  ),
];

const locate = (protocol: CurrentProtocol, path: Path): Located | undefined => {
  const [root, scope, ...inScope] = path;
  if (root === 'interfaceText') {
    if (!protocol.interfaceText) return undefined;
    return {
      place: protocol.interfaceText,
      rules: INTERFACE_TEXT_RULES,
      rest: path.slice(1),
    };
  }
  if (root === 'stages' && typeof scope === 'number') {
    const stage = protocol.stages[scope];
    if (!stage || !isStageType(stage.type)) return undefined;
    return {
      place: stage,
      rules: [STAGE_NAME, ...STAGE_RULES[stage.type]],
      rest: inScope,
    };
  }
  if (root !== 'codebook') return undefined;
  if (scope === 'ego') {
    const ego = protocol.codebook.ego;
    if (!ego) return undefined;
    return { place: ego, rules: VARIABLE_RULES, rest: inScope };
  }
  if (scope !== 'node' && scope !== 'edge') return undefined;
  const [type, ...rest] = inScope;
  const definition =
    typeof type === 'string' ? protocol.codebook[scope]?.[type] : undefined;
  if (!definition) return undefined;
  return { place: definition, rules: ENTITY_RULES[scope], rest };
};

/**
 * Names a localized text by where the stage or codebook editor shows it: one
 * step per section, row and field leading to it, after the stage or codebook
 * entry it belongs to. The interview's shared words, which no editor shows,
 * are named by their group and what each is for. Undefined for any other
 * path no editor shows.
 */
export function nameLocalizedText(
  intl: IntlShape,
  protocol: CurrentProtocol,
  path: readonly (string | number)[],
): readonly LocalizedTextStep[] | undefined {
  const located = locate(protocol, path);
  if (!located) return undefined;
  const { place, rules, rest } = located;
  const match = rules.find(({ pattern }) => matches(pattern, rest));
  if (!match) return undefined;
  return match.steps.map(([covers, label]) => {
    const at = rest.slice(0, covers);
    return {
      key: JSON.stringify(at),
      label: label({ intl, codebook: protocol.codebook, place, at }),
    };
  });
}
