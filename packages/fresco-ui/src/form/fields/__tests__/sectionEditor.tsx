import { fireEvent, render, screen } from '@testing-library/react';
import { Editor, type TiptapEditorHTMLElement } from '@tiptap/core';
import type { JSONContent } from '@tiptap/react';
import {
  type ComponentProps,
  createContext,
  createRef,
  useContext,
} from 'react';
import { vi } from 'vitest';

import { inlineValuesFor } from '../../../testing/inlineValues';
import type { RichTextAssetBlockViewProps } from '../richText/assetBlockNode';
import { blockActionProps, BlockTab } from '../richText/blockFrames';
import type {
  RichTextFieldBlocks,
  RichTextFieldBlockViewProps,
} from '../richText/fieldBlockNode';
import type {
  RichTextCommands,
  RichTextInsertState,
} from '../richText/insertTools';
import type {
  RichTextLogicBlocks,
  RichTextLogicBlockViewProps,
  RichTextLogicBranchLabelProps,
} from '../richText/logicBlockNode';
import RichTextEditorField from '../RichTextEditor';

type FieldProps = ComponentProps<typeof RichTextEditorField>;

export const text = (words: string): JSONContent => ({
  type: 'text',
  text: words,
});

export const paragraph = (...content: JSONContent[]): JSONContent =>
  content.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content };

export const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});

/** A field block as the value holds it. */
export const field = (
  fieldId: string,
  variable: string,
  label = '',
  hint = '',
): JSONContent => ({
  type: 'fieldBlock',
  attrs: { fieldId, variable, showValidationHints: false },
  content: [
    label === ''
      ? { type: 'fieldLabel' }
      : { type: 'fieldLabel', content: [text(label)] },
    hint === ''
      ? { type: 'fieldHint' }
      : { type: 'fieldHint', content: [text(hint)] },
  ],
});

export const branch = (
  key: string,
  ...content: JSONContent[]
): JSONContent => ({
  type: 'logicBranch',
  attrs: { key, meta: null },
  content: content.length === 0 ? [paragraph()] : content,
});

export const logic = (meta: unknown, ...branches: JSONContent[]) => ({
  type: 'logicBlock',
  attrs: { meta },
  content: branches,
});

export const value = (id: string): JSONContent => ({
  type: 'inlineValue',
  attrs: { id },
});

/** What a field's settings button opens, told which field. */
const OpenSettings = createContext<(fieldId: string) => void>(() => undefined);

function FieldView({
  attributes,
  content,
  selected,
  empty,
}: RichTextFieldBlockViewProps) {
  const openSettings = useContext(OpenSettings);
  return (
    <div
      data-testid={`field-${attributes.fieldId}`}
      data-view-selected={String(selected)}
      data-view-empty={String(empty)}
    >
      {selected && (
        <BlockTab selected>
          <button
            type="button"
            {...blockActionProps}
            onClick={() => openSettings(attributes.fieldId)}
          >
            Field settings
          </button>
        </BlockTab>
      )}
      {content}
      <div data-testid="control">Answer here</div>
    </div>
  );
}

function LogicView({
  content,
  meta,
  fieldScope,
  branchesWithContent,
}: RichTextLogicBlockViewProps) {
  return (
    <div
      data-testid="logic"
      data-meta={JSON.stringify(meta)}
      data-field-scope={JSON.stringify(fieldScope())}
      data-branches-with-content={JSON.stringify(branchesWithContent())}
    >
      <div>Logic block</div>
      {content}
    </div>
  );
}

function AssetView({ attributes }: RichTextAssetBlockViewProps) {
  return <div data-testid="asset">{attributes.assetId}</div>;
}

function BranchLabel({ branch: { key } }: RichTextLogicBranchLabelProps) {
  return <span data-testid="branch-label">{key}</span>;
}

const hasEditor = (element: HTMLElement): element is TiptapEditorHTMLElement =>
  'editor' in element && element.editor instanceof Editor;

/** The TipTap editor behind an editor's text box. */
const editorOf = (element: HTMLElement): Editor => {
  if (!hasEditor(element) || element.editor === undefined) {
    throw new Error('not a rich text editor');
  }
  return element.editor;
};

/**
 * A multi-line field labelled "Content" that holds fields, logic blocks and
 * inline values, saying every change as it is made. New fields are numbered
 * `new-1`, `new-2`…
 */
