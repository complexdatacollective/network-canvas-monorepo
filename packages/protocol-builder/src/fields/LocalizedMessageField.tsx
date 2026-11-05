import { useMemo, useRef } from 'react';
import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField, {
  type RichTextEditorToken,
  type RichTextInsertMenu,
  type RichTextInsertMenuItem,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  dynamicValueNamesIn,
  findMessageArgumentProblem,
  findMissingPlacement,
  type LocaleTag,
  type LocalizedString,
  type MessageArguments,
  type MessageNode,
  type MessageVariant,
  messageStructure,
  messageVariants,
  type MissingPlacement,
  pluralCountExamples,
  printMessageStructure,
} from '@codaco/protocol-validation';

import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import { asLocalizedString } from '../localization/localizedText.ts';
import {
  countTokenId,
  documentToMessageNodes,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
  MessageDocumentProblem,
  messageToDocument,
} from '../localization/messageDocument.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import type { RichTextContent } from '../markdown/markdownAdapter.ts';
import {
  inlineContent,
  isBlankMessage,
  MessageNodesSummary,
  numberSwitchLabels,
  pluralCategories,
  UnreadableMessage,
} from './DynamicTextField.tsx';
import {
  type MessageArgumentLabels,
  messageArgumentLabels,
  useMessageArgumentLabels,
} from './messageArgumentLabels.ts';

const messages = defineMessages({
  insertMenu: {
    id: 'protocolBuilder.localizedMessage.insertMenu',
    defaultMessage: 'Inject piped text from this stage',
    description:
      'Accessible name and tooltip of a toolbar icon button (a syringe), and the name of the searchable menu it opens, in a text a participant reads whose wording Network Canvas supplies, such as a label on the Family Pedigree. “Piped text” is survey-software vocabulary for text filled in while the interview runs: the menu offers what this text can show or change with, such as a family member’s name, the number of parents still to add, or whether the text is about the participant.',
  },
  byCase: {
    id: 'protocolBuilder.localizedMessage.byCase',
    defaultMessage: 'Different wording for each case',
    description:
      'Second line of an entry in the insert-a-value menu of a text a participant reads. The entry names something the text can change with, such as “Participant or someone else” or “Relation”; choosing it inserts a piece of text with one version for each of its cases, such as one about the participant and one about someone else.',
  },
  versionsByCase: {
    id: 'protocolBuilder.localizedMessage.versionsByCase',
    defaultMessage: 'Wording that changes with {value}',
    description:
      'Accessible name of a piece of text with one version for each case of something it changes with. value is that thing’s name, such as “Participant or someone else” or “Relation”.',
  },
  pluralVersion: {
    id: 'protocolBuilder.localizedMessage.pluralVersion',
    defaultMessage: 'When “{placeholder}” is {numbers}',
    description:
      'Label of the box holding the version of a text shown for some numbers. placeholder is the name of the number the text can show, such as “Parents missing”; numbers lists examples of the numbers that version is for, in the language being edited, such as “1” or “0, 2, 3, …”.',
  },
  versionsBlank: {
    id: 'protocolBuilder.localizedMessage.versionsBlank',
    defaultMessage: 'Write something in every version of this text.',
    description:
      'Refusal shown under a text with a piece written in several versions (one about the participant, one about someone else, and so on) when one of those versions is empty, in any of the protocol’s languages.',
  },
  placementMissing: {
    id: 'protocolBuilder.localizedMessage.placementMissing',
    defaultMessage: 'Include “{placeholder}” in this text.',
    description:
      'Refusal shown under a text when a translation leaves out a placeholder, such as a person’s name or a number, that the original text shows. placeholder is the placeholder’s name, such as “Name”.',
  },
  placementMissingIn: {
    id: 'protocolBuilder.localizedMessage.placementMissingIn',
    defaultMessage: 'Include “{placeholder}” in this version: {version}.',
    description:
      'Refusal shown under a text written in several versions when one version of a translation leaves out a placeholder, such as a person’s name or a number, that the original shows there. placeholder is the placeholder’s name, such as “Name”; version is the label of the version, such as “About someone else”.',
  },
  unreadable: {
    id: 'protocolBuilder.localizedMessage.unreadable',
    defaultMessage:
      'This text uses something it cannot show. Write it again here.',
    description:
      'Refusal shown under a text written in several versions when a translation imported from elsewhere uses a placeholder or a choice this text does not offer.',
  },
});

