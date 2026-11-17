import type { EditorView } from '@tiptap/pm/view';

/**
 * The editors whose emoji suggestions are showing.
 *
 * Kept apart from the plugin that shows them so that an editor's own key
 * handling, which ProseMirror asks before any plugin's, can stand aside
 * while they are: the arrow keys, Enter, Tab and Escape then belong to the
 * list and not to whatever else the editor does with them.
 */
const showing = new WeakSet<EditorView>();

export const setEmojiSuggestionsShowing = (
  view: EditorView,
  open: boolean,
): void => {
  if (open) showing.add(view);
  else showing.delete(view);
};

export const emojiSuggestionsShowing = (view: EditorView): boolean =>
  showing.has(view);
