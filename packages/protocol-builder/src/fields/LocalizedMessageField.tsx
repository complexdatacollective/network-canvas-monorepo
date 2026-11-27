import { z } from 'zod/mini';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import RichTextEditorField, {
  type RichTextInlineValues,
  type RichTextInsertState,
  type RichTextVersionPlace,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import { useInterfaceLanguage } from '@codaco/fresco-ui/interfaceLanguage';
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
  missingPlacementsOf,
  type MissingPlacement,
  pluralCategoriesOf,
  pluralCountExamples,
  pluralValueExamples,
  printMessageStructure,
} from '@codaco/protocol-validation';

import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import { asLocalizedString } from '../localization/localizedText.ts';
import {
  countContent,
  countTokenId,
  documentToMessageNodes,
  inlineContent,
  isBlankStructure,
  isSwitchMeta,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
  openMessageDocument,
} from '../localization/messageDocument.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import { PLAIN_TEXT_TOOLBAR } from '../localization/textShape.ts';
import { useMessageDocument } from '../localization/useMessageDocument.ts';
import type { RichTextContent } from '../markdown/markdownAdapter.ts';
import { attributeGroupMessages } from './attributeGroups.ts';
import {
  ATTRIBUTE_MENU_LABEL,
  AttributeMenuButton,
  useAttributeMenuState,
} from './dynamicText/AttributeMenuButton.tsx';
import { MessageNodesSummary } from './dynamicText/DynamicMessageSummary.tsx';
import { versionLabelMessages } from './dynamicText/versionLabels.ts';
import {
  type MessageArgumentLabels,
  messageArgumentLabels,
  useMessageArgumentLabels,
} from './messageArgumentLabels.ts';
import VariablePickerList, {
  type VariablePickerGroup,
} from './VariablePickerList.tsx';
import { type VariablePillProps, variablePillSpec } from './VariablePill.tsx';

const messages = defineMessages({
  required: {
    id: 'protocolBuilder.localizedMessage.required',
    defaultMessage: 'Required in this wording',
    description:
      'Note under an entry in the Attribute menu of wording that Network Canvas supplies, such as the name of the person, when the version of the wording being written must include it and does not include it yet.',
  },
  requiredMissing: {
    id: 'protocolBuilder.localizedMessage.requiredMissing',
    defaultMessage: 'This wording is missing something it requires',
    description:
      'Read by a screen reader as the description of the Attribute button of the toolbar, above wording that Network Canvas supplies, while the version of the wording being written lacks something it must include, such as the name of the person. The button shows a dot for sighted users.',
  },
  pluralVersion: {
    id: 'protocolBuilder.localizedMessage.pluralVersion',
    defaultMessage: 'When “{placeholder}” is {numbers}',
    description:
      'Label of the box holding the version of a text shown for some numbers. placeholder is the name of the number the text can show, such as “Parents missing”; numbers lists examples of the numbers that version is for, in the language being edited, such as “1” or “0, 2, 3, …”.',
  },
  versionsBlank: {
    id: 'protocolBuilder.localizedMessage.versionsBlank',
    defaultMessage: 'Write something in every version of this wording.',
    description:
      'Refusal shown under a text with a piece written in several versions (one about the participant, one about someone else, and so on) when one of those versions is empty, in any of the protocol’s languages.',
  },
  placementMissing: {
    id: 'protocolBuilder.localizedMessage.placementMissing',
    defaultMessage: 'This wording must include the attribute “{placeholder}”.',
    description:
      'Refusal shown to a researcher under a text in a protocol that leaves out an attribute it must show, such as a person’s name or a number. placeholder is the attribute’s name, such as “Name”.',
  },
  placementMissingIn: {
    id: 'protocolBuilder.localizedMessage.placementMissingIn',
    defaultMessage:
      'This wording must include the attribute “{placeholder}” in the “{version}” scenario.',
    description:
      'Refusal shown to a researcher under a text in a protocol that is worded differently for different scenarios (for example, one wording about the participant and another about someone else), when the wording for one scenario leaves out an attribute it must show, such as a person’s name or a number. placeholder is the attribute’s name, such as “Name”; version is the label of the scenario, such as “About someone else”.',
  },
  unreadable: {
    id: 'protocolBuilder.localizedMessage.unreadable',
    defaultMessage:
      'This wording uses something that it cannot show. Write it again here.',
    description:
      'Refusal shown under a text written in several versions when a translation imported from elsewhere uses a placeholder or a choice this text does not offer.',
  },
});

