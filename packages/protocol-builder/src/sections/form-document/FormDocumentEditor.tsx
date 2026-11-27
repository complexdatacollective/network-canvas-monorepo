import { TextCursorInput } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  type RichTextAssetBlocks,
  type RichTextCommands,
  type RichTextFieldBlocks,
  type RichTextInsertState,
  ToolbarButton,
  toolbarLabelledButtonStyles,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import {
  createProtocolObjectId,
  type InterfaceText,
  type LocaleTag,
  type LocalizedString,
  type Variables,
} from '@codaco/protocol-validation';

import { DynamicMessageEditor } from '../../fields/dynamicText/DynamicMessageEditor.tsx';
import type { DynamicMessageSite } from '../../fields/dynamicText/messageSite.ts';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import {
  type FieldText,
  fieldBlockNodeOf,
} from '../../localization/messageDocument.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../protocol-context.ts';
import { useLatest } from '../../state/useLatest.ts';
import {
  StageFieldBlockView,
  TranslationFieldBlockView,
} from './FieldBlockView.tsx';
import type { FieldCodebookWrites } from './fieldCodebookWrites.ts';
import { FieldInsertPicker } from './FieldInsertPicker.tsx';
import {
  type FieldBlockHandle,
  type FieldErrorSeam,
  type FieldPickerTarget,
  type FormAttributeRules,
  type FormDocumentEditingEnvironment,
  type FormDocumentEnvironment,
  FormDocumentEnvironmentContext,
} from './formDocumentEnvironment.ts';
import { formDocumentMessages as messages } from './formDocumentMessages.ts';
import { fieldTextFor, type FormFieldDraft } from './formDocumentValue.ts';

/**
 * The Field button of the editor's toolbar, which puts in a field without an
 * attribute and opens the attribute list beside the button.
 */
function FieldToolbarButton({
  insert,
  onInsert,
}: Readonly<{
  insert: RichTextInsertState;
  onInsert: (commands: RichTextCommands, button: HTMLElement) => void;
}>) {
  const intl = useAppIntl();
  return (
    <ToolbarButton
      className={toolbarLabelledButtonStyles}
      disabled={!insert.canInsertSections}
      onClick={(event) => onInsert(insert.commands, event.currentTarget)}
      data-insert-field=""
    >
      <TextCursorInput aria-hidden />
      {intl.formatMessage(messages.fieldButton)}
    </ToolbarButton>
  );
}

/**
 * What a stage editor adds to the form's editor: the questions and hints of
 * the fields, typed in their blocks, their settings, which write to the
 * stage's codebook, and new attributes.
 */
export type FormDocumentStageEditing = Readonly<{
  /**
   * The question, hint and settings of each field that the document places,
   * each time it changes, before `onMessageChange`.
   */
  onFieldTextsChange: (fieldTexts: ReadonlyMap<string, FieldText>) => void;
  subject: CodebookSubject | undefined;
  protocolContext: ProtocolBuilderProtocolContext;
  stageId: string;
  rules: FormAttributeRules;
  writes: FieldCodebookWrites;
  /**
   * Told when the researcher puts in a new field, and when a new field
   * becomes a field that the form already has: it is being put in.
   */
  onFieldStarted: (fieldId: string) => void;
  /** See `FormDocumentStageEnvironment.fieldsIssue`. */
  fieldsIssue?: Readonly<{ fieldId: string; seam: FieldErrorSeam }>;
  /**
   * A field to select as soon as its block is drawn, such as one with a
   * problem in a language that the editor has just switched to.
   */
  reveal?: Readonly<{ fieldId: string; done: () => void }>;
}>;

/**
 * Where the form is written: in a stage editor, with what it adds, or in the
 * translation table, where only the text is translated. There each field's
 * question and hint are shown, and translated in rows of their own: the
 * field blocks contain no text, and only the form's own fields can be put
 * in.
 */
export type FormDocumentEditing =
  | (Readonly<{ kind: 'stage' }> & FormDocumentStageEditing)
  | Readonly<{ kind: 'translation' }>;

