'use client';

import {
  type AnyExtension,
  type Editor,
  mergeAttributes,
  Node as TiptapNode,
} from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
  EditorContent,
  type JSONContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  useEditor,
} from '@tiptap/react';
import { isEqual } from 'es-toolkit';
import { createContext, useContext, useEffect, useRef } from 'react';

import { cx } from '../../../utils/cva';

/**
 * One version of a piece of text: what it reads in one case, such as when a
 * name is missing. `key` is what the consumer records the case as; `label`
 * says which case it is, on screen and to a screen reader. `content` is the
 * version's own line of text, as the inline nodes of a paragraph.
 */
export type RichTextVersion = Readonly<{
  key: string;
  label: string;
  content: readonly JSONContent[];
}>;

/**
 * Text that reads differently in different cases, held in the line as one
 * element: `{ type: 'versions', attrs: { label, versions } }`. `label` says
 * what the versions depend on. The editor does not know what the cases mean;
 * the consumer that builds the element does.
 */
export type RichTextVersionsAttributes = Readonly<{
  label: string;
  versions: readonly RichTextVersion[];
  /** Whatever the consumer needs to read the element back; kept as given. */
  meta?: unknown;
}>;

export const VERSIONS_NODE = 'versions';

/**
 * What a version's own editor is built from, supplied by the field that holds
 * the versions: the same placeholders, formatting and versions as the field,
 * on one line.
 */
type NestedEditing = Readonly<{
  extensions: AnyExtension[];
  editable: boolean;
  /** Told which editor has the caret, so the toolbar acts on it. */
  onFocusEditor: (editor: Editor) => void;
}>;

export const NestedEditingContext = createContext<NestedEditing | null>(null);

const versionsAttributesOf = (
  attrs: Record<string, unknown>,
): RichTextVersionsAttributes => ({
  label: typeof attrs.label === 'string' ? attrs.label : '',
  versions: Array.isArray(attrs.versions)
    ? (attrs.versions as RichTextVersion[])
    : [],
});

const lineOf = (content: readonly JSONContent[]): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      ...(content.length > 0 && { content: [...content] }),
    },
  ],
});

const contentOf = (doc: JSONContent): JSONContent[] =>
  doc.content?.[0]?.content ?? [];

const versionClasses = cx(
  'inline-flex max-w-full items-baseline gap-1 rounded-sm',
);

const versionLabelClasses = cx(
  'shrink-0 text-xs font-semibold text-current/70 select-none',
);

const versionEditorClasses = cx(
  'inline-block min-w-8 rounded-sm bg-current/5 px-1',
  'focus-within:outline-primary focus-within:outline-2',
  '[&_.tiptap]:outline-none [&_.tiptap_p]:inline',
);

/**
 * One version's line, edited in place by an editor of its own. A version
 * keeps its own undo history while the caret is in it. Escape hands the caret
 * back to the line around the versions, with the versions selected.
 */
