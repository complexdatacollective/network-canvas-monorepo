import { Node as TiptapNode } from '@tiptap/core';
import {
  type DOMOutputSpec,
  DOMSerializer,
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
  Slice,
} from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';

/** The node type an inline value is held as. */
export const INLINE_VALUE_NODE = 'inlineValue';

/**
 * A value shown inside a line of text, such as an attribute that the
 * interview fills in, as the document holds it. The editor knows only its id;
 * what the id means, and how the value is drawn, are the consumer's.
 */
export type RichTextInlineValueContent = Readonly<{
  type: typeof INLINE_VALUE_NODE;
  attrs: Readonly<{ id: string }>;
}>;

/**
 * What a field that holds inline values is given by its consumer, which knows
 * what each id means.
 */
export type RichTextInlineValues = Readonly<{
  /**
   * How the value with this id is drawn: DOM that the editor builds itself,
   * not a React node view (which draws a frame late and moves the caret).
   * Drawn inside an element that carries `data-inline-value` and, while the
   * value is the selection, `data-selected`.
   */
  spec: (id: string) => DOMOutputSpec;
  /**
   * The value as words: what is copied as plain text, and what a folded set
   * of versions shows for it.
   */
  text: (id: string) => string;
  /**
   * Changes whenever what any value is drawn as changes (an attribute was
   * renamed, say). Every value in the text is drawn again; the text is not
   * changed, so nothing enters the history.
   */
  version: string;
  /**
   * A click on a value, or Enter while it is selected: for a value that opens
   * settings of its own. `element` is the value as drawn, for anchoring.
   */
  onActivate?: (id: string, element: HTMLElement) => void;
  /**
   * Values that pasted plain text can spell out, such as `{name}`: the
   * spelling arrives as the value rather than as those characters.
   */
  written?: readonly Readonly<{ id: string; text: string }>[];
}>;

/**
 * Where the extension reads its consumer from. One holder for the editor's
 * whole life: changing what the consumer gives must not rebuild the editor,
 * which would start its history again.
 */
export type InlineValuesSource = Readonly<{
  current: () => RichTextInlineValues | undefined;
}>;

const ATTRIBUTE = 'data-inline-value';

// Ring drawn round the value while it is the selection, whatever the
// consumer draws it as.
const FRAME_CLASSES =
  'mx-0.5 inline cursor-pointer rounded-full outline-offset-2 data-selected:outline-2 data-selected:outline-primary';

const idOf = (node: ProseMirrorNode): string =>
  typeof node.attrs.id === 'string' ? node.attrs.id : '';

/** The DOM the consumer draws a value as, or its words when there is none. */
const drawnContent = (source: InlineValuesSource, id: string): DOMOutputSpec =>
  source.current()?.spec(id) ?? ['span', id];

const fillFrame = (
  frame: HTMLElement,
  source: InlineValuesSource,
  id: string,
) => {
  const { dom } = DOMSerializer.renderSpec(
    frame.ownerDocument,
    drawnContent(source, id),
  );
  frame.replaceChildren(dom);
};

/**
 * The values drawn from one source, in the field's editor and in the editors
 * of its versions, so a change of `version` redraws them.
 */
const DRAWN_VALUES = new WeakMap<InlineValuesSource, Set<() => void>>();

/** Draws every value from `source` again, as the consumer now draws it. */
export const redrawInlineValues = (source: InlineValuesSource) => {
  for (const redraw of DRAWN_VALUES.get(source) ?? []) redraw();
};

/**
 * Pasted text with each value it spells out, such as `{name}`, turned into
 * the value. Text keeps its marks on both sides of one.
 */
const withWrittenValues = (
  fragment: Fragment,
  written: readonly Readonly<{ id: string; text: string }>[],
  schema: Schema,
): Fragment => {
  const valueType = schema.nodes[INLINE_VALUE_NODE];
  if (valueType === undefined) return fragment;
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (!node.isText) {
      nodes.push(
        node.isLeaf
          ? node
          : node.copy(withWrittenValues(node.content, written, schema)),
      );
      return;
    }
    let rest = node.text ?? '';
    while (rest !== '') {
      let first: { at: number; id: string; text: string } | undefined;
      for (const value of written) {
        const at = rest.indexOf(value.text);
        if (at !== -1 && (first === undefined || at < first.at)) {
          first = { at, ...value };
        }
      }
      if (first === undefined) {
        nodes.push(schema.text(rest, node.marks));
        break;
      }
      if (first.at > 0) {
        nodes.push(schema.text(rest.slice(0, first.at), node.marks));
      }
      nodes.push(valueType.create({ id: first.id }, null, node.marks));
      rest = rest.slice(first.at + first.text.length);
    }
  });
  return Fragment.fromArray(nodes);
};