type FormDocumentEditorProps = Readonly<{
  id: string;
  name: string;
  ariaDescribedBy: string;
  ariaLabelledBy?: string;
  ariaInvalid: boolean;
  ariaRequired: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** The editor can be changed: not disabled, and not read-only. */
  editable: boolean;
  /** Classes for the editor's own frame, which holds its text and toolbar. */
  className?: string;
  /** The document of the language being edited. */
  message: string;
  onMessageChange: (message: string | undefined) => void;
  /** The form's documents in every language. */
  content: LocalizedString;
  /** The form's fields in every language. */
  fields: readonly FormFieldDraft[];
  locale: LocaleTag;
  localization: ProtocolLocalization | undefined;
  interfaceText: InterfaceText | undefined;
  site: DynamicMessageSite;
  showsProblems: boolean;
  assetBlocks?: RichTextAssetBlocks;
  /** The attributes of the form's subject. */
  variables: Readonly<Variables>;
  editing: FormDocumentEditing;
}>;

const TRANSLATION: FormDocumentEditingEnvironment = { kind: 'translation' };

/**
 * The text editor of one language's document of a form, with the form's
 * fields as blocks in it, the Field button, and the attribute list of a new
 * field. Used by the stage editor (`FormDocumentField`), where the fields'
 * questions and hints are typed in their blocks and their settings open
 * beside them, and by the translation table, where only the text is
 * translated.
 */