/** How many examples a plural version's label gives of the numbers it is for. */
const EXAMPLE_COUNT = 3;

/** Whether some version of a switch in `nodes`, at any depth, shows nothing. */
const hasBlankVersion = (nodes: readonly MessageNode[]): boolean =>
  nodes.some(
    (node) =>
      node.kind === 'switch' &&
      node.versions.some(
        (version) =>
          isBlankMessage(version.nodes) || hasBlankVersion(version.nodes),
      ),
  );

type LocalizedMessageProblem =
  | Readonly<{ kind: 'versionsBlank' | 'unreadable' }>
  | Readonly<{ kind: 'placementMissing'; missing: MissingPlacement }>;

/**
 * What a translation of a message is refused for: a version of a piece of
 * it left empty, something its arguments do not offer, or a
 * version leaving out a placeholder it must show (see
 * `findMissingPlacement`). Every place that writes a message holds it to
 * this rule: the stage editor's field (`localizedMessageValidation`) and
 * Architect's translation table.
 */
const localizedMessageProblem = (
  message: string,
  declaration: MessageArguments,
  locale: LocaleTag,
): LocalizedMessageProblem | undefined => {
  if (findMessageArgumentProblem(message, declaration) === undefined) {
    const missing = findMissingPlacement(message, declaration, locale);
    return missing === undefined
      ? undefined
      : { kind: 'placementMissing', missing };
  }
  const structure = messageStructure(message);
  return {
    kind:
      'nodes' in structure && hasBlankVersion(structure.nodes)
        ? 'versionsBlank'
        : 'unreadable',
  };
};

/** The refusal for `problem`, in words, naming any placeholder and version. */
const problemText = (
  problem: LocalizedMessageProblem,
  message: string,
  declaration: MessageArguments,
  locale: LocaleTag,
  intl: IntlShape,
): string => {
  if (problem.kind !== 'placementMissing') {
    return intl.formatMessage(messages[problem.kind]);
  }
  const { argument, when } = problem.missing;
  const versions = messageVersions(
    message,
    declaration,
    locale,
    intl,
    messageArgumentLabels(intl),
  );
  const version = versions.variants.findIndex((variant) =>
    Object.entries(when).every(([name, key]) => variant.when[name] === key),
  );
  const label = version === -1 ? '' : versions.versionLabel(version);
  const placeholder = versions.placeholderName(argument);
  return label === ''
    ? intl.formatMessage(messages.placementMissing, { placeholder })
    : intl.formatMessage(messages.placementMissingIn, {
        placeholder,
        version: label,
      });
};

/**
 * The rule every translation of a localized message is held to: each
 * version has words, or none does, it uses only what the setting offers, and
 * it shows each placeholder where the setting requires it. Shown under the
 * field rather than left to the stage's save, where the schema's refusal
 * would name no translation.
 */
export function localizedMessageValidation(
  declaration: MessageArguments,
  intl: IntlShape,
): CustomFieldValidation {
  return {
    schema: z.unknown().check(
      z.superRefine((value, ctx) => {
        const problem = localizedMessageProblemText(value, declaration, intl);
        if (problem !== undefined) {
          ctx.addIssue({
            code: 'custom',
            input: value,
            message: problem,
            path: [],
          });
        }
      }),
    ),
  };
}

/**
 * Why a localized message cannot be saved, in words, for the first of its
 * translations that cannot; undefined when every one can. The rule
 * `localizedMessageValidation` holds a field to, for a control that is not a
 * form's field.
 */
export function localizedMessageProblemText(
  value: unknown,
  declaration: MessageArguments,
  intl: IntlShape,
): string | undefined {
  for (const [locale, message] of Object.entries(
    asLocalizedString(value) ?? {},
  )) {
    const problem = localizedMessageProblem(message, declaration, locale);
    if (problem !== undefined) {
      return problemText(problem, message, declaration, locale, intl);
    }
  }
  return undefined;
}

/**
 * Why `message` cannot be saved, in words, or undefined when it can (or when
 * there is nothing to judge).
 */
export function useLocalizedMessageProblem(
  message: string | undefined,
  declaration: MessageArguments,
  locale: LocaleTag,
): string | undefined {
  const intl = useAppIntl();
  if (message === undefined) return undefined;
  const problem = localizedMessageProblem(message, declaration, locale);
  return problem === undefined
    ? undefined
    : problemText(problem, message, declaration, locale, intl);
}

