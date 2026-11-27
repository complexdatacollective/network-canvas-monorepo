import { useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import RichTextEditorField, {
  type RichTextCommands,
  type RichTextInlineValues,
  type RichTextInsertState,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { useInterfaceLanguage } from '@codaco/fresco-ui/interfaceLanguage';
import {
  dynamicValueNamesIn,
  type LocaleTag,
  type MessageNode,
  NUMBER_WORDING_COUNT,
  parseDynamicValueName,
  pluralCategoriesOf,
  printMessageStructure,
} from '@codaco/protocol-validation';

import { isFlagChoice } from '../../localization/dynamicValueCatalog.ts';
import {
  countTokenId,
  documentToMessageNodes,
  isBlankStructure,
  type MessageDocumentFormat,
  type MessageDocumentLabels,
  openMessageDocument,
} from '../../localization/messageDocument.ts';
import { richTextToolbarFor } from '../../localization/textShape.ts';
import { useMessageDocument } from '../../localization/useMessageDocument.ts';
import { useMessageArgumentLabels } from '../messageArgumentLabels.ts';
import { variablePillSpec } from '../VariablePill.tsx';
import { AttributeMenu } from './AttributeMenu.tsx';
import { DynamicAttributePopover } from './DynamicAttributePopover.tsx';
import { dynamicAttributeName } from './dynamicAttributeWrites.ts';
import {
  DynamicTextEnvironmentContext,
  type WordingEditorProps,
  type WordingEditors,
} from './editorEnvironment.ts';
import { useEditorEnvironment } from './useEditorEnvironment.ts';
import { numberSwitchLabels } from './versionLabels.ts';

/** Number wording is one line of markdown, as every version's wording is. */
const FORMAT: MessageDocumentFormat = { markdown: true, singleLine: true };

/** The value that stands for the number in a version: `#`. */
const COUNT_VALUE = countTokenId(NUMBER_WORDING_COUNT);

/**
 * A plural message on the number with an empty version for each of
 * `locale`'s plural forms: where number wording starts.
 */
const numberWordingTemplate = (locale: LocaleTag): string =>
  `{${NUMBER_WORDING_COUNT}, plural, ${pluralCategoriesOf(locale)
    .map((category) => `${category} {}`)
    .join(' ')}}`;

/** Whether `nodes` show nothing in any version: only blank words. */
const showsNothing = (nodes: readonly MessageNode[]): boolean =>
  nodes.every((node) =>
    node.kind === 'switch'
      ? node.versions.every((version) => showsNothing(version.nodes))
      : node.kind === 'text' && node.text.trim() === '',
  );

type NumberWordingEditorProps = Omit<WordingEditorProps, 'placeholder'> &
  Readonly<{
    /** The editors of the wording of dynamic attributes that it shows. */
    editors: WordingEditors;
    disabled?: boolean;
    autoFocus?: boolean;
    /** Classes for the editor's own frame, which holds its text and toolbar. */
    className?: string;
  }>;

/** The dynamic attribute whose popover is open, and the pill it points at. */
type OpenPill = Readonly<{ id: string; element: HTMLElement }>;

/**
 * The wording of a dynamic attribute for singular or plural numbers, in one
 * language: a version for each plural form of the language, each written as
 * other wording is, in bold or italics and with the values that its owner's
 * text can show. The Attribute menu offers those values and the dynamic
 * attributes that the wording may show; the attribute whose number it is
 * worded for puts in the number. A language without wording yet starts from
 * an empty version for each of its plural forms, which is written only once
 * one of them is.
 */
export function NumberWordingEditor({
  id,
  name,
  message,
  onMessageChange,
  locale,
  site,
  ownDynamicAttribute,
  counted,
  readOnly,
  editors,
  disabled,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid,
  autoFocus = false,
  className,
}: NumberWordingEditorProps) {
  const intl = useAppIntl();
  const labelLanguage = useInterfaceLanguage();
  const argumentLabels = useMessageArgumentLabels();
  const shown = message === '' ? numberWordingTemplate(locale) : message;
  const { environment, naming, choices, pillLabelsKey } = useEditorEnvironment({
    site,
    locale,
    readOnly,
    disabled,
    ownDynamicAttribute,
    editors,
  });
  const [openPill, setOpenPill] = useState<OpenPill | null>(null);
  const commands = useRef<RichTextCommands | null>(null);

  // The number is the answer to the attribute it counts, and is named for it.
  const countPill = () =>
    counted === undefined
      ? {
          name: argumentLabels.placeholderLabels.count ?? NUMBER_WORDING_COUNT,
          kind: 'placeholder' as const,
          ...labelLanguage,
        }
      : naming.pillFor(counted);
  const pillOf = (valueId: string) =>
    valueId === COUNT_VALUE ? countPill() : naming.pillFor(valueId);

  const numbers = numberSwitchLabels(intl, locale);
  const countName = countPill().name;
  const labels: MessageDocumentLabels = {
    switchSummary: () => countName,
    switchLabel: () => numbers.switchLabel(countName),
    versionLabel: (_, key) => numbers.versionLabel(key),
  };

  const inlineValues: RichTextInlineValues = {
    spec: (valueId) =>
      variablePillSpec({
        ...pillOf(valueId),
        size: 'inline',
        describeKind: true,
      }),
    text: (valueId) => pillOf(valueId).name,
    version: JSON.stringify([
      pillLabelsKey,
      countName,
      shown === '' ? [] : dynamicValueNamesIn(shown),
    ]),
    onActivate: (valueName, element) => {
      const parsed = parseDynamicValueName(valueName);
      if (parsed?.kind !== 'dynamicAttribute') return;
      setOpenPill({ id: parsed.id, element });
    },
    written: choices
      .filter((choice) => !isFlagChoice(choice))
      .map((choice) => ({ id: choice.name, text: `{${choice.name}}` })),
  };

  const opened = useMessageDocument({
    text: shown,
    // The labels follow the languages and the number's name; the message
    // decides the document.
    openKey: `${name}:${intl.locale}:${locale}:${countName}`,
    open: (text) =>
      openMessageDocument(name, text, FORMAT, { versions: labels }),
    write: (document) => {
      const nodes = documentToMessageNodes(document, FORMAT);
      // Wording whose every version is empty shows nothing, written as such.
      return isBlankStructure(nodes) || showsNothing(nodes)
        ? ''
        : printMessageStructure(nodes);
    },
    // The template is written only once one of its versions is.
    holds: (written) => (written ?? '') === message || written === shown,
    onWrite: (written) => onMessageChange(written ?? ''),
  });

  const renderInsertTools = (insert: RichTextInsertState) => (
    <AttributeMenu
      insert={insert}
      {...(counted !== undefined && {
        counted: { name: counted, valueId: COUNT_VALUE },
      })}
    />
  );

  return (
    <DynamicTextEnvironmentContext value={environment}>
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
        changeMode="input"
        toolbarOptions={richTextToolbarFor(true)}
        inlineValues={inlineValues}
        // The wording is one plural, whose versions are listed open.
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
        commandsRef={commands}
      />
      {openPill !== null && (
        <DynamicAttributePopover
          id={openPill.id}
          anchor={openPill.element}
          onClose={() => setOpenPill(null)}
          onRemove={() => {
            setOpenPill(null);
            commands.current?.removeInlineValues(
              dynamicAttributeName(openPill.id),
            );
          }}
        />
      )}
    </DynamicTextEnvironmentContext>
  );
}