function VersionEditor({
  version,
  onChange,
  onEscape,
}: {
  version: RichTextVersion;
  onChange: (content: JSONContent[]) => void;
  onEscape: () => void;
}) {
  const nested = useContext(NestedEditingContext);
  const onChangeRef = useRef(onChange);
  const onEscapeRef = useRef(onEscape);
  onChangeRef.current = onChange;
  onEscapeRef.current = onEscape;

  const editor = useEditor(
    {
      extensions: nested?.extensions ?? [],
      content: lineOf(version.content),
      editable: nested?.editable ?? false,
      editorProps: {
        attributes: {
          'role': 'textbox',
          'aria-multiline': 'false',
          'aria-label': version.label,
          'data-version': version.key,
        },
        handleKeyDown: (_view, event) => {
          if (event.key !== 'Escape') return false;
          event.preventDefault();
          onEscapeRef.current();
          return true;
        },
      },
      onUpdate: ({ editor: updated }) => {
        onChangeRef.current(contentOf(updated.getJSON()));
      },
      onFocus: ({ editor: focused }) => {
        nested?.onFocusEditor(focused);
      },
    },
    [nested?.extensions],
  );

  // The outer document is the record: an undo there, or a value replaced by
  // the host, reaches this version through its attributes.
  useEffect(() => {
    if (!editor || editor.isDestroyed || editor.isFocused) return;
    if (!isEqual(contentOf(editor.getJSON()), version.content)) {
      editor.commands.setContent(lineOf(version.content), {
        emitUpdate: false,
      });
    }
  }, [editor, version.content]);

  useEffect(() => {
    editor?.setEditable(nested?.editable ?? false, false);
  }, [editor, nested?.editable]);

  useEffect(() => {
    editor?.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          'role': 'textbox',
          'aria-multiline': 'false',
          'aria-label': version.label,
          'data-version': version.key,
        },
      },
    });
  }, [editor, version.key, version.label]);

  return (
    <span className={versionClasses}>
      <span aria-hidden className={versionLabelClasses}>
        {version.label}
      </span>
      <EditorContent editor={editor} className={versionEditorClasses} />
    </span>
  );
}

function VersionsView({
  node,
  editor,
  getPos,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const attributes = versionsAttributesOf(node.attrs);
  const latest = useRef(attributes);
  latest.current = attributes;

  const selectSelf = () => {
    const position = getPos();
    if (typeof position !== 'number') return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setSelection(NodeSelection.create(tr.doc, position));
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper
      as="span"
      role="group"
      aria-label={attributes.label}
      data-versions-element=""
      data-selected={selected || undefined}
      className={cx(
        'mx-0.5 inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1',
        'rounded-sm border border-dashed border-current/40 px-1 py-px',
        'data-selected:outline-primary data-selected:outline-2',
      )}
    >
      {attributes.versions.map((version, index) => (
        <VersionEditor
          key={version.key}
          version={version}
          onEscape={selectSelf}
          onChange={(content) => {
            const current = latest.current;
            updateAttributes({
              versions: current.versions.map((existing, at) =>
                at === index ? { ...existing, content } : existing,
              ),
            });
          }}
        />
      ))}
    </NodeViewWrapper>
  );
}

// An event in one of the versions' own editors is that editor's to handle.
const isInVersionEditor = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest('[data-version]') !== null;

/**
 * Versions of a piece of text, held in the line as one element. The caret
 * steps over it in the line around it, and it is selected, moved, copied and
 * deleted whole. Each version is edited in place in an editor of its own:
 * Enter on the selected element, or Tab, moves into its versions, and Escape
 * moves back out.
 */
export const VersionsNode = TiptapNode.create({
  name: VERSIONS_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('aria-label') ?? '',
        renderHTML: (attributes) => ({ 'aria-label': attributes.label }),
      },
      meta: {
        default: null,
        parseHTML: (element) => {
          try {
            return JSON.parse(
              element.getAttribute('data-versions-meta') ?? 'null',
            ) as unknown;
          } catch {
            return null;
          }
        },
        renderHTML: (attributes) => ({
          'data-versions-meta': JSON.stringify(attributes.meta ?? null),
        }),
      },
      versions: {
        default: [],
        parseHTML: (element) => {
          try {
            const parsed: unknown = JSON.parse(
              element.getAttribute('data-versions') ?? '[]',
            );
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          'data-versions': JSON.stringify(attributes.versions ?? []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-versions]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { role: 'group' })];
  },

  renderText() {
    return '';
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (
          !(selection instanceof NodeSelection) ||
          selection.node.type.name !== VERSIONS_NODE
        ) {
          return false;
        }
        const dom = editor.view.nodeDOM(selection.from);
        const first =
          dom instanceof HTMLElement
            ? dom.querySelector<HTMLElement>('[role="textbox"]')
            : null;
        if (first === null) return false;
        first.focus();
        return true;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(VersionsView, {
      as: 'span',
      stopEvent: ({ event }) => isInVersionEditor(event),
      ignoreMutation: () => true,
    });
  },
});