type VersionGroup = Readonly<{
  key: string;
  /** What the group's select cases mean, or empty without a select. */
  label: string;
  versions: readonly Readonly<{
    index: number;
    /** The plural version's label, or undefined without a plural. */
    label: string | undefined;
    variant: MessageVariant;
  }>[];
}>;

/**
 * A message's versions in `locale`, one for every combination of the
 * setting's cases and plural categories, grouped by their select cases in
 * declared order, with what a refusal calls each version and each
 * placeholder.
 */
function messageVersions(
  message: string,
  declaration: MessageArguments,
  locale: LocaleTag,
  intl: IntlShape,
  { caseLabels, placeholderLabels }: MessageArgumentLabels,
) {
  const placeholderName = (argument: string) => {
    const label = placeholderLabels[argument]?.trim();
    return label === undefined || label === '' ? argument : label;
  };
  const selects = Object.entries(declaration).flatMap(([argument, { kind }]) =>
    kind === 'select' ? [argument] : [],
  );
  const plural = Object.entries(declaration).find(
    ([, { kind }]) => kind === 'plural',
  )?.[0];
  // Every version a message has is for some whole numbers, so each label
  // has examples (see `pluralCountExamples`).
  const examples =
    plural === undefined ? undefined : pluralCountExamples(locale);
  const pluralLabel = (variant: MessageVariant) => {
    if (plural === undefined) return undefined;
    const counts =
      [...(examples ?? [])].find(
        ([category]) => category === variant.when[plural],
      )?.[1] ?? [];
    const shown = counts
      .slice(0, EXAMPLE_COUNT)
      .map((count) => intl.formatNumber(count));
    return intl.formatMessage(messages.pluralVersion, {
      placeholder: placeholderName(plural),
      numbers: intl.formatList(
        counts.length > EXAMPLE_COUNT ? [...shown, '…'] : shown,
        { type: 'unit', style: 'short' },
      ),
    });
  };

  const variants = messageVariants(message, declaration, locale);
  const groups = new Map<
    string,
    { key: string; label: string; versions: VersionGroup['versions'][number][] }
  >();
  variants.forEach((variant, index) => {
    const key = selects
      .map((argument) => variant.when[argument])
      .join('\u0000');
    const group = groups.get(key) ?? {
      key,
      // A case without a label (or a blank one) adds nothing, so a group
      // with none has no label for the versions to point at.
      label: selects
        .map(
          (argument) =>
            caseLabels[argument]?.[variant.when[argument] ?? '']?.trim() ?? '',
        )
        .filter((label) => label !== '')
        .join(' · '),
      versions: [],
    };
    group.versions.push({ index, label: pluralLabel(variant), variant });
    groups.set(key, group);
  });

  const groupList = [...groups.values()] as readonly VersionGroup[];
  /** Everything a version's label says: its cases, then its numbers. */
  const versionLabel = (index: number) => {
    const group = groupList.find(({ versions }) =>
      versions.some((version) => version.index === index),
    );
    const version = group?.versions.find((each) => each.index === index);
    return [group?.label, version?.label].filter(Boolean).join(' · ');
  };

  return {
    variants,
    groups: groupList,
    placeholderName,
    versionLabel,
  };
}

const named = (label: string | undefined, argument: string) =>
  label === undefined || label.trim() === '' ? argument : label;

/**
 * What a localized message's editor and summary call its arguments, its
 * switches and their versions: a select argument by its name and each case
 * by the heading of its version, a number as its placeholder's name, with
 * versions labelled by examples of their numbers in `locale`.
 */
const messageNaming = (
  declaration: MessageArguments,
  locale: LocaleTag,
  intl: IntlShape,
  { switchLabels, caseLabels, placeholderLabels }: MessageArgumentLabels,
) => {
  const valueLabel = (argument: string) =>
    declaration[argument]?.kind === 'select'
      ? named(switchLabels[argument], argument)
      : named(placeholderLabels[argument], argument);
  const numbers = numberSwitchLabels(intl, locale);
  const labels: MessageDocumentLabels = {
    switchSummary: (node) => valueLabel(node.argument),
    switchLabel: (node) =>
      node.type === 'plural'
        ? numbers.switchLabel(valueLabel(node.argument))
        : intl.formatMessage(messages.versionsByCase, {
            value: valueLabel(node.argument),
          }),
    versionLabel: (node, key) =>
      node.type === 'plural'
        ? numbers.versionLabel(key)
        : named(caseLabels[node.argument]?.[key], key),
  };
  return { valueLabel, labels, numbers };
};