/**
 * How many examples a plural version's label gives of the numbers it is for.
 */
const EXAMPLE_COUNT = 3;

/** The plural categories a number switch has versions for, `other` last. */
const pluralCategories = (locale: LocaleTag): string[] => {
  const categories = [...pluralValueExamples(locale).keys()].filter(
    (category) => category !== 'other',
  );
  return [...categories, 'other'];
};

/**
 * What a switch on a number is called, and each of its versions: examples
 * of the numbers it is for, in `locale`.
 */
const numberSwitchLabels = (intl: IntlShape, locale: LocaleTag) => ({
  switchLabel: (value: string) => `Wording that fits the number ${value}`,
  versionLabel: (key: string) => {
    const exact = /^=(\d+)$/.exec(key);
    const counts = exact
      ? [Number(exact[1])]
      : ([...pluralValueExamples(locale)].find(
          ([category]) => category === key,
        )?.[1] ?? []);
    const shown = counts
      .slice(0, EXAMPLE_COUNT)
      .map((count) => intl.formatNumber(count));
    return intl.formatMessage(versionLabelMessages.numbers, {
      numbers: intl.formatList(
        counts.length > EXAMPLE_COUNT ? [...shown, '…'] : shown,
        { type: 'unit', style: 'short' },
      ),
    });
  },
});