export function FormDocumentEditor({
  id,
  name,
  ariaDescribedBy,
  ariaLabelledBy,
  ariaInvalid,
  ariaRequired,
  placeholder,
  autoFocus,
  editable,
  className,
  message,
  onMessageChange,
  content,
  fields,
  locale,
  localization,
  interfaceText,
  site,
  showsProblems,
  assetBlocks,
  variables,
  editing,
}: FormDocumentEditorProps) {
  const stage = editing.kind === 'stage' ? editing : undefined;
  const latestStage = useLatest(stage);
  const intl = useAppIntl();
  const latestFields = useLatest(fields);

  // The blocks drawn now, so the attribute list can finish the one it was
  // opened for.
  const blocks = useRef(new Map<string, FieldBlockHandle>());
  const registerBlock = useCallback(
    (fieldId: string, handle: FieldBlockHandle) => {
      blocks.current.set(fieldId, handle);
      const reveal = latestStage()?.reveal;
      if (reveal?.fieldId === fieldId) {
        // Once the editor has drawn the rest of the document too.
        queueMicrotask(() => {
          handle.select();
          reveal.done();
        });
      }
      return () => {
        if (blocks.current.get(fieldId) === handle) {
          blocks.current.delete(fieldId);
        }
      };
    },
    [latestStage],
  );
  const [picker, setPicker] = useState<FieldPickerTarget | null>(null);
  // The editor's commands, for giving the keyboard back once a picker shuts
  // and for putting a field's own block in.
  const commands = useRef<RichTextCommands | null>(null);

  const startField = useCallback(
    (fieldId: string) => latestStage()?.onFieldStarted(fieldId),
    [latestStage],
  );

  // A block that becomes a field the form already has takes that field's
  // question and hint in this language with it, as the block of a field
  // does when the document opens: replaced by the field's own block, as
  // one edit, while it is still empty. In the translation table the block
  // contains no text: it shows the field's question from its row, and only
  // takes the field's id.
  const latestLocale = useLatest(locale);
  const blocksHaveText = stage !== undefined;
  const takeField = useCallback(
    (handle: FieldBlockHandle, fieldId: string, variable: string) => {
      const text = fieldTextFor(latestFields(), latestLocale())(fieldId);
      const hasText = text?.prompt !== undefined || text?.hint !== undefined;
      const replacement =
        !blocksHaveText || text === undefined || !hasText || !handle.isEmpty()
          ? undefined
          : fieldBlockNodeOf(fieldId, { ...text, variable });
      if (replacement === undefined || commands.current === null) {
        handle.update({ variable, fieldId });
        return;
      }
      handle.select();
      commands.current.insertContent(replacement);
    },
    [blocksHaveText, latestFields, latestLocale],
  );

  // What the views read of where the form is written: the stage editor's
  // part changes only with what the stage gives.
  const subject = stage?.subject;
  const protocolContext = stage?.protocolContext;
  const stageId = stage?.stageId;
  const rules = stage?.rules;
  const writes = stage?.writes;
  const fieldsIssue = stage?.fieldsIssue;
  const editingEnvironment = useMemo(
    (): FormDocumentEditingEnvironment =>
      protocolContext === undefined ||
      stageId === undefined ||
      rules === undefined ||
      writes === undefined
        ? TRANSLATION
        : {
            kind: 'stage',
            subject,
            protocolContext,
            stageId,
            rules,
            writes,
            fieldsIssue,
          },
    [fieldsIssue, protocolContext, rules, stageId, subject, writes],
  );

  const environment = useMemo(
    (): FormDocumentEnvironment => ({
      variables,
      localization,
      locale,
      interfaceText,
      fields,
      content,
      editable,
      registerBlock,
      openPicker: setPicker,
      startField,
      takeField,
      site,
      editing: editingEnvironment,
    }),
    [
      content,
      editable,
      editingEnvironment,
      fields,
      interfaceText,
      locale,
      localization,
      registerBlock,
      site,
      startField,
      takeField,
      variables,
    ],
  );

  const onInsert: RichTextFieldBlocks['onInsert'] = ({ fieldId, element }) => {
    if (element === null) return;
    startField(fieldId);
    setPicker({ fieldId, anchor: element, origin: 'block' });
  };
  // The Field button and Mod-Shift-F put in a field without an attribute,
  // whose attribute list opens beside the button, or beside the new block.
  const insertField = (into: RichTextCommands, button: HTMLElement) => {
    const fieldId = createProtocolObjectId();
    const block = into.insertFieldBlock({ fieldId, variable: '' });
    if (block === null) return;
    startField(fieldId);
    setPicker({ fieldId, anchor: button, origin: 'toolbar' });
  };
  const fieldInsertTool = (insert: RichTextInsertState) => (
    <FieldToolbarButton insert={insert} onInsert={insertField} />
  );

  const fieldBlocks: RichTextFieldBlocks =
    stage === undefined
      ? {
          // Each field's question and hint are rows of the table of their
          // own, and the block shows them as they read there.
          View: TranslationFieldBlockView,
          text: 'none',
          createId: createProtocolObjectId,
          onInsert,
          labelPlaceholder: '',
          hintPlaceholder: '',
        }
      : {
          View: StageFieldBlockView,
          text: 'editable',
          // A field pasted from the translation table, whose blocks contain
          // no text, takes its question and hint in this language.
          textOf: (fieldId) => {
            const text = fieldTextFor(latestFields(), latestLocale())(fieldId);
            return text === undefined ||
              (text.prompt === undefined && text.hint === undefined)
              ? undefined
              : fieldBlockNodeOf(fieldId, text)?.content;
          },
          createId: createProtocolObjectId,
          onInsert,
          labelPlaceholder: intl.formatMessage(messages.questionPlaceholder),
          hintPlaceholder: intl.formatMessage(messages.hintPlaceholder),
        };

  const closePicker = () => {
    setPicker(null);
    commands.current?.focus();
  };

  return (
    <FormDocumentEnvironmentContext value={environment}>
      <DynamicMessageEditor
        id={id}
        name={name}
        ariaDescribedBy={ariaDescribedBy}
        ariaLabelledBy={ariaLabelledBy}
        ariaInvalid={ariaInvalid}
        ariaRequired={ariaRequired}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={!editable}
        markdown
        singleLine={false}
        {...(assetBlocks !== undefined && { assetBlocks })}
        fields={{
          blocks: fieldBlocks,
          fieldText: fieldTextFor(fields, locale),
          ...(stage !== undefined && {
            onFieldTextsChange: (fieldTexts) =>
              latestStage()?.onFieldTextsChange(fieldTexts),
          }),
          insertTool: fieldInsertTool,
        }}
        commandsRef={commands}
        message={message}
        onMessageChange={onMessageChange}
        locale={locale}
        site={site}
        showsProblems={showsProblems}
        className={className}
      />
      {picker !== null && (
        <FieldInsertPicker
          key={picker.fieldId}
          target={picker}
          block={() => blocks.current.get(picker.fieldId)}
          onClose={closePicker}
        />
      )}
    </FormDocumentEnvironmentContext>
  );
}