/** One line of plain text, which every version of a localized message is. */
const FORMAT: MessageDocumentFormat = { markdown: false, singleLine: true };

/**
 * A message's words in `locale`, read-only, each placeholder drawn as the
 * pill the editor draws and each set of versions folded to the pill of what
 * it chooses by, as the editor shows it folded: what a summary or an
 * unfocused table cell shows.
 */
export function LocalizedMessageVersionsSummary({
  message,
  declaration,
  locale,
}: Readonly<{
  message: string;
  declaration: MessageArguments;
  locale: LocaleTag;
}>) {
  const intl = useAppIntl();
  const argumentLabels = useMessageArgumentLabels();
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return <>{message}</>;
  const { valueLabel, labels } = messageNaming(
    declaration,
    locale,
    intl,
    argumentLabels,
  );
  return (
    <MessageNodesSummary
      nodes={structure.nodes}
      markdown={false}
      multiline={false}
      valueLabel={valueLabel}
      switchSummary={labels.switchSummary}
    />
  );
}

export type LocalizedMessageVersionsProps = Readonly<{
  id: string;
  name: string;
  /** One translation, as the protocol stores it, or empty. */
  message: string;
  /** Writes the translation; undefined when it was emptied. */
  onMessageChange: (message: string | undefined) => void;
  readOnly?: boolean;
  disabled?: boolean;
  declaration: MessageArguments;
  locale: LocaleTag;
  ariaLabelledBy: string | undefined;
  ariaDescribedBy: string;
  ariaInvalid?: boolean;
  /** Focuses the text as it mounts. */
  autoFocus?: boolean;
  /** Classes for the editor's own frame, which holds its text and toolbar. */
  className?: string;
}>;

/**
 * One translation of a localized message, edited as piped text is: one line
 * of text, its placeholders as pills, and a piece of text with a version for
 * each case (or for each kind of number) only where the text has one, folded
 * to a pill until it is opened, and able to hold another inside a version.
 * The insert menu (the toolbar button, or typing `{`) offers what the setting
 * declares: each placeholder, each select argument as wording for each of its
 * cases, and each number as wording that fits it, showing the number.
 */
