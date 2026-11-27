import { Split } from 'lucide-react';
import {
  type ReactNode,
  type RefObject,
  useMemo,
  useRef,
  useState,
} from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import RichTextEditorField, {
  type RichTextAssetBlocks,
  type RichTextCommands,
  type RichTextFieldBlocks,
  type RichTextInlineValues,
  type RichTextInsertState,
  ToolbarButton,
  toolbarLabelledButtonStyles,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';
import {
  dynamicValueNamesIn,
  findSiteMessageProblem,
  type LocaleTag,
  parseDynamicValueName,
} from '@codaco/protocol-validation';

import {
  asConditionDraft,
  type ConditionDraft,
  conditionAboutChoices,
  conditionCodebook,
  conditionSentence,
} from '../../localization/conditionText.ts';
import {
  type DynamicValueChoice,
  dynamicValueChoices,
  isFlagChoice,
} from '../../localization/dynamicValueCatalog.ts';
import {
  resolveStoredTranslation,
  resolveTranslation,
} from '../../localization/localizedText.ts';
import {
  documentToMessage,
  type FieldText,
  type MessageDocumentFormat,
  messageToDocument,
} from '../../localization/messageDocument.ts';
import { useEditingLanguage } from '../../localization/ProtocolLocalization.tsx';
import {
  PLAIN_TEXT_TOOLBAR,
  richTextToolbarFor,
} from '../../localization/textShape.ts';
import { useMessageDocument } from '../../localization/useMessageDocument.ts';
import type { RichTextContent } from '../../markdown/markdownAdapter.ts';
import type { ConditionScope } from '../../rules/ConditionRulesControl.tsx';
import { variablePillSpec } from '../VariablePill.tsx';
import { AttributeMenu } from './AttributeMenu.tsx';
import { newConditionVersion } from './dynamicAttributeDraft.ts';
import { DynamicAttributePopover } from './DynamicAttributePopover.tsx';
import { dynamicAttributeName } from './dynamicAttributeWrites.ts';
import {
  type DynamicTextEnvironment,
  DynamicTextEnvironmentContext,
} from './editorEnvironment.ts';
import {
  type LogicBlockState,
  logicBlockOf,
  logicBlockWithOption,
} from './logicBlockModel.ts';
import { useLogicBlocks } from './LogicBlockView.tsx';
import { firstAvailableLogicOption } from './logicOptions.ts';
import type { DynamicMessageSite } from './messageSite.ts';
import { namingFor } from './valueNaming.ts';

const messages = defineMessages({
  logicBlock: {
    id: 'protocolBuilder.dynamicText.logicBlockButton',
    defaultMessage: 'Logic block',
    description:
      'Button in the toolbar of a text editor that puts in a logic block: content that is shown only in some cases, such as only when the participant is over 18.',
  },
  unreadable: {
    id: 'protocolBuilder.dynamicText.unreadable',
    defaultMessage:
      'This wording cannot be edited here, because the editor does not support the way it is written. It is shown below as it is stored.',
    description:
      'Shown in place of a text editor when the stored text cannot be opened, such as text in an imported or hand-written protocol that chooses between versions inside a sentence.',
  },
});

/**
 * The fields of a form, for the text of a form (the form section's
 * document): how their blocks are drawn, the question, hint and settings of
 * each, and where the ones the researcher writes go.
 */
type DynamicMessageFields = Readonly<{
  blocks: RichTextFieldBlocks;
  /** The field each field block names, as `messageToDocument` reads it. */
  fieldText: (fieldId: string) => FieldText | undefined;
  /**
   * The question, hint and settings of each field the text places, by field
   * id, each time the text changes: called before `onMessageChange`. Not
   * called where the blocks contain no text (`blocks.text`).
   */
  onFieldTextsChange?: (fieldTexts: ReadonlyMap<string, FieldText>) => void;
  /** The toolbar's button that puts in a field. */
  insertTool: (insert: RichTextInsertState) => ReactNode;
}>;

type DynamicMessageEditorProps = Readonly<{
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
  /**
   * How the files the text holds as blocks are drawn and chosen, for text
   * declared to hold them (`textFieldPropsFor`). Absent for any other text,
   * where an image written into it is read as its description.
   */
  assetBlocks?: RichTextAssetBlocks;
  /** For the text of a form: its fields, as blocks of the text. */
  fields?: DynamicMessageFields;
  message: string;
  onMessageChange: (message: string | undefined) => void;
  locale: LocaleTag;
  site: DynamicMessageSite;
  /**
   * False where the host says what is wrong with the text itself, as the
   * translation table does once the researcher leaves the cell.
   */
  showsProblems?: boolean;
  /** Classes for the editor's own frame, which holds its text and toolbar. */
  className?: string;
  /**
   * Given the editor's commands (`RichTextCommands`), for a host that changes
   * the text from outside the toolbar.
   */
  commandsRef?: RefObject<RichTextCommands | null>;
}>;

const NOTHING: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * What the toolbar calls the group of insert tools, by what the tools put
 * in: a form's text offers fields, and text of several lines offers logic
 * blocks. English, as every name in the toolbar is.
 */
const INSERT_TOOLS_LABELS = {
  text: {
    singleLine: 'Insert an attribute',
    multiLine: 'Insert an attribute or logic block',
  },
  form: {
    singleLine: 'Insert an attribute or field',
    multiLine: 'Insert an attribute, field or logic block',
  },
} as const;
const ONE_PLACE = () => 1;
const EMPTY_DOCUMENT: RichTextContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** The dynamic attribute whose popover is open, and the pill it points at. */
type OpenPill = Readonly<{ id: string; element: HTMLElement }>;

/**
 * One translation of text that a participant reads, with values that the
 * interview fills in. Values show as pills; the Attribute menu (the toolbar
 * button, or typing `{`) offers what this place can show and the dynamic
 * attributes declared beside the text, whose pills open their settings. Text
 * of several lines can also contain logic blocks: content shown only in some
 * cases.
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
  assetBlocks,
  fields,
  message,
  onMessageChange,
  locale,
  site,
  showsProblems = true,
  className,
  commandsRef,
}: DynamicMessageEditorProps) {
  const intl = useAppIntl();
  const appDirection = useAppDirection();
  const { localization } = useEditingLanguage();
  const holdsAssetBlocks = assetBlocks !== undefined;
  const format = useMemo(
    (): MessageDocumentFormat => ({
      markdown,
      singleLine,
      assetBlocks: holdsAssetBlocks,
    }),
    [markdown, singleLine, holdsAssetBlocks],
  );
  const multiLine = markdown && !singleLine;
  const { context } = site;
  const conditionValues = site.conditions?.values ?? NOTHING;
  const dynamicAttributes = site.dynamicAttributes?.values ?? NOTHING;
  const setConditions = readOnly ? undefined : site.conditions?.set;
  const setDynamicAttributes = readOnly
    ? undefined
    : site.dynamicAttributes?.set;
  const subject = site.conditions?.subject;
  const codebook = site.conditions?.codebook;
  const aboutChoices = conditionAboutChoices(context, subject);
  const allowEgoRules =
    site.conditions?.allowEgoRules === true && context.roles.has('ego');
  // An “If” can be written where conditions can be, and where there is
  // something for its rules to be about.
  const writesConditions =
    setConditions !== undefined && (aboutChoices.length > 0 || allowEgoRules);
  const [pendingLogicBlock, setPendingLogicBlock] =
    useState<HTMLElement | null>(null);
  const [openPill, setOpenPill] = useState<OpenPill | null>(null);
  // The editor's commands, for a pill's settings, which stand outside the
  // editor and can take the pill out of the text: the host's ref, if it
  // asks for them too.
  const ownCommands = useRef<RichTextCommands | null>(null);
  const commands = commandsRef ?? ownCommands;

  const logicBlocks = useLogicBlocks();

  const labelText = (label: unknown): string =>
    label === undefined
      ? ''
      : resolveTranslation(label, localization, locale).text;
  const naming = namingFor(intl, {
    context,
    codebook,
    conditions: conditionValues,
    dynamicAttributes: dynamicAttributes,
    labelText,
    wordingOf: (wording) =>
      resolveStoredTranslation(wording, localization, locale),
    interfaceLanguage: { lang: intl.locale, dir: appDirection },
  });
  const choices = dynamicValueChoices(context);
  const scope: ConditionScope = {
    aboutChoices,
    codebook,
    subject,
    allowEgoRules,
  };
  const sentenceOf = (condition: ConditionDraft): string =>
    conditionSentence(condition, {
      codebook: conditionCodebook(
        codebook,
        subject,
        condition.about ?? aboutChoices[0],
        allowEgoRules,
      ),
      intl,
      localization,
      locale,
    });

  const environment: DynamicTextEnvironment = {
    owner: site.owner ?? 'stage',
    locale,
    defaultLocale: localization?.defaultLocale ?? locale,
    naming,
    choices,
    conditions: {
      values: conditionValues,
      ...(setConditions !== undefined && { set: setConditions }),
      scope,
      writes: writesConditions,
    },
    dynamicAttributes: {
      values: dynamicAttributes,
      ...(setDynamicAttributes !== undefined && { set: setDynamicAttributes }),
      usageCount: site.dynamicAttributeUsage ?? ONE_PLACE,
    },
    isForm: fields !== undefined,
    ...(fields !== undefined && {
      formFieldVariable: (fieldId: string) =>
        fields.fieldText(fieldId)?.variable,
    }),
    editable: !readOnly && disabled !== true,
    labelText,
    sentenceOf,
    conditionSentence: (conditionId) =>
      sentenceOf(
        asConditionDraft(
          Object.hasOwn(conditionValues, conditionId)
            ? conditionValues[conditionId]
            : undefined,
        ),
      ),
    pendingLogicBlock,
    setPendingLogicBlock,
  };

  // What every pill says, so a renamed attribute, a changed dynamic attribute
  // or another language redraws the pills of a document already open. Worked
  // out again only when one of those changes, not on every keystroke.
  const pillLabelsKey = useMemo(
    () =>
      JSON.stringify([
        locale,
        intl.locale,
        appDirection,
        choices.map((choice) => [
          choice.name,
          presentationalTextValue(naming.valueLabel(choice)),
        ]),
        dynamicAttributes,
      ]),
    [locale, intl.locale, appDirection, choices, naming, dynamicAttributes],
  );
  const pillsKey = JSON.stringify([
    pillLabelsKey,
    message === '' ? [] : dynamicValueNamesIn(message),
  ]);

  const inlineValues: RichTextInlineValues = {
    spec: (valueName) =>
      variablePillSpec({
        ...naming.pillFor(valueName),
        size: 'inline',
        describeKind: true,
      }),
    text: (valueName) => naming.pillFor(valueName).name,
    version: pillsKey,
    onActivate: (valueName, element) => {
      const parsed = parseDynamicValueName(valueName);
      if (parsed?.kind !== 'dynamicAttribute') return;
      setOpenPill({ id: parsed.id, element });
    },
    written: choices
      .filter((choice: DynamicValueChoice) => !isFlagChoice(choice))
      .map((choice) => ({ id: choice.name, text: `{${choice.name}}` })),
  };

  const opened = useMessageDocument({
    text: message,
    // The fields' text is read as the document opens; the message decides it.
    openKey: `${markdown}:${singleLine}:${holdsAssetBlocks}:${fields?.blocks.text ?? ''}`,
    open: (text) =>
      messageToDocument(text, format, {
        ...(fields !== undefined && {
          fieldText: fields.fieldText,
          fieldBlockText: fields.blocks.text ?? 'editable',
        }),
      }),
    write: (next) => {
      const written = documentToMessage(next, format);
      fields?.onFieldTextsChange?.(written.fieldTexts);
      return written.message;
    },
    // A condition or a dynamic attribute that the text no longer uses stays
    // with its owner until the owner is saved (`withoutUnusedTextDefinitions`),
    // so logic cut from one text and pasted into another, or brought back by
    // an undo, keeps its rules.
    onWrite: onMessageChange,
  });

  const problem = useMemo(() => {
    if (!showsProblems || message === '') return undefined;
    return findSiteMessageProblem(message, context, locale);
  }, [showsProblems, message, context, locale]);

  if (opened.problem !== undefined) {
    return (
      <div className="flex flex-col gap-2" data-unreadable-text={name}>
        <p className="text-destructive text-sm">
          {intl.formatMessage(messages.unreadable)}
        </p>
        <pre className="text-sm break-words whitespace-pre-wrap">{message}</pre>
      </div>
    );
  }

  const insertLogicBlock = () => {
    const option = firstAvailableLogicOption(intl, {
      writesConditions,
      choices,
    });
    if (option === undefined) return;
    const written: Record<string, ConditionDraft> = {};
    const empty: LogicBlockState = {
      option,
      conditionVersions: [],
      value: undefined,
      answerKeys: [],
    };
    const state = logicBlockWithOption(empty, option, choices, (when) => {
      const added = newConditionVersion(when);
      written[added.conditionVersion.conditionId] = added.condition;
      return added.conditionVersion;
    });
    const { meta, branches } = logicBlockOf(state, locale);
    const element = commands.current?.insertLogicBlock(meta, branches) ?? null;
    // The text is changed first and the stage after it, as the field hands
    // the editor its own document back only while it writes the message.
    if (Object.keys(written).length > 0) {
      setConditions?.({ ...conditionValues, ...written });
    }
    setPendingLogicBlock(element);
  };

  const renderInsertTools = (insert: RichTextInsertState) => (
    <>
      <AttributeMenu insert={insert} />
      {fields?.insertTool(insert)}
      {multiLine && (
        <ToolbarButton
          className={toolbarLabelledButtonStyles}
          disabled={
            !insert.canInsertSections ||
            firstAvailableLogicOption(intl, { writesConditions, choices }) ===
              undefined
          }
          onClick={insertLogicBlock}
        >
          <Split aria-hidden className="rotate-90" />
          {intl.formatMessage(messages.logicBlock)}
        </ToolbarButton>
      )}
    </>
  );

  // What the toolbar calls the group of these tools, by what it contains.
  const insertToolsLabel =
    INSERT_TOOLS_LABELS[fields === undefined ? 'text' : 'form'][
      multiLine ? 'multiLine' : 'singleLine'
    ];

  const toolbarOptions = markdown
    ? richTextToolbarFor(singleLine)
    : PLAIN_TEXT_TOOLBAR;

  return (
    <DynamicTextEnvironmentContext value={environment}>
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
          singleLine={singleLine}
          changeMode="input"
          toolbarOptions={toolbarOptions}
          inlineValues={inlineValues}
          insertTools={{ label: insertToolsLabel, render: renderInsertTools }}
          {...(multiLine && { logicBlocks })}
          {...(fields !== undefined && { fieldBlocks: fields.blocks })}
          {...(assetBlocks !== undefined && { assetBlocks })}
          value={opened.content ?? EMPTY_DOCUMENT}
          onChange={opened.onDocumentChange}
          className={className}
          commandsRef={commands}
        />
        {problem !== undefined && (
          <output aria-live="polite" className="text-destructive block text-sm">
            {problem}
          </output>
        )}
        {openPill !== null && (
          <DynamicAttributePopover
            id={openPill.id}
            anchor={openPill.element}
            onClose={() => setOpenPill(null)}
            onRemove={() => {
              setOpenPill(null);
              // Every use of it in this wording, not only the pill that was
              // clicked, as one edit: the wording no longer shows it anywhere.
              commands.current?.removeInlineValues(
                dynamicAttributeName(openPill.id),
              );
            }}
          />
        )}
      </div>
    </DynamicTextEnvironmentContext>
  );
}