export const renderSections = ({
  fieldBlocks: fieldBlocksProp,
  logicBlocks: logicBlocksProp,
  ...props
}: Omit<Partial<FieldProps>, 'fieldBlocks' | 'logicBlocks'> & {
  fieldBlocks?: Partial<RichTextFieldBlocks> | null;
  logicBlocks?: Partial<RichTextLogicBlocks> | null;
} = {}) => {
  const onChange = vi.fn<(value: JSONContent | undefined) => void>();
  const onInsert = vi.fn<RichTextFieldBlocks['onInsert']>();
  // Told when a field's settings button is pressed, as Enter on a selected
  // field presses it.
  const onActivate = vi.fn<(fieldId: string) => void>();
  let created = 0;
  let insert: RichTextInsertState | undefined;
  const commandsRef = createRef<RichTextCommands>();
  const fieldBlocks: RichTextFieldBlocks | undefined =
    fieldBlocksProp === null
      ? undefined
      : {
          View: FieldView,
          createId: () => {
            created += 1;
            return `new-${created}`;
          },
          onInsert,
          labelPlaceholder: 'Type the question',
          hintPlaceholder: 'Add a hint (optional)',
          ...fieldBlocksProp,
        };
  const logicBlocks: RichTextLogicBlocks | undefined =
    logicBlocksProp === null
      ? undefined
      : {
          View: LogicView,
          BranchLabel,
          emptyBranchText: 'Nothing is shown.',
          ...logicBlocksProp,
        };
  const element = (changed: Partial<FieldProps> = {}) => (
    <OpenSettings value={onActivate}>
      <RichTextEditorField
        id="content"
        name="content"
        aria-label="Content"
        changeMode="input"
        emojiMenu={false}
        value={doc(paragraph(text('Hello')))}
        onChange={onChange}
        inlineValues={inlineValuesFor({ name: 'Name', age: 'Age' })}
        fieldBlocks={fieldBlocks}
        logicBlocks={logicBlocks}
        assetBlocks={{ View: AssetView }}
        insertTools={{
          label: 'Insert',
          render: (given) => {
            insert = given;
            return null;
          },
        }}
        commandsRef={commandsRef}
        {...props}
        {...changed}
      />
    </OpenSettings>
  );
  const { rerender } = render(element());
  const textbox = () => screen.findByRole('textbox', { name: 'Content' });
  return {
    onChange,
    onInsert,
    onActivate,
    textbox,
    editor: async () => editorOf(await textbox()),
    /** What the insert tools were last drawn with. */
    insert: () => {
      if (insert === undefined) throw new Error('no insert tools drawn');
      return insert;
    },
    /** The field's commands (`commandsRef`). */
    commands: () => {
      if (commandsRef.current === null) throw new Error('no commands given');
      return commandsRef.current;
    },
    change: (changed: Partial<FieldProps>) => rerender(element(changed)),
  };
};

/** Presses a key in the editor, as ProseMirror hears it. */
export const press = (
  editor: Editor,
  key: string,
  modifiers: Readonly<{
    shift?: boolean;
    mod?: boolean;
  }> = {},
) => {
  fireEvent.keyDown(editor.view.dom, {
    key,
    shiftKey: modifiers.shift ?? false,
    // `Mod` is Control in jsdom, as `navigator.platform` is empty.
    ctrlKey: modifiers.mod ?? false,
  });
};

/** The document as JSON, without the attributes ProseMirror adds. */
export const json = (editor: Editor): JSONContent => editor.getJSON();

/**
 * Pastes `html` (and `plain`, its plain text) at the editor's selection, as
 * the browser's paste event delivers it. jsdom implements no `DataTransfer`,
 * and the handler only ever asks one for the flavours it was given.
 */
export const paste = (editor: Editor, html: string, plain = '') => {
  const data: Record<string, string> = {
    'text/html': html,
    'text/plain': plain,
  };
  fireEvent.paste(editor.view.dom, {
    clipboardData: {
      getData: (type: string) => data[type] ?? '',
      types: Object.keys(data),
      files: [],
      items: [],
    },
  });
};

/** The whole document as the editor would put it on the clipboard. */
export const copyAll = (editor: Editor): string => {
  const { dom } = editor.view.serializeForClipboard(
    editor.state.doc.slice(0, editor.state.doc.content.size),
  );
  return dom.innerHTML;
};
