'use client';

import {
  type AnyExtension,
  type Editor,
  getSchema,
  mergeAttributes,
  Node as TiptapNode,
} from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin } from '@tiptap/pm/state';
import {
  EditorContent,
  type JSONContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from '@tiptap/react';
import { isEqual } from 'es-toolkit';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { TokenPillContent, tokenPillClasses } from '../../../TokenPill';
import { cx } from '../../../utils/cva';
import { contentInSchema, readableContent } from './fitToSchema';

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
  /**
   * What the element shows while folded, as a pill: the name of what the
   * versions depend on, such as “First name”. `label` when not given.
   */
  summary?: string;
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
  /**
   * Whether the researcher is working in the field. An open element folds
   * back to its pill when they leave it.
   */
  active?: boolean;
  /**
   * Whether the versions of a message that is nothing but one set of versions
   * stay open: the field is then those versions, and a pill hiding all of its
   * words would be a field that shows nothing at rest. Versions inside a
   * sentence, or inside another version, still fold to a pill.
   */
  openWholeMessage?: boolean;
}>;

export const NestedEditingContext = createContext<NestedEditing | null>(null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Something that names a node type. Whether the editor has that type, and
 * whether the node has the shape its type needs, is checked by the version's
 * editor, which knows its schema.
 */
const isTypedNode = (value: unknown): value is JSONContent =>
  isRecord(value) && typeof value.type === 'string';

/**
 * The well-formed versions in a stored or pasted value. Anything can arrive
 * there (a hand-edited document, a paste from elsewhere), so a member without
 * a text key and label and a list of content is dropped, as unreadable JSON
 * is, and a version keeps only the content that names a node type. Its
 * editor then drops a node it has no type for, or whose shape it refuses.
 */
export const versionsIn = (value: unknown): RichTextVersion[] =>
  Array.isArray(value)
    ? value.flatMap((version: unknown) =>
        isRecord(version) &&
        typeof version.key === 'string' &&
        typeof version.label === 'string' &&
        Array.isArray(version.content)
          ? [
              {
                key: version.key,
                label: version.label,
                content: version.content.filter(isTypedNode),
              },
            ]
          : [],
      )
    : [];

const versionsAttributesOf = (
  attrs: Record<string, unknown>,
): RichTextVersionsAttributes => ({
  label: typeof attrs.label === 'string' ? attrs.label : '',
  ...(typeof attrs.summary === 'string' &&
    attrs.summary !== '' && { summary: attrs.summary }),
  versions: versionsIn(attrs.versions),
});

/**
 * Whether `doc` is one line holding a single set of versions and nothing but
 * whitespace around it: the field's whole message is that one switch.
 */
const isWholeMessageVersions = (doc: ProseMirrorNode): boolean => {
  if (doc.childCount !== 1) return false;
  const line = doc.child(0);
  let sets = 0;
  let other = false;
  line.forEach((child) => {
    if (child.type.name === VERSIONS_NODE) sets += 1;
    else if (!(child.isText && (child.text ?? '').trim() === '')) other = true;
  });
  return sets === 1 && !other;
};

/** Asks an element's view to open, from the line's keyboard handling. */
const EXPAND_EVENT = 'versions:expand';
/** Asks an element's view to fold back to its pill. */
const COLLAPSE_EVENT = 'versions:collapse';

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

// Each version is a row of the open element's grid: its label, then its
// line. The row itself draws nothing, so the labels line up in one column.
const versionClasses = cx('contents');

// Rows line up at their tops rather than their baselines: a version's line is
// an inline block, whose baseline is its last line, and WebKit sizes a row
// aligned on that baseline as if the version were one line tall, so a version
// that wraps grew up out of the box. The label keeps the version's font for
// its own line, padded as the version's is, so its smaller words still sit on
// the baseline of the version's first line.
// In a field too narrow for the label beside a line of words, the label sits
// above its line instead (see the grid's own classes).
const versionLabelClasses = cx('py-1 select-none @max-sm/rich-text:pb-0');

const versionLabelTextClasses = cx('text-xs font-semibold text-current/70');

// A version is one line, as tall as its words. Its paragraph is an inline
// block rather than inline: ProseMirror ends a paragraph that is empty, or
// that ends in a value, with a line break, and in an inline paragraph that
// break starts a second, empty line, which doubled the version's height.
// The line is at least wide enough for a value and a few words, and its
// padding and the room after its last value belong to the editor, so a click
// anywhere in the box puts the caret in the line.
// An empty version shows a muted hint that it shows nothing; the hint is
// drawn by the placeholder, never written into the version.
const versionEditorClasses = cx(
  'block min-w-48 rounded-sm bg-current/5',
  'focus-within:outline-primary focus-within:outline-2',
  '[&_.tiptap]:cursor-text [&_.tiptap]:px-2 [&_.tiptap]:py-1 [&_.tiptap]:outline-none',
  '[&_.tiptap_p]:inline-block [&_.tiptap_p]:min-w-full [&_.tiptap_p]:pr-4',
  '[&_.tiptap_p.is-editor-empty::before]:content-[attr(data-placeholder)]',
  '[&_.tiptap_p.is-editor-empty::before]:pointer-events-none',
  '[&_.tiptap_p.is-editor-empty::before]:float-left',
  '[&_.tiptap_p.is-editor-empty::before]:h-0',
  '[&_.tiptap_p.is-editor-empty::before]:font-normal',
  '[&_.tiptap_p.is-editor-empty::before]:italic',
  '[&_.tiptap_p.is-editor-empty::before]:text-current/50',
);

/**
 * One version's line, edited in place by an editor of its own. It keeps no
 * history of its own: each edit is an edit of the line around it, undone and
 * redone there, from either editor. Escape hands the caret back to the line
 * around the versions, with the versions selected.
 */
function VersionEditor({
  version,
  onChange,
  onEscape,
  onStep,
  onEditor,
}: {
  version: RichTextVersion;
  onChange: (content: JSONContent[]) => void;
  onEscape: () => void;
  /**
   * Moves the caret to the version above (-1) or below (1), when the element
   * lists its versions permanently; returns whether it moved. Undefined where
   * the arrow keys are left to the line around the versions.
   */
  onStep?: (delta: -1 | 1) => boolean;
  /** Hands the element this version's editor, and takes it back on unmount. */
  onEditor: (editor: Editor | null) => void;
}) {
  const nested = useContext(NestedEditingContext);
  // The content this editor last wrote into the line, to tell its own edit
  // coming back from a change made in the line, such as an undo.
  const writtenRef = useRef<readonly JSONContent[] | null>(null);
  const onChangeRef = useRef(onChange);
  const onEscapeRef = useRef(onEscape);
  const onStepRef = useRef(onStep);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onEscapeRef.current = onEscape;
    onStepRef.current = onStep;
  });

  const extensions = nested?.extensions;
  const schema = useMemo(
    () =>
      extensions !== undefined && extensions.length > 0
        ? getSchema(extensions)
        : undefined,
    [extensions],
  );
  // A version can arrive holding a mark the field does not offer (a link,
  // loaded into a single-line field or pasted from a multi-line one); its
  // editor keeps the words without it rather than starting empty.
  const content = useMemo(
    () =>
      schema === undefined
        ? version.content
        : readableContent(contentInSchema(version.content, schema), schema),
    [version.content, schema],
  );

  const editor = useEditor(
    {
      extensions: nested?.extensions ?? [],
      content: lineOf(content),
      editable: nested?.editable ?? false,
      editorProps: {
        attributes: {
          'role': 'textbox',
          'aria-multiline': 'false',
          'aria-label': version.label,
          'data-version': version.key,
        },
        handleKeyDown: (view, event) => {
          if (
            (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
            onStepRef.current !== undefined &&
            !event.shiftKey &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey
          ) {
            // Only from the line's first or last position, so a version that
            // wraps is still walked a line at a time.
            const { selection, doc } = view.state;
            const up = event.key === 'ArrowUp';
            const atEdge =
              selection.empty &&
              selection.head === (up ? 1 : doc.content.size - 1);
            if (atEdge && onStepRef.current(up ? -1 : 1)) {
              event.preventDefault();
              return true;
            }
            return false;
          }
          if (event.key !== 'Escape') return false;
          event.preventDefault();
          // Escape is spent here: a dialog around the text must not also
          // take it as a request to close.
          event.stopPropagation();
          onEscapeRef.current();
          return true;
        },
      },
      onUpdate: ({ editor: updated }) => {
        const written = contentOf(updated.getJSON());
        writtenRef.current = written;
        onChangeRef.current(written);
      },
      onFocus: ({ editor: focused }) => {
        nested?.onFocusEditor(focused);
      },
    },
    [nested?.extensions],
  );

  // The outer document is the record: an undo there, or a value replaced by
  // the host, reaches this version through its attributes, also while the
  // caret is in it. What this editor wrote itself is already here.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (isEqual(contentOf(editor.getJSON()), content)) return;
    if (editor.isFocused && isEqual(writtenRef.current, version.content)) {
      return;
    }
    const { from } = editor.state.selection;
    writtenRef.current = null;
    editor.commands.setContent(lineOf(content), { emitUpdate: false });
    if (editor.isFocused) {
      editor.commands.setTextSelection(
        Math.min(from, editor.state.doc.content.size - 1),
      );
    }
  }, [editor, content, version.content]);

  useEffect(() => {
    editor?.setEditable(nested?.editable ?? false, false);
  }, [editor, nested?.editable]);

  const onEditorRef = useRef(onEditor);
  useLayoutEffect(() => {
    onEditorRef.current = onEditor;
  });
  useEffect(() => {
    onEditorRef.current(editor);
    return () => onEditorRef.current(null);
  }, [editor]);

  // A set of versions inside this version is inside a sentence or a switch,
  // however the field's own is shown: it folds to a pill.
  const insideVersion = useMemo(
    () => (nested === null ? null : { ...nested, openWholeMessage: false }),
    [nested],
  );

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
        <span className={versionLabelTextClasses}>{version.label}</span>
      </span>
      <NestedEditingContext.Provider value={insideVersion}>
        <EditorContent editor={editor} className={versionEditorClasses} />
      </NestedEditingContext.Provider>
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
  const attributes = useMemo(
    () => versionsAttributesOf(node.attrs),
    [node.attrs],
  );
  // Read by a version's change, which can arrive before the next render.
  const latest = useRef(attributes);
  useLayoutEffect(() => {
    latest.current = attributes;
  });
  const nested = useContext(NestedEditingContext);
  const active = nested?.active ?? true;
  const versionsId = useId();
  const wrapperRef = useRef<HTMLElement>(null);
  // The versions are the whole message: nothing but whitespace is around the
  // element in its line. Followed as the line is edited, since text typed
  // beside the element makes it one in a sentence.
  const isWholeMessage = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      isWholeMessageVersions(current.state.doc),
  });
  const alwaysOpen = (nested?.openWholeMessage ?? false) && isWholeMessage;
  const versionEditors = useRef<(Editor | null)[]>([]);

  // Open while the element is selected, until Escape or leaving the field
  // folds it back to its pill; selecting it again after the caret has been
  // elsewhere, or clicking its pill, opens it again. Open, too, while the
  // caret is in one of its versions: an edit there rewrites the element in
  // the line, which can move the line's selection off it.
  const [folded, setFolded] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  // Followed as they change, while rendering. A field that is not active as
  // the element mounts folds it at once.
  const [wasSelected, setWasSelected] = useState(selected);
  const [wasActive, setWasActive] = useState(true);
  if (selected !== wasSelected) {
    setWasSelected(selected);
    if (!selected) setFolded(false);
  }
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) {
      setFolded(true);
      setFocusWithin(false);
    }
  }
  const expanded = alwaysOpen || ((selected || focusWithin) && !folded);

  useEffect(() => {
    const element = wrapperRef.current;
    if (element === null) return undefined;
    const expand = () => setFolded(false);
    const collapse = () => setFolded(true);
    element.addEventListener(EXPAND_EVENT, expand);
    element.addEventListener(COLLAPSE_EVENT, collapse);
    return () => {
      element.removeEventListener(EXPAND_EVENT, expand);
      element.removeEventListener(COLLAPSE_EVENT, collapse);
    };
  }, []);

  /** Selects the element, with the caret in the line around it. */
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
  /** Folds the element and hands the caret back to the line, on its pill. */
  const foldToPill = () => {
    setFolded(true);
    selectSelf();
  };
  /** Moves into the neighbouring version, with the caret where it came from. */
  const stepFrom = (index: number) => (delta: -1 | 1) => {
    const target = versionEditors.current[index + delta];
    if (target === undefined || target === null || target.isDestroyed) {
      return false;
    }
    target
      .chain()
      .focus(delta === 1 ? 'start' : 'end')
      .run();
    return true;
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      as="span"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the element sits inline in a line of text, where a <fieldset> cannot.
      role="group"
      aria-label={attributes.label}
      data-versions-element=""
      data-expanded={expanded || undefined}
      data-always-open={alwaysOpen || undefined}
      className="mx-0.5"
    >
      {!alwaysOpen && (
        <>
          {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus, jsx-a11y/click-events-have-key-events -- an atom in the editor's line: the caret reaches it as a node selection and the editor's Enter and Space shortcuts open it (openOrEnter), so it is not a tab stop of its own. */}
          <span
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- see above: a <button> would be a tab stop inside the editable line.
            role="button"
            aria-expanded={expanded}
            aria-controls={versionsId}
            data-versions-pill=""
            data-selected={selected || undefined}
            // Open, the element shows its versions in the pill's place.
            hidden={expanded}
            className={tokenPillClasses(
              cx('mx-0 cursor-pointer', expanded && 'hidden'),
            )}
            // Selects the element and opens it, also when it was already
            // selected and folded.
            onClick={() => {
              selectSelf();
              setFolded(false);
            }}
          >
            <TokenPillContent label={attributes.summary ?? attributes.label} />
          </span>
        </>
      )}
      <span
        id={versionsId}
        // Folded versions stay mounted, so their editors keep their history
        // and a value being inserted from the toolbar still has its target.
        hidden={!expanded}
        onFocus={() => setFocusWithin(true)}
        // Focus that moves on to the toolbar, or to a menu it opens, is
        // still working in this version; only the line around it, or
        // leaving the field, takes it elsewhere.
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (
            next instanceof Node &&
            editor.view.dom.contains(next) &&
            !event.currentTarget.contains(next)
          ) {
            setFocusWithin(false);
          }
        }}
        // One row for each version, its label then its line, in the order
        // the consumer gives them.
        className={cx(
          expanded ? 'inline-grid' : 'hidden',
          'max-w-full grid-cols-[max-content_minmax(0,1fr)] items-start gap-x-3 gap-y-2 align-baseline',
          // The field's text area is the container. Its width, not the
          // window's, decides when the rows stack.
          '@max-sm/rich-text:w-full @max-sm/rich-text:grid-cols-[minmax(0,1fr)] @max-sm/rich-text:gap-y-1',
          'border-primary/40 bg-primary/5 rounded-sm border border-dashed px-3 py-2',
          // With no pill to show it, the element being selected in the line
          // (what Escape in a row leaves it) is shown by its frame: whatever
          // is typed next replaces it.
          alwaysOpen && selected && 'border-primary border-solid',
        )}
      >
        {attributes.versions.map((version, index) => (
          <VersionEditor
            key={version.key}
            version={version}
            // A permanently open element has nothing to fold back to: Escape
            // hands the caret back to the line, with the element selected.
            onEscape={alwaysOpen ? selectSelf : foldToPill}
            onStep={alwaysOpen ? stepFrom(index) : undefined}
            onEditor={(versionEditor) => {
              versionEditors.current[index] = versionEditor;
            }}
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
      </span>
    </NodeViewWrapper>
  );
}

// An event in one of the versions' own editors is that editor's to handle.
const isInVersionEditor = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest('[data-version]') !== null;

/** The selected element's view, when the selection is one. */
const selectedElement = (editor: Editor): HTMLElement | null => {
  const { selection } = editor.state;
  if (
    !(selection instanceof NodeSelection) ||
    selection.node.type.name !== VERSIONS_NODE
  ) {
    return null;
  }
  const dom = editor.view.nodeDOM(selection.from);
  return dom instanceof HTMLElement
    ? dom.querySelector<HTMLElement>('[data-versions-element]')
    : null;
};

// Enter or Space on a folded element opens it; on an open one, moves into its
// first version.
const openOrEnter = ({ editor }: { editor: Editor }) => {
  const element = selectedElement(editor);
  if (element === null) return false;
  if (!element.hasAttribute('data-expanded')) {
    element.dispatchEvent(new Event(EXPAND_EVENT));
    return true;
  }
  const first = element.querySelector<HTMLElement>('[role="textbox"]');
  if (first === null) return false;
  first.focus();
  return true;
};

/**
 * Versions of a piece of text, held in the line as one element. The caret
 * steps over it in the line around it, and it is selected, moved, copied and
 * deleted whole. It shows as a pill naming what the versions depend on, and
 * opens to show its versions while it is selected: clicked, reached with the
 * keyboard, or just inserted. Each version is edited in place in an editor of
 * its own: Enter or Space on the selected element opens it, or moves into its
 * versions once it is open, and Escape moves back out to the pill and folds
 * the element. Leaving the field folds it too.
 *
 * A field that opts in (`NestedEditing.openWholeMessage`) shows the versions
 * of a message that is nothing else permanently open instead, one labelled
 * row each, with no pill; the arrow keys step between the rows, and Escape
 * moves out of a row to the line without hiding anything.
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
      summary: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-versions-summary'),
        renderHTML: (attributes) =>
          typeof attributes.summary === 'string'
            ? { 'data-versions-summary': attributes.summary }
            : {},
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
            return versionsIn(parsed);
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
      Enter: openOrEnter,
      Space: openOrEnter,
    };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        props: {
          // Folds an open element back to its pill, which stays selected.
          // Escape is spent on that, so a dialog around the text does not
          // also take it as a request to close.
          handleKeyDown: (_view, event) => {
            if (event.key !== 'Escape') return false;
            const element = selectedElement(editor);
            // Nothing to fold on an element that is always open: Escape is
            // left to whatever surrounds the text.
            if (
              element === null ||
              !element.hasAttribute('data-expanded') ||
              element.hasAttribute('data-always-open')
            ) {
              return false;
            }
            event.preventDefault();
            event.stopPropagation();
            element.dispatchEvent(new Event(COLLAPSE_EVENT));
            return true;
          },
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VersionsView, {
      as: 'span',
      stopEvent: ({ event }) => isInVersionEditor(event),
      ignoreMutation: () => true,
    });
  },
});