/** Whether some version of a switch in `nodes`, at any depth, shows nothing. */
const hasBlankVersion = (nodes: readonly MessageNode[]): boolean =>
  nodes.some(
    (node) =>
      node.kind === 'switch' &&
      node.versions.some(
        (version) =>
          isBlankStructure(version.nodes) || hasBlankVersion(version.nodes),
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

/** The argument a value's pill stands for: itself, or the number it counts. */
const argumentOf = (valueId: string) =>
  valueId.startsWith(countTokenId('')) ? valueId.slice(1) : valueId;

/**
 * The pill of a placeholder of wording that Network Canvas supplies, named in
 * the interface's words and so read in the interface's language.
 */
const placeholderPill = (
  name: string,
  language: Pick<VariablePillProps, 'lang' | 'dir'>,
): VariablePillProps => ({
  name,
  kind: 'placeholder',
  ...language,
});

/** Something the Attribute menu of supplied wording puts in the text. */
type SuppliedWordingEntry = Readonly<{
  value: string;
  label: string;
  /** A placeholder is a value; a choice or a number is wording. */
  group: 'interview' | 'dynamic';
  content: readonly RichTextContent[];
  /**
   * Whether the version that the caret is in, given the versions around it
   * (see `RichTextVersionPlace`), must include this and does not yet.
   */
  required?: (place: readonly RichTextVersionPlace[]) => boolean;
}>;

/**
 * The Attribute menu of wording supplied by Network Canvas, as in any other
 * text: each placeholder under "Interview attributes", and each choice and
 * number that the wording can change with under "Dynamic attributes", which
 * puts in a version for each of its cases or plural forms.
 */
function SuppliedWordingMenu({
  insert,
  entries,
  language,
}: Readonly<{
  insert: RichTextInsertState;
  entries: readonly SuppliedWordingEntry[];
  language: Pick<VariablePillProps, 'lang' | 'dir'>;
}>) {
  const intl = useAppIntl();
  const state = useAttributeMenuState(insert);
  // Judged where the text goes: the version that the menu was opened in by
  // typing, or the one that the toolbar acts on.
  const required = new Set(
    entries.flatMap((entry) =>
      entry.required?.(insert.versionPlace) === true ? [entry.value] : [],
    ),
  );
  const marker = intl.formatMessage(messages.required);
  const groups: VariablePickerGroup[] = (['interview', 'dynamic'] as const)
    .map((group) => ({
      id: group,
      label: intl.formatMessage(attributeGroupMessages[group]),
      options: entries
        .filter((entry) => entry.group === group)
        .map(({ value, label }) => ({
          value,
          label,
          ...(required.has(value) && { marker }),
        })),
    }))
    .filter((group) => group.options.length > 0);
  const pillOf = (value: string): VariablePillProps => {
    const entry = entries.find((each) => each.value === value);
    const name = entry?.label ?? value;
    return entry?.group === 'dynamic'
      ? { name, kind: 'dynamic', ...language }
      : placeholderPill(name, language);
  };
  return (
    <AttributeMenuButton
      insert={insert}
      state={state}
      {...(required.size > 0 && {
        missing: intl.formatMessage(messages.requiredMissing),
      })}
    >
      <VariablePickerList
        aria-label={ATTRIBUTE_MENU_LABEL}
        groups={groups}
        optionPill={(option) => pillOf(option.value)}
        onSelect={(value) => {
          const entry = entries.find((each) => each.value === value);
          if (entry === undefined) return;
          state.setMenuOpen(false);
          insert.commands.insertContent(entry.content);
        }}
        onOpenChange={(next) => {
          if (!next) state.close();
        }}
      />
    </AttributeMenuButton>
  );
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
        : `Wording that changes with ${valueLabel(node.argument)}`,
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
 * pill the editor draws. A set of versions that is the whole of the message,
 * or of one version of it, is written out, a labelled line for each version,
 * as the editor lists it open; a set among words is folded to the pill of
 * what it chooses by, as the editor shows it folded. What a summary or an
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
  const labelLanguage = useInterfaceLanguage();
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
      valuePill={(argument) =>
        placeholderPill(valueLabel(argument), labelLanguage)
      }
      switchPill={(node) =>
        placeholderPill(valueLabel(node.argument), labelLanguage)
      }
      versionLabel={labels.versionLabel}
    />
  );
}

type LocalizedMessageVersionsProps = Readonly<{
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
  /**
   * For the number wording of a dynamic attribute (`{count, plural, …}`): a
   * language without wording yet starts from an empty version for each of
   * its plural forms, so that each can be written (nothing is stored until
   * one is), and the Attribute menu offers the number, which a version shows
   * only where it is put in.
   */
  numberWording?: boolean;
  /**
   * Names of placeholders, by argument, in place of the names that Network
   * Canvas gives them: the number of number wording named for the attribute
   * it counts, say.
   */
  valueLabels?: Readonly<Record<string, string>>;
}>;

/**
 * A plural message on `count` with an empty version for each of `locale`'s
 * plural forms: where number wording starts.
 */
const numberWordingTemplate = (locale: LocaleTag): string =>
  `{count, plural, ${pluralCategoriesOf(locale)
    .map((category) => `${category} {}`)
    .join(' ')}}`;

/**
 * One translation of a localized message, edited as other text is: one line
 * of text, its placeholders as pills, and a piece of text with a version for
 * each case (or for each kind of number) only where the text has one, folded
 * to a pill until it is opened, and able to hold another inside a version.
 * Where the whole message is one such piece, its versions are listed open.
 * The Attribute menu (the toolbar button, or typing `{`) offers what the
 * setting declares: each placeholder, each select argument as wording for
 * each of its cases, and each number as wording that fits it, showing the
 * number.
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
  numberWording = false,
  valueLabels,
}: LocalizedMessageVersionsProps) {
  // What the editor opens: the stored translation, or where number wording
  // starts.
  const shown =
    numberWording && message === '' ? numberWordingTemplate(locale) : message;
  const intl = useAppIntl();
  const labelLanguage = useInterfaceLanguage();
  const ownLabels = useMessageArgumentLabels();
  const argumentLabels =
    valueLabels === undefined
      ? ownLabels
      : {
          ...ownLabels,
          placeholderLabels: { ...ownLabels.placeholderLabels, ...valueLabels },
        };
  const { valueLabel, labels } = messageNaming(
    declaration,
    locale,
    intl,
    argumentLabels,
  );

  const missing = missingPlacementsOf(shown, declaration, locale);
  // Whether the version being written requires `argument` and does not show
  // it: some version of the message for the cases that the caret is in.
  const missingIn =
    (argument: string): SuppliedWordingEntry['required'] =>
    (place) =>
      missing.some(
        (each) =>
          each.argument === argument &&
          place.every(
            ({ meta, key }) =>
              !isSwitchMeta(meta) || each.when[meta.argument] === key,
          ),
      );

  // What the Attribute menu offers: each placeholder, as a value the
  // interview fills in, and each choice and number as wording with a
  // version for each of its cases or plural forms. Number wording is that
  // plural's versions, so its number is offered as a value, to put in a
  // version.
  const entries: SuppliedWordingEntry[] = Object.entries(declaration).map(
    ([argument, declared]): SuppliedWordingEntry => {
      const label = valueLabel(argument);
      if (numberWording && declared.kind === 'plural') {
        return {
          value: `value:${argument}`,
          label,
          group: 'interview',
          required: missingIn(argument),
          content: countContent(argument),
        };
      }
      if (declared.kind === 'text') {
        return {
          value: `value:${argument}`,
          label,
          group: 'interview',
          required: missingIn(argument),
          content: inlineContent(
            [{ kind: 'argument', name: argument }],
            FORMAT,
            { versions: labels },
          ),
        };
      }
      const versions =
        declared.kind === 'plural'
          ? pluralCategories(locale).map((key) => ({
              key,
              nodes: [{ kind: 'count' } as const],
            }))
          : [...new Set([...declared.cases, 'other'])].map((key) => ({
              key,
              nodes: [],
            }));
      return {
        value: `${declared.kind}:${argument}`,
        label,
        group: 'dynamic',
        // A number can be required; a choice never is.
        required: missingIn(argument),
        content: inlineContent(
          [
            {
              kind: 'switch',
              argument,
              type: declared.kind === 'plural' ? 'plural' : 'select',
              versions,
            },
          ],
          FORMAT,
          { versions: labels },
        ),
      };
    },
  );

  const renderInsertTools = (insert: RichTextInsertState) => (
    <SuppliedWordingMenu
      insert={insert}
      entries={entries}
      language={labelLanguage}
    />
  );

  // Each placeholder, and each number where its plural shows it. A name the
  // text uses that the setting does not declare, as an imported translation
  // can, keeps a pill under its own name, so an edit never drops its words.
  const shownArguments = [
    ...new Set([...Object.keys(declaration), ...dynamicValueNamesIn(message)]),
  ];
  const inlineValues: RichTextInlineValues = {
    spec: (valueId) =>
      variablePillSpec({
        ...placeholderPill(valueLabel(argumentOf(valueId)), labelLanguage),
        size: 'inline',
      }),
    text: (valueId) => valueLabel(argumentOf(valueId)),
    version: `${intl.locale}:${labelLanguage.dir ?? ''}:${locale}:${JSON.stringify(
      shownArguments.map(valueLabel),
    )}`,
    written: shownArguments
      .filter((argument) => declaration[argument]?.kind === 'text')
      .map((argument) => ({ id: argument, text: `{${argument}}` })),
  };

  // What the document's pills and version labels say, so a change of
  // interface language relabels a document already open.
  const labelsKey = `${intl.locale}:${locale}`;

  const opened = useMessageDocument({
    text: shown,
    // The labels follow the languages and the declaration; the message
    // decides the document.
    openKey: `${name}:${labelsKey}:${JSON.stringify(declaration)}`,
    open: (text) =>
      openMessageDocument(name, text, FORMAT, { versions: labels }),
    write: (document) => {
      const nodes = documentToMessageNodes(document, FORMAT);
      return isBlankStructure(nodes) ? undefined : printMessageStructure(nodes);
    },
    // The template that number wording starts from is written only once it
    // is changed.
    holds: (written) => (written ?? '') === message || written === shown,
    onWrite: onMessageChange,
  });

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
      toolbarOptions={PLAIN_TEXT_TOOLBAR}
      inlineValues={inlineValues}
      // A message that is one plural or one choice is those versions and
      // nothing else, so they are listed rather than folded to a pill.
      versions
      // English, as every name in the toolbar is.
      insertTools={{
        label: 'Insert an attribute',
        render: renderInsertTools,
      }}
      value={
        opened.content ?? { type: 'doc', content: [{ type: 'paragraph' }] }
      }
      onChange={opened.onDocumentChange}
      className={className}
    />
  );
}

type LocalizedMessageFieldProps = CreateFormFieldProps<
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
 * message (see `localizedMessage`), edited in the editing language as other
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
  const { editingLocale } = useEditingLanguage();

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
          locale={editingLocale}
          ariaLabelledBy={ariaLabelledBy}
          ariaDescribedBy={ariaDescribedBy}
          ariaInvalid={ariaInvalid}
        />
      )}
    </LocalizedStringField>
  );
}