export function LocalizedMessageVersions({
  id,
  name,
  message,
  onMessageChange,
  readOnly = false,
  disabled,
  declaration,
  locale,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  autoFocus = false,
  className,
}: LocalizedMessageVersionsProps) {
  const intl = useAppIntl();
  const argumentLabels = useMessageArgumentLabels();
  const { valueLabel, labels, numbers } = messageNaming(
    declaration,
    locale,
    intl,
    argumentLabels,
  );

  const items: RichTextInsertMenuItem[] = Object.entries(declaration).map(
    ([argument, declared]): RichTextInsertMenuItem => {
      const label = valueLabel(argument);
      if (declared.kind === 'text') {
        return {
          id: `value:${argument}`,
          label,
          content: inlineContent(
            [{ kind: 'argument', name: argument }],
            FORMAT,
            labels,
          ),
        };
      }
      if (declared.kind === 'plural') {
        return {
          id: `number:${argument}`,
          label,
          description: numbers.menuDescription(),
          content: inlineContent(
            [
              {
                kind: 'switch',
                argument,
                type: 'plural',
                versions: pluralCategories(locale).map((key) => ({
                  key,
                  nodes: [{ kind: 'count' }],
                })),
              },
            ],
            FORMAT,
            labels,
          ),
        };
      }
      return {
        id: `cases:${argument}`,
        label,
        description: intl.formatMessage(messages.byCase),
        content: inlineContent(
          [
            {
              kind: 'switch',
              argument,
              type: 'select',
              versions: [...new Set([...declared.cases, 'other'])].map(
                (key) => ({ key, nodes: [] }),
              ),
            },
          ],
          FORMAT,
          labels,
        ),
      };
    },
  );
  const insertMenu: RichTextInsertMenu = {
    label: intl.formatMessage(messages.insertMenu),
    items,
    trigger: '{',
  };

  // Each placeholder, and each number where its plural shows it. A name the
  // text uses that the setting does not declare, as an imported translation
  // can, keeps a pill under its own name, so an edit never drops its words.
  const tokens: RichTextEditorToken[] = [
    ...new Set([...Object.keys(declaration), ...dynamicValueNamesIn(message)]),
  ].flatMap((argument): RichTextEditorToken[] => {
    const kind = declaration[argument]?.kind;
    const label = valueLabel(argument);
    return [
      ...(kind === 'select' || kind === 'plural'
        ? []
        : [{ id: argument, label, text: `{${argument}}`, inToolbar: false }]),
      ...(kind === 'select' || kind === 'text'
        ? []
        : [{ id: countTokenId(argument), label, inToolbar: false }]),
    ];
  });

  // What the document's pills and version labels say, so a change of
  // interface language relabels a document already open.
  const labelsKey = `${intl.locale}:${locale}`;

  // The stored message as the editor's document, or why it cannot be one.
  const parsed = useMemo(() => {
    const structure = messageStructure(message);
    if (!('nodes' in structure)) return undefined;
    try {
      return messageToDocument(structure.nodes, FORMAT, labels);
    } catch (error) {
      if (error instanceof MessageDocumentProblem) return undefined;
      throw error;
    }
    // The labels follow the languages (`labelsKey`) and the declaration; the
    // message decides the document.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [message, declaration, labelsKey]);

  // As `DynamicMessageEditor` does: the editor gets its own last document
  // back while that document still writes the stored message, so a round
  // trip never rewrites what the researcher is typing.
  const lastEmitted = useRef<{
    message: string;
    content: RichTextContent;
    labelsKey: string;
  } | null>(null);
  const content =
    lastEmitted.current?.message === message &&
    lastEmitted.current.labelsKey === labelsKey
      ? lastEmitted.current.content
      : parsed;

  const handleChange = (next: unknown) => {
    if (typeof next !== 'object' || next === null) return;
    const document = next as RichTextContent;
    let nodes: MessageNode[];
    try {
      nodes = documentToMessageNodes(document, FORMAT);
    } catch {
      return;
    }
    const nextMessage = isBlankMessage(nodes)
      ? undefined
      : printMessageStructure(nodes);
    lastEmitted.current = {
      message: nextMessage ?? '',
      content: document,
      labelsKey,
    };
    if ((nextMessage ?? '') === message) return;
    onMessageChange(nextMessage);
  };

  if (parsed === undefined && message !== '') {
    return (
      <UnreadableMessage
        id={id}
        name={name}
        message={message}
        className={className}
      />
    );
  }

  return (
    <RichTextEditorField
      id={id}
      name={name}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      autoFocus={autoFocus}
      disabled={disabled}
      readOnly={readOnly}
      singleLine
      // Every keystroke, so that a host can mark the text changed, and judge
      // it, as it is written.
      changeMode="input"
      toolbarOptions={{
        bold: false,
        italic: false,
        links: false,
        headings: false,
        lists: false,
        thematicBreak: false,
        history: true,
      }}
      tokens={tokens}
      versions
      insertMenu={insertMenu}
      value={content ?? { type: 'doc', content: [{ type: 'paragraph' }] }}
      onChange={handleChange}
      className={className}
    />
  );
}

export type LocalizedMessageFieldProps = CreateFormFieldProps<
  LocalizedString,
  'div',
  {
    /** What the setting's messages may use (see `localizedMessage`). */
    'arguments': MessageArguments;
    'id': string;
    'name': string;
    'aria-describedby': string;
  }
>;

/**
 * Participant-facing text that changes with what it is about: a localized
 * message (see `localizedMessage`), edited in the editing language as piped
 * text is (see `LocalizedMessageVersions`).
 *
 * The text has a version for each case of something it changes with, such
 * as whether it is about the participant, only where it has one, and
 * wording that fits a number only where its language needs it. Emptying the
 * text removes the translation; a version left empty, a placeholder the
 * supplied wording shows and a translation leaves out, or something the
 * setting does not offer, is refused (see `localizedMessageValidation`).
 */
export default function LocalizedMessageField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  'arguments': declaration,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: LocalizedMessageFieldProps) {
  const { localization, locale } = useEditingLanguage();

  return (
    <LocalizedStringField value={value} onChange={onChange}>
      {(translation) => (
        <LocalizedMessageVersions
          id={id}
          name={name}
          message={translation.message}
          onMessageChange={translation.onMessageChange}
          readOnly={readOnly === true || translation.readOnly}
          disabled={disabled}
          declaration={declaration}
          locale={locale ?? localization?.defaultLocale ?? 'en'}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
          ariaInvalid={ariaInvalid}
        />
      )}
    </LocalizedStringField>
  );
}