const isInlineValueSelected = (
  selection: unknown,
): selection is NodeSelection =>
  selection instanceof NodeSelection &&
  selection.node.type.name === INLINE_VALUE_NODE;

/**
 * A value inside a line of text, held as one character of the line: the
 * caret steps over it, Backspace removes it whole, and it is copied, dragged
 * and pasted like text, between editors too (it travels as an element that
 * names its id). The consumer draws it (`RichTextInlineValues`).
 */
export const createInlineValueNode = (source: InlineValuesSource) =>
  TiptapNode.create({
    name: INLINE_VALUE_NODE,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        id: {
          default: '',
          parseHTML: (element) => element.getAttribute(ATTRIBUTE) ?? '',
          renderHTML: (attributes) => ({ [ATTRIBUTE]: attributes.id }),
        },
      };
    },

    parseHTML() {
      // Before the consumer's own markup inside it is read as text.
      return [{ tag: `span[${ATTRIBUTE}]`, priority: 60 }];
    },

    // What is copied: the element that names the value, holding what the
    // consumer draws, so that another editor reads it back as the value and
    // anything else reads it as its words.
    renderHTML({ node }): DOMOutputSpec {
      return [
        'span',
        { [ATTRIBUTE]: idOf(node), contenteditable: 'false' },
        drawnContent(source, idOf(node)),
      ];
    },

    renderText({ node }) {
      return source.current()?.text(idOf(node)) ?? idOf(node);
    },

    addNodeView() {
      return ({ node: initial }): NodeView => {
        let node = initial;
        const frame = document.createElement('span');
        frame.setAttribute(ATTRIBUTE, idOf(node));
        frame.setAttribute('contenteditable', 'false');
        frame.className = FRAME_CLASSES;
        fillFrame(frame, source, idOf(node));
        const redraw = () => fillFrame(frame, source, idOf(node));
        const drawn = DRAWN_VALUES.get(source) ?? new Set();
        DRAWN_VALUES.set(source, drawn);
        drawn.add(redraw);
        return {
          dom: frame,
          update: (next) => {
            if (next.type !== node.type) return false;
            const changed = idOf(next) !== idOf(node);
            node = next;
            if (changed) {
              frame.setAttribute(ATTRIBUTE, idOf(node));
              redraw();
            }
            return true;
          },
          selectNode: () => {
            frame.setAttribute('data-selected', '');
            frame.classList.add('ProseMirror-selectednode');
          },
          deselectNode: () => {
            frame.removeAttribute('data-selected');
            frame.classList.remove('ProseMirror-selectednode');
          },
          ignoreMutation: () => true,
          destroy: () => {
            drawn.delete(redraw);
          },
        };
      };
    },

    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          const { selection } = editor.state;
          const onActivate = source.current()?.onActivate;
          if (!isInlineValueSelected(selection) || onActivate === undefined) {
            return false;
          }
          const element = editor.view.nodeDOM(selection.from);
          if (!(element instanceof HTMLElement)) return false;
          onActivate(idOf(selection.node), element);
          return true;
        },
      };
    },

    addProseMirrorPlugins() {
      const { schema } = this.editor;
      return [
        new Plugin({
          key: new PluginKey('inlineValues'),
          props: {
            handleClickOn: (view, _position, node, nodePosition, event) => {
              if (node.type.name !== INLINE_VALUE_NODE) return false;
              const onActivate = source.current()?.onActivate;
              if (onActivate === undefined) return false;
              view.dispatch(
                view.state.tr.setSelection(
                  NodeSelection.create(view.state.doc, nodePosition),
                ),
              );
              const element = view.nodeDOM(nodePosition);
              if (element instanceof HTMLElement) {
                onActivate(idOf(node), element);
              }
              event.preventDefault();
              return true;
            },
            transformPasted: (slice: Slice) => {
              const written = (source.current()?.written ?? []).filter(
                ({ text }) => text !== '',
              );
              if (written.length === 0) return slice;
              return new Slice(
                withWrittenValues(slice.content, written, schema),
                slice.openStart,
                slice.openEnd,
              );
            },
          },
        }),
      ];
    },
  });
