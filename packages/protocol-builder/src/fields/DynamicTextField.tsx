import { type ComponentProps, type ReactNode, useMemo, useRef } from 'react';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField, {
  type RichTextEditorToken,
  type RichTextInsertMenu,
  type RichTextInsertMenuItem,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import {
  ALLOWED_MARKDOWN_LABEL_TAGS,
  ALLOWED_MARKDOWN_SECTION_TAGS,
  DEFAULT_MARKDOWN_REHYPE_PLUGINS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { TokenPill } from '@codaco/fresco-ui/TokenPill';
import {
  type DynamicValueBinding,
  type DynamicValueRole,
  type DynamicValues,
  type DynamicValueSite,
  dynamicValueArgumentsAt,
  dynamicValueNamesIn,
  escapeMessageText,
  findDynamicValueProblem,
  findMissingDynamicPlacement,
  type LocaleTag,
  type LocalizedString,
  MISSING_CASE,
  type MessageNode,
  type MessageSwitch,
  messageStructure,
  pluralValueExamples,
  printMessageStructure,
  TOO_MANY_DYNAMIC_VERSIONS,
} from '@codaco/protocol-validation';

import { variableTypeLabel } from '../codebook/variableTypeLabels.ts';
import {
  bindingFor,
  bindingRecordedFor,
  type DynamicValueChoice,
  dynamicValueChoices,
} from '../localization/dynamicValueCatalog.ts';
import { resolveTranslation } from '../localization/localizedText.ts';
import {
  countTokenId,
  documentToMessageNodes,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
  MessageDocumentProblem,
  messageToDocument,
} from '../localization/messageDocument.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import {
  type DynamicValueSiteState,
  useDynamicValueSite,
} from '../localization/useDynamicValueSite.ts';
import type { RichTextContent } from '../markdown/markdownAdapter.ts';
import { LocalizedStringField } from './LocalizedStringField.tsx';

const messages = defineMessages({
  insertMenu: {
    id: 'protocolBuilder.dynamicText.insertMenu',
    defaultMessage:
      'Inject piped text from interview metadata or a network attribute',
    description:
      'Accessible name and tooltip of a toolbar icon button (a syringe), and the name of the searchable menu it opens, in a text field a participant reads. “Piped text” is survey-software vocabulary for text filled in from earlier data: the button injects a value the interview fills in, such as today’s date (interview metadata) or the participant’s name or an answer they gave earlier (a network attribute).',
  },
  interviewGroup: {
    id: 'protocolBuilder.dynamicText.interviewGroup',
    defaultMessage: 'Interview Attributes',
    description:
      'Heading in the insert-a-value menu above values that come from the interview itself rather than from the network, such as today’s date.',
  },
  today: {
    id: 'protocolBuilder.dynamicText.today',
    defaultMessage: 'Today’s date',
    description:
      'A value a researcher can insert into text a participant reads: the date on the day the participant reads it.',
  },
  roleEgo: {
    id: 'protocolBuilder.dynamicText.roleEgo',
    defaultMessage: 'Ego Attributes',
    description:
      'Heading in the insert-a-value menu above the attributes of the ego, the participant taking part in the interview. “Ego” is the network-research term Architect uses for the participant.',
  },
  roleContext: {
    id: 'protocolBuilder.dynamicText.roleContext',
    defaultMessage: 'Contextual Attributes',
    description:
      'Heading in the insert-a-value menu above the attributes of whatever the text is shown alongside: the node or edge a form asks about, or the node a question is asking about. It may not be a person, so the heading does not say what it is.',
  },
  roleDyadSource: {
    id: 'protocolBuilder.dynamicText.roleDyadSourceGroup',
    defaultMessage: 'Contextual Attributes: First Node in Pair',
    description:
      'Heading in the insert-a-value menu above the attributes of the first of the two nodes a question asks about together, as a pair. A node is one entity in the network, which may not be a person.',
  },
  roleDyadTarget: {
    id: 'protocolBuilder.dynamicText.roleDyadTargetGroup',
    defaultMessage: 'Contextual Attributes: Second Node in Pair',
    description:
      'Heading in the insert-a-value menu above the attributes of the second of the two nodes a question asks about together, as a pair. A node is one entity in the network, which may not be a person.',
  },
  dyadSourceValue: {
    id: 'protocolBuilder.dynamicText.dyadSourceValue',
    defaultMessage: '{attribute} (first node in pair)',
    description:
      'Name of an inserted value, as it appears in the text: an attribute of the first of the two nodes a question asks about together. attribute is the attribute’s name, such as “nickname”.',
  },
  dyadTargetValue: {
    id: 'protocolBuilder.dynamicText.dyadTargetValue',
    defaultMessage: '{attribute} (second node in pair)',
    description:
      'Name of an inserted value, as it appears in the text: an attribute of the second of the two nodes a question asks about together. attribute is the attribute’s name, such as “nickname”.',
  },
  byAnswer: {
    id: 'protocolBuilder.dynamicText.byAnswer',
    defaultMessage: 'Different wording for each answer',
    description:
      'Second line of an entry in the insert-a-value menu. Choosing it inserts a piece of text with one version for each answer to this attribute, so the text can say something different depending on the answer.',
  },
  needsAnswerLabels: {
    id: 'protocolBuilder.dynamicText.needsAnswerLabels',
    defaultMessage: 'Add labels for its yes and no answers first',
    description:
      'Second line of an entry in the insert-a-value menu that cannot be chosen yet. The entry is a yes-or-no attribute without its own words for its two answers, so the text has nothing in the protocol’s languages to show for it. The researcher can add those words where the attribute is set up.',
  },
  switchHasNoLabels: {
    id: 'protocolBuilder.dynamicText.switchHasNoLabels',
    defaultMessage:
      'A Toggle has no labels for its answers. Use different wording for each answer instead.',
    description:
      'Second line of an entry in the insert-a-value menu that cannot be chosen. The entry is a yes-or-no attribute answered with a Toggle (Architect’s name for a single on/off switch, kept as the one word “Toggle” as elsewhere in Architect), which has no researcher-written labels for its two answers, so the text cannot show the answer itself. The menu has another entry for the same attribute, “Different wording for each answer”, which the researcher can use instead.',
  },
  byNumber: {
    id: 'protocolBuilder.dynamicText.byNumber',
    defaultMessage: 'Wording that fits the number',
    description:
      'Second line of an entry in the insert-a-value menu. Choosing it inserts a piece of text with a version for each kind of number (such as one or several), so the words agree with the number, as in “1 child” and “3 children”.',
  },
  versionsByPresence: {
    id: 'protocolBuilder.dynamicText.versionsByPresence',
    defaultMessage: 'Wording depending on whether {value} is known',
    description:
      'Accessible name of a piece of text with two versions: one shown when a value is known, one when it is not. value is the value’s name, such as “nickname”.',
  },
  versionsByAnswer: {
    id: 'protocolBuilder.dynamicText.versionsByAnswer',
    defaultMessage: 'Wording for each answer to {value}',
    description:
      'Accessible name of a piece of text with one version for each answer to an attribute. value is the attribute’s name.',
  },
  versionsByNumber: {
    id: 'protocolBuilder.dynamicText.versionsByNumber',
    defaultMessage: 'Wording that fits the number {value}',
    description:
      'Accessible name of a piece of text with a version for each kind of number, so the words agree with the number. value is the name of the number.',
  },
  versionMissing: {
    id: 'protocolBuilder.dynamicText.versionMissing',
    defaultMessage: 'If not known',
    description:
      'Label of the version of a piece of text shown when the value it depends on has not been given, such as a name the participant skipped.',
  },
  versionKnown: {
    id: 'protocolBuilder.dynamicText.versionKnown',
    defaultMessage: 'If known',
    description:
      'Label of the version of a piece of text shown when the value it depends on has been given.',
  },
  versionOtherAnswer: {
    id: 'protocolBuilder.dynamicText.versionOtherAnswer',
    defaultMessage: 'Any other answer',
    description:
      'Label of the version of a piece of text shown for an answer that has no version of its own.',
  },
  versionNumbers: {
    id: 'protocolBuilder.dynamicText.versionNumbers',
    defaultMessage: 'When it is {numbers}',
    description:
      'Label of the version of a piece of text shown for some numbers. numbers lists examples of those numbers, in the language being edited, such as “1” or “0, 2, 3, …”.',
  },
  yes: {
    id: 'protocolBuilder.dynamicText.yes',
    defaultMessage: 'Yes',
    description:
      'Label of the version of a piece of text shown when a yes-or-no attribute is yes.',
  },
  no: {
    id: 'protocolBuilder.dynamicText.no',
    defaultMessage: 'No',
    description:
      'Label of the version of a piece of text shown when a yes-or-no attribute is no.',
  },
  unreadable: {
    id: 'protocolBuilder.dynamicText.unreadable',
    defaultMessage:
      'This text uses something Architect cannot show here, so it can’t be edited in this field. It is kept as it is.',
    description:
      'Shown in place of a text field a participant reads when its stored text uses something the editor cannot display, such as a format it does not support. The text is not changed.',
  },
  translationMissesValue: {
    id: 'protocolBuilder.dynamicText.translationMissesValue',
    defaultMessage: 'Include “{value}” wherever the original text shows it.',
    description:
      'Problem shown under a translation that leaves out a value, such as the participant’s name, that the text in the protocol’s main language shows. value is the value’s name.',
  },
  translationTooComplex: {
    id: 'protocolBuilder.dynamicText.translationTooComplex',
    defaultMessage:
      'This text has too many versions to check its translation. Use fewer values that change the wording.',
    description:
      'Problem shown under a translated text whose versions are too many to compare with the original.',
  },
});

const ROLE_MESSAGES = {
  ego: messages.roleEgo,
  node: messages.roleContext,
  edge: messages.roleContext,
  dyadSource: messages.roleDyadSource,
  dyadTarget: messages.roleDyadTarget,
  focal: messages.roleContext,
} satisfies Record<DynamicValueRole, unknown>;

/** How many examples a plural version's label gives of its numbers. */
const EXAMPLE_COUNT = 3;

type Naming = Readonly<{
  /** What a value is called where it shows in the text. */
  valueLabel: (choice: DynamicValueChoice) => string;
  /** The heading it is listed under in the insert menu. */
  groupLabel: (choice: DynamicValueChoice) => string;
}>;

const namingFor = (intl: IntlShape): Naming => ({
  valueLabel: (choice) => {
    if (choice.role === undefined) return intl.formatMessage(messages.today);
    const attribute = choice.variableName ?? choice.variableId;
    // The two nodes of a pair have the same attributes, so their values say
    // which node they belong to; any other value is named by its attribute.
    if (choice.role === 'dyadSource') {
      return intl.formatMessage(messages.dyadSourceValue, { attribute });
    }
    if (choice.role === 'dyadTarget') {
      return intl.formatMessage(messages.dyadTargetValue, { attribute });
    }
    return attribute;
  },
  groupLabel: (choice) =>
    intl.formatMessage(
      choice.role === undefined
        ? messages.interviewGroup
        : ROLE_MESSAGES[choice.role],
    ),
});

/** The inline content of a one-line message, as the editor holds it. */
const inlineContent = (
  nodes: readonly MessageNode[],
  format: MessageDocumentFormat,
  labels: MessageDocumentLabels,
): RichTextContent[] =>
  messageToDocument(nodes, { ...format, singleLine: true }, labels).content?.[0]
    ?.content ?? [];

/** A value shown only when it is known, as a value that can be missing must be. */
const presenceSwitch = (
  name: string,
  known: readonly MessageNode[],
): MessageSwitch => ({
  kind: 'switch',
  argument: name,
  type: 'select',
  versions: [
    { key: MISSING_CASE, nodes: [] },
    { key: 'other', nodes: known },
  ],
});

const pluralCategories = (locale: LocaleTag): string[] => {
  const categories = [...pluralValueExamples(locale).keys()].filter(
    (category) => category !== 'other',
  );
  return [...categories, 'other'];
};

const isBlankMessage = (nodes: readonly MessageNode[]): boolean =>
  nodes.every((node) => node.kind === 'text' && node.text.trim() === '');

type MessageLabelInputs = Readonly<{
  intl: IntlShape;
  naming: Naming;
  /** The value each name in the text stands for. */
  choiceByName: ReadonlyMap<string, DynamicValueChoice>;
  bindings: DynamicValues;
  /** Bindings the insert menu would add, named before they are added. */
  offered: DynamicValues;
  locale: LocaleTag;
  labelText: (label: unknown) => string;
}>;

/** What the editor and the summary call a set of versions, and each version. */
const messageLabelsFor = ({
  intl,
  naming,
  choiceByName,
  bindings,
  offered,
  locale,
  labelText,
}: MessageLabelInputs): MessageDocumentLabels => ({
  switchSummary: (node) => {
    const choice = choiceByName.get(node.argument);
    return choice === undefined ? node.argument : naming.valueLabel(choice);
  },
  switchLabel: (node) => {
    const choice = choiceByName.get(node.argument);
    const value =
      choice === undefined ? node.argument : naming.valueLabel(choice);
    if (node.type === 'plural') {
      return intl.formatMessage(messages.versionsByNumber, { value });
    }
    const presence = node.versions.every(
      (version) => version.key === MISSING_CASE || version.key === 'other',
    );
    return intl.formatMessage(
      presence ? messages.versionsByPresence : messages.versionsByAnswer,
      { value },
    );
  },
  versionLabel: (node, key) => {
    if (node.type === 'plural') {
      const exact = /^=(\d+)$/.exec(key);
      const counts = exact
        ? [Number(exact[1])]
        : ([...pluralValueExamples(locale)].find(
            ([category]) => category === key,
          )?.[1] ?? []);
      const shown = counts
        .slice(0, EXAMPLE_COUNT)
        .map((count) => intl.formatNumber(count));
      return intl.formatMessage(messages.versionNumbers, {
        numbers: intl.formatList(
          counts.length > EXAMPLE_COUNT ? [...shown, '…'] : shown,
          { type: 'unit', style: 'short' },
        ),
      });
    }
    if (key === MISSING_CASE)
      return intl.formatMessage(messages.versionMissing);
    const presence = node.versions.every(
      (version) => version.key === MISSING_CASE || version.key === 'other',
    );
    if (key === 'other') {
      return intl.formatMessage(
        presence ? messages.versionKnown : messages.versionOtherAnswer,
      );
    }
    const binding =
      (Object.hasOwn(offered, node.argument)
        ? offered[node.argument]
        : undefined) ?? bindings[node.argument];
    const option = binding?.cases?.[key];
    const choice = choiceByName.get(node.argument);
    const matched = choice?.options.find((each) => each.value === option);
    if (matched !== undefined) {
      const text = labelText(matched.label);
      if (text !== '') return text;
      if (typeof matched.value === 'boolean') {
        return intl.formatMessage(matched.value ? messages.yes : messages.no);
      }
    }
    return key;
  },
});

/**
 * What a text's editor knows about where the text sits. Without
 * `setBindings` the editor offers only the values the stage already binds:
 * a translator works with the values the original text shows, and never
 * adds a binding of their own.
 */
export type DynamicMessageSite = Readonly<{
  context: DynamicValueSiteState['context'];
  bindings: DynamicValueSiteState['bindings'];
  setBindings?: DynamicValueSiteState['setBindings'];
  namesInUse?: DynamicValueSiteState['namesInUse'];
}>;

export type DynamicMessageEditorProps = Readonly<{
  id: string;
  name: string;
  ariaDescribedBy: string;
  ariaLabelledBy?: string;
  ariaInvalid?: boolean;
  ariaRequired?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly: boolean;
  markdown: boolean;
  singleLine: boolean;
  compact: boolean;
  message: string;
  onMessageChange: (message: string | undefined) => void;
  /** The text in the protocol's main language, to check a translation against. */
  original: Readonly<{ locale: LocaleTag; message: string }> | undefined;
  locale: LocaleTag;
  site: DynamicMessageSite;
  /**
   * False where the host says what is wrong with the text itself, as the
   * translation table does once the researcher leaves the cell.
   */
  showsProblems?: boolean;
}>;

/**
 * One translation of text a participant reads, with values the interview
 * fills in. Values show as chips; a value that can be missing sits in a
 * piece of text with a version for when it is known and one for when it is
 * not, so the participant never meets a gap. The insert menu (the toolbar
 * button, or typing `{`) offers what this place can show.
 */
export function DynamicMessageEditor({
  id,
  name,
  ariaDescribedBy,
  ariaLabelledBy,
  ariaInvalid,
  ariaRequired,
  placeholder,
  autoFocus,
  disabled,
  readOnly,
  markdown,
  singleLine,
  compact,
  message,
  onMessageChange,
  original,
  locale,
  site,
  showsProblems = true,
}: DynamicMessageEditorProps) {
  const intl = useAppIntl();
  const { localization } = useEditingLanguage();
  const format = useMemo(
    (): MessageDocumentFormat => ({ markdown, singleLine }),
    [markdown, singleLine],
  );
  const { context, bindings, setBindings, namesInUse } = site;

  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;

  const naming = namingFor(intl);
  const choices = dynamicValueChoices(context);

  // Every binding the menu could add, named now so a value chosen from it
  // arrives under the name it is offered with.
  const offered: DynamicValues = {};
  const items: RichTextInsertMenuItem[] = [];
  const choiceByName = new Map<string, DynamicValueChoice>();
  for (const [bindingName, binding] of Object.entries(bindings)) {
    const choice = choices.find((each) => each.path === binding.path);
    if (choice !== undefined) choiceByName.set(bindingName, choice);
  }

  const labels = messageLabelsFor({
    intl,
    naming,
    choiceByName,
    bindings,
    offered,
    locale,
    labelText,
  });

  for (const choice of choices) {
    const { name: bindingName, binding } = bindingFor(
      choice,
      bindings,
      offered,
      labelText,
    );
    const existing = Object.hasOwn(bindings, bindingName)
      ? bindings[bindingName]
      : undefined;
    if (existing === undefined && setBindings === undefined) continue;
    if (existing !== binding && setBindings !== undefined) {
      offered[bindingName] = binding;
    }
    // Without a way to change the stage's bindings, the cases are the ones
    // it already records.
    const usable = setBindings === undefined ? (existing ?? binding) : binding;
    choiceByName.set(bindingName, choice);
    const valueLabel = naming.valueLabel(choice);
    const group = naming.groupLabel(choice);
    const type = variableTypeLabel(choice.variableType);
    const argument: MessageNode = { kind: 'argument', name: bindingName };
    const unshowable =
      choice.unshowable === undefined
        ? undefined
        : intl.formatMessage(
            choice.unshowable === 'switch'
              ? messages.switchHasNoLabels
              : messages.needsAnswerLabels,
          );
    items.push({
      id: `value:${choice.path}`,
      label: valueLabel,
      group,
      ...(unshowable !== undefined
        ? { description: unshowable, disabled: true }
        : type !== undefined && { description: intl.formatMessage(type) }),
      content: inlineContent(
        choice.optional
          ? [presenceSwitch(bindingName, [argument])]
          : [argument],
        format,
        labels,
      ),
    });
    const caseKeys = Object.keys(usable.cases ?? {});
    if (caseKeys.length > 0) {
      items.push({
        id: `answers:${choice.path}`,
        label: valueLabel,
        group,
        description: intl.formatMessage(messages.byAnswer),
        content: inlineContent(
          [
            {
              kind: 'switch',
              argument: bindingName,
              type: 'select',
              versions: [
                { key: MISSING_CASE, nodes: [] },
                ...caseKeys.map((key) => ({ key, nodes: [] })),
                { key: 'other', nodes: [] },
              ],
            },
          ],
          format,
          labels,
        ),
      });
    }
    if (choice.numeric) {
      items.push({
        id: `number:${choice.path}`,
        label: valueLabel,
        group,
        description: intl.formatMessage(messages.byNumber),
        content: inlineContent(
          [
            presenceSwitch(bindingName, [
              {
                kind: 'switch',
                argument: bindingName,
                type: 'plural',
                versions: pluralCategories(locale).map((key) => ({
                  key,
                  nodes: [{ kind: 'count' }],
                })),
              },
            ]),
          ],
          format,
          labels,
        ),
      });
    }
  }

  const tokens: RichTextEditorToken[] = [...choiceByName].flatMap(
    ([bindingName, choice]) => {
      const label = naming.valueLabel(choice);
      return [
        { id: bindingName, label, text: `{${bindingName}}`, inToolbar: false },
        ...(choice.numeric
          ? [{ id: countTokenId(bindingName), label, inToolbar: false }]
          : []),
      ];
    },
  );

  const insertMenu: RichTextInsertMenu = {
    label: intl.formatMessage(messages.insertMenu),
    items,
    trigger: '{',
  };

  // The stored message as the editor's document, or why it cannot be one.
  const parsed = useMemo(() => {
    const structure = messageStructure(message);
    if (!('nodes' in structure)) return undefined;
    try {
      return messageToDocument(structure.nodes, format, labels);
    } catch (error) {
      if (error instanceof MessageDocumentProblem) return undefined;
      throw error;
    }
    // The labels follow the bindings and the language; the message decides
    // the document.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [message, format, locale, bindings, intl]);

  // As `RichTextField` does: the editor gets its own last document back
  // while that document still writes the stored message, so a round trip
  // never rewrites what the researcher is typing.
  const lastEmitted = useRef<{
    message: string;
    content: RichTextContent;
  } | null>(null);
  const content =
    lastEmitted.current?.message === message
      ? lastEmitted.current.content
      : parsed;

  const handleChange = (next: unknown) => {
    if (typeof next !== 'object' || next === null) return;
    const document = next as RichTextContent;
    let nodes: MessageNode[];
    try {
      nodes = documentToMessageNodes(document, format);
    } catch {
      return;
    }
    const nextMessage = isBlankMessage(nodes)
      ? undefined
      : printMessageStructure(nodes);
    lastEmitted.current = { message: nextMessage ?? '', content: document };
    if ((nextMessage ?? '') === message) return;

    onMessageChange(nextMessage);
    if (setBindings === undefined) return;

    // A value chosen from the menu is bound as it first appears, and a
    // binding no text names any more goes with the last value removed.
    const before = new Set(message === '' ? [] : dynamicValueNamesIn(message));
    const after = new Set(
      nextMessage === undefined ? [] : dynamicValueNamesIn(nextMessage),
    );
    // A value is bound with its cases only once the text shows a version
    // for one of them, so its plain insertion records none.
    const recorded: [string, DynamicValueBinding][] = [];
    for (const used of after) {
      if (!Object.hasOwn(offered, used)) continue;
      const offeredBinding = offered[used];
      if (offeredBinding === undefined) continue;
      const binding = bindingRecordedFor(
        used,
        offeredBinding,
        Object.hasOwn(bindings, used) ? bindings[used] : undefined,
        nodes,
      );
      if (binding !== undefined) recorded.push([used, binding]);
    }
    const removed = [...before].filter(
      (used) => !after.has(used) && Object.hasOwn(bindings, used),
    );
    if (recorded.length === 0 && removed.length === 0) return;
    const inUse =
      removed.length === 0 || namesInUse === undefined
        ? new Set<string>()
        : namesInUse();
    const nextBindings: Record<string, DynamicValueBinding> = {};
    for (const [bindingName, binding] of Object.entries(bindings)) {
      if (!removed.includes(bindingName) || inUse.has(bindingName)) {
        nextBindings[bindingName] = binding;
      }
    }
    for (const [used, binding] of recorded) nextBindings[used] = binding;
    setBindings(nextBindings);
  };

  const problem = useMemo(() => {
    if (!showsProblems || message === '' || parsed === undefined) {
      return undefined;
    }
    const values = dynamicValueArgumentsAt(bindings, context);
    const own = findDynamicValueProblem(message, values, locale);
    if (own !== undefined) return own;
    if (original === undefined || original.locale === locale) return undefined;
    if (
      findDynamicValueProblem(original.message, values, original.locale) !==
      undefined
    ) {
      return undefined;
    }
    const missing = findMissingDynamicPlacement(
      original.message,
      original.locale,
      message,
      locale,
      values,
    );
    if (missing === undefined) return undefined;
    if (missing === TOO_MANY_DYNAMIC_VERSIONS) {
      return intl.formatMessage(messages.translationTooComplex);
    }
    const choice = choiceByName.get(missing.argument);
    return intl.formatMessage(messages.translationMissesValue, {
      value:
        choice === undefined ? missing.argument : naming.valueLabel(choice),
    });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showsProblems,
    message,
    parsed,
    bindings,
    context,
    original,
    locale,
    intl,
  ]);

  if (parsed === undefined && message !== '') {
    return (
      <div id={id} data-name={name} className="flex flex-col gap-2">
        <Alert variant="warning" density="compact">
          {intl.formatMessage(messages.unreadable)}
        </Alert>
        <pre className="text-sm break-words whitespace-pre-wrap opacity-80">
          {message}
        </pre>
      </div>
    );
  }

  const toolbarOptions = markdown
    ? {
        bold: true,
        italic: true,
        links: !singleLine,
        headings: !singleLine,
        lists: !singleLine,
        thematicBreak: !singleLine,
        history: true,
      }
    : {
        bold: false,
        italic: false,
        links: false,
        headings: false,
        lists: false,
        thematicBreak: false,
        history: true,
      };

  return (
    <div className="flex flex-col gap-1">
      <RichTextEditorField
        id={id}
        name={name}
        aria-describedby={ariaDescribedBy}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid === true || problem !== undefined}
        aria-required={ariaRequired}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={readOnly}
        singleLine={singleLine || compact}
        compact={compact}
        changeMode="input"
        toolbarOptions={toolbarOptions}
        tokens={tokens}
        versions
        insertMenu={insertMenu}
        value={content ?? { type: 'doc', content: [{ type: 'paragraph' }] }}
        onChange={handleChange}
      />
      {problem !== undefined && (
        <p className="text-destructive text-sm" role="status">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * One translation of text with values, read-only, for a place that shows
 * text rather than editing it (a cell of the translation table): its words,
 * each value as the pill the editor shows, and each set of versions as a
 * list of what it says when.
 */
/** The first of the private-use characters that hold a value's place. */
const VALUE_MARK = 0xf0000;

/** The property a value's place is recorded under once markdown is read. */
const VALUE_PROPERTY = 'dataDynamicValue';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Splits the text the markdown was read into at each character holding a
 * value's place, leaving an empty `span` that records which value it is. Runs
 * after sanitizing, so what it adds is not stripped, and nothing an author
 * wrote can claim to be a value.
 */
const splitValueMarks = (node: unknown): void => {
  if (!isRecord(node) || !Array.isArray(node.children)) return;
  node.children = node.children.flatMap((child: unknown): unknown[] => {
    if (
      !isRecord(child) ||
      child.type !== 'text' ||
      typeof child.value !== 'string'
    ) {
      splitValueMarks(child);
      return [child];
    }
    const parts: unknown[] = [];
    let text = '';
    for (const character of child.value) {
      const index = (character.codePointAt(0) ?? 0) - VALUE_MARK;
      if (index < 0) {
        text += character;
        continue;
      }
      if (text !== '') parts.push({ type: 'text', value: text });
      text = '';
      parts.push({
        type: 'element',
        tagName: 'span',
        properties: { [VALUE_PROPERTY]: String(index) },
        children: [],
      });
    }
    if (text !== '') parts.push({ type: 'text', value: text });
    return parts;
  });
};

const valueMarkPlugin = () => splitValueMarks;
const SUMMARY_REHYPE_PLUGINS = [
  ...DEFAULT_MARKDOWN_REHYPE_PLUGINS,
  valueMarkPlugin,
];

/**
 * How markdown spread over several lines is drawn: which elements it keeps
 * and how it draws them. A host with rules of its own, such as a table cell
 * that draws headings as bold lines, passes its own.
 */
export type BlockMarkdown = Readonly<{
  allowedElements: readonly string[];
  components?: ComponentProps<typeof RenderMarkdown>['components'];
}>;

const SECTION_MARKDOWN: BlockMarkdown = {
  allowedElements: ALLOWED_MARKDOWN_SECTION_TAGS,
};
const LABEL_MARKDOWN: BlockMarkdown = {
  allowedElements: ALLOWED_MARKDOWN_LABEL_TAGS,
};

export function DynamicMessageSummary({
  message,
  markdown,
  locale,
  site,
  blockMarkdown = SECTION_MARKDOWN,
}: Readonly<{
  message: string;
  /** Whether the words are markdown, drawn here with their formatting. */
  markdown: boolean;
  /**
   * How markdown with line breaks (an Information screen's text) draws its
   * paragraphs, headings and rules; text on one line keeps only inline
   * formatting and lists, as a label does.
   */
  blockMarkdown?: BlockMarkdown;
  locale: LocaleTag;
  site: Pick<DynamicMessageSite, 'context' | 'bindings'>;
}>) {
  const intl = useAppIntl();
  const { localization } = useEditingLanguage();
  const { context, bindings } = site;
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return <>{message}</>;
  // A field written on one line never holds a line break.
  const elements = message.includes('\n') ? blockMarkdown : LABEL_MARKDOWN;
  const allowedElements = [...elements.allowedElements, 'span'];

  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;
  const naming = namingFor(intl);
  const choices = dynamicValueChoices(context);
  const choiceByName = new Map<string, DynamicValueChoice>();
  for (const [bindingName, binding] of Object.entries(bindings)) {
    const choice = choices.find((each) => each.path === binding.path);
    if (choice !== undefined) choiceByName.set(bindingName, choice);
  }
  const labels = messageLabelsFor({
    intl,
    naming,
    choiceByName,
    bindings,
    offered: {},
    locale,
    labelText,
  });
  const valueLabel = (argument: string) => {
    const choice = choiceByName.get(argument);
    return choice === undefined ? argument : naming.valueLabel(choice);
  };

  // Outside the editor a set of versions is the pill of the value it is on,
  // as the editor shows it folded: what it says in each case is written, and
  // read, in the editor.
  const renderSwitch = (node: MessageSwitch, key: number): ReactNode => (
    <TokenPill
      key={key}
      token={node.argument}
      label={labels.switchSummary(node)}
    />
  );

  // The words of one level of the message, each value and each set of
  // versions held by a character of its own. Markdown is read as a whole, so
  // formatting that spans a value or a set of versions
  // (`**Hi {name, select, …} today**`) is read as written.
  function render(
    nodes: readonly MessageNode[],
    plural: string | undefined,
  ): ReactNode {
    const held: (string | MessageSwitch)[] = [];
    let source = '';
    for (const node of nodes) {
      if (node.kind === 'text') {
        source += node.text;
      } else if (node.kind === 'count' && plural === undefined) {
        source += '#';
      } else {
        source += String.fromCodePoint(VALUE_MARK + held.length);
        held.push(
          node.kind === 'switch'
            ? node
            : node.kind === 'argument'
              ? node.name
              : (plural ?? ''),
        );
      }
    }
    const shown = (index: number, at: number): ReactNode => {
      const piece = held[index];
      if (piece === undefined) return undefined;
      return typeof piece === 'string' ? (
        <TokenPill key={at} token={piece} label={valueLabel(piece)} />
      ) : (
        renderSwitch(piece, at)
      );
    };
    if (markdown) {
      return (
        <RenderMarkdown
          allowedElements={allowedElements}
          rehypePlugins={SUMMARY_REHYPE_PLUGINS}
          components={{
            ...elements.components,
            span: ({ node, children }) => {
              const index = node?.properties?.[VALUE_PROPERTY];
              if (typeof index !== 'string') return <span>{children}</span>;
              // A character past the values is the author's own, kept as is.
              return (
                shown(Number(index), 0) ??
                String.fromCodePoint(VALUE_MARK + Number(index))
              );
            },
          }}
        >
          {source}
        </RenderMarkdown>
      );
    }
    return Array.from(source).map(
      (character, index) =>
        shown((character.codePointAt(0) ?? 0) - VALUE_MARK, index) ?? character,
    );
  }

  return <>{render(structure.nodes, undefined)}</>;
}

/**
 * `message` as a message that shows no values: each value, and each set of
 * versions, written as the name its pill shows, in brackets. For text a
 * preview hands to a control that takes only words (a scale's end labels),
 * which has no participant to fill a value in with.
 */
export const messageWithValueNames = (
  message: string,
  nameOf: (argument: string) => string,
): string => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return message;
  const write = (
    nodes: readonly MessageNode[],
    plural: string | undefined,
  ): string =>
    nodes
      .map((node) => {
        switch (node.kind) {
          case 'text':
            return node.text;
          case 'argument':
            return `[${nameOf(node.name)}]`;
          case 'count':
            return plural === undefined ? '#' : `[${nameOf(plural)}]`;
          case 'switch':
            return `[${nameOf(node.argument)}]`;
        }
      })
      .join('');
  return escapeMessageText(write(structure.nodes, undefined));
};

/** The name each value bound at `site` shows as, by the name it is bound to. */
export function useDynamicValueNames(
  site: Pick<DynamicMessageSite, 'context' | 'bindings'>,
): (argument: string) => string {
  const intl = useAppIntl();
  const { context, bindings } = site;
  return useMemo(() => {
    const naming = namingFor(intl);
    const choices = dynamicValueChoices(context);
    const choiceByName = new Map<string, DynamicValueChoice>();
    for (const [bindingName, binding] of Object.entries(bindings)) {
      const choice = choices.find((each) => each.path === binding.path);
      if (choice !== undefined) choiceByName.set(bindingName, choice);
    }
    return (argument: string) => {
      const choice = choiceByName.get(argument);
      return choice === undefined ? argument : naming.valueLabel(choice);
    };
  }, [intl, context, bindings]);
}

export type DynamicTextFieldProps = CreateFormFieldProps<
  LocalizedString,
  'div',
  {
    'id': string;
    'name': string;
    'aria-describedby': string;
    /** Where the text sits, which decides what it can show. */
    'dynamicValues': DynamicValueSite;
    /**
     * Where the text sits in the row a dialog edits, for a form field's
     * caption (such as `['prompt']`): which fields come before it decides
     * which answers it can show.
     */
    'fieldPath'?: readonly string[];
    /** Markdown text; plain text otherwise. */
    'markdown'?: boolean;
    'singleLine'?: boolean;
    'compact'?: boolean;
    'placeholder'?: string;
    'autoFocus'?: boolean;
    'hideUntranslatedNote'?: boolean;
  }
>;

/**
 * Text a participant reads, in each of the protocol's languages, that can
 * show values the interview fills in: the participant's answers, the people
 * a question is about, today's date. What it can show depends on where it
 * sits (`dynamicValues`), by the same rules the protocol is validated by.
 * Choosing a value binds it to the stage under a short name, which is what a
 * translator sees.
 */
export default function DynamicTextField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  dynamicValues: siteKind,
  fieldPath,
  markdown = false,
  singleLine = false,
  compact = false,
  placeholder,
  autoFocus,
  hideUntranslatedNote,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: DynamicTextFieldProps) {
  const site = useDynamicValueSite(siteKind, fieldPath);
  const { localization, locale } = useEditingLanguage();
  const defaultLocale = localization?.defaultLocale;
  const originalMessage =
    defaultLocale === undefined ? undefined : value?.[defaultLocale];
  const original = useMemo(
    () =>
      defaultLocale === undefined || originalMessage === undefined
        ? undefined
        : { locale: defaultLocale, message: originalMessage },
    [defaultLocale, originalMessage],
  );

  return (
    <LocalizedStringField
      value={value}
      onChange={onChange}
      hideUntranslatedNote={hideUntranslatedNote}
    >
      {(translation) => (
        <DynamicMessageEditor
          id={id}
          name={name}
          ariaDescribedBy={ariaDescribedBy}
          ariaLabelledBy={ariaLabelledBy}
          ariaInvalid={ariaInvalid}
          ariaRequired={ariaRequired === true}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          readOnly={readOnly === true || translation.readOnly}
          markdown={markdown}
          singleLine={!markdown || singleLine}
          compact={compact}
          message={translation.message}
          onMessageChange={translation.onMessageChange}
          original={original}
          locale={locale ?? defaultLocale ?? 'en'}
          site={site}
        />
      )}
    </LocalizedStringField>
  );
}
