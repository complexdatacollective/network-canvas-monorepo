import { Extension } from '@tiptap/core';
import { GapCursor, gapCursor } from '@tiptap/pm/gapcursor';
import { type EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { paragraphVariants } from '../../../typography/Paragraph';
import { cx } from '../../../utils/cva';

/**
 * The caret between two blocks that hold no text (a field, a logic block, a
 * file, a rule), or between one of them and the start or end of the document
 * or of a branch: where arrowing off a selected block, or clicking between
 * such blocks, puts it. There is no line there to put a caret on, so
 * ProseMirror selects the gap itself (`GapCursor`) and makes a paragraph
 * there for whatever is typed next.
 *
 * ProseMirror draws that selection as a short horizontal line under the
 * block, which reads as nothing a researcher knows. It is drawn here as what
 * it is: the empty line that typing will fill, laid out as that paragraph
 * will be, with an ordinary text caret at its start. The line is only drawn
 * while the editor has focus, and it is not part of the document: moving on
 * without typing leaves the document as it was.
 */
const CARET_CLASSES = cx(
  // Spaced as the paragraph that typing makes there will be.
  paragraphVariants(),
  'pointer-events-none relative hidden h-lh in-[.ProseMirror-focused]:block',
  // The caret: as wide and as tall as the browser's own, at the start of the
  // line in either direction, blinking as ProseMirror's own carets do.
  "after:absolute after:inset-y-0 after:inset-s-0 after:w-px after:bg-current after:content-['']",
  'after:animate-[ProseMirror-cursor-blink_1.1s_steps(2,start)_infinite]',
);

const drawCaret = (state: EditorState): DecorationSet | null => {
  const { selection } = state;
  if (!(selection instanceof GapCursor)) return null;
  const line = document.createElement('div');
  line.className = CARET_CLASSES;
  line.setAttribute('data-gap-caret', '');
  line.setAttribute('aria-hidden', 'true');
  return DecorationSet.create(state.doc, [
    Decoration.widget(selection.head, line, { key: 'gap-caret' }),
  ]);
};

/**
 * ProseMirror's gap cursor (its keys, clicks and typing) with the caret drawn
 * as an empty line (see `CARET_CLASSES`). In place of the starter kit's.
 */
export const GapCaret = Extension.create({
  name: 'gapCaret',

  addProseMirrorPlugins() {
    const { props } = gapCursor();
    return [
      new Plugin({
        key: new PluginKey('gapCaret'),
        props: { ...props, decorations: drawCaret },
      }),
    ];
  },
});
