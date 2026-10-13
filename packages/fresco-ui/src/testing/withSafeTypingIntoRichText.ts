/**
 * The two calls of a user-event `user` this wraps, typed by their shape so
 * that the module carries no dependency on user-event itself.
 */
type TypeOptions = { skipClick?: boolean };
type Typist = {
  click(element: Element): Promise<void>;
  type(element: Element, text: string, options?: TypeOptions): Promise<void>;
};

// Read from the attribute rather than from `isContentEditable`, which jsdom
// leaves undefined.
const isContentEditable = (element: Element): boolean => {
  const editable = element.getAttribute('contenteditable');
  return editable === '' || editable === 'true';
};

/**
 * Whether a test has already selected something inside `element`.
 *
 * A RANGE, not a caret. Both are measured, and they are not the same case: a
 * click over a range collapses it to the END of the text, which is why a test
 * that selected one has to be typed into without a click of the wrapper's
 * own; a click anywhere else puts a collapsed caret at the START of the text,
 * whatever was there before. So a range is the only selection a test can
 * express that survives being typed into, and a caret is not a position this
 * wrapper can honour at all.
 *
 * ProseMirror's own select-all puts both ends on the editable element itself
 * rather than in the text, so the ends are tested with `contains`, which
 * counts the element as containing itself.
 */
const hasSelectedRangeInside = (element: Element): boolean => {
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (
    selection == null ||
    selection.rangeCount === 0 ||
    selection.isCollapsed ||
    selection.anchorNode === null ||
    selection.focusNode === null
  ) {
    return false;
  }
  return (
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode)
  );
};

/**
 * Whether the caret is inside the editor's blocks, rather than on the
 * editable element itself — between two blocks, or after the last one.
 */
const caretIsInsideABlock = (element: Element): boolean => {
  const caret = element.ownerDocument.getSelection()?.focusNode;
  return caret != null && caret !== element && element.contains(caret);
};

/**
 * Resolves once jsdom has dispatched every `selectionchange` queued so far.
 *
 * jsdom queues each one with `setImmediate`, and immediates run in the order
 * they were queued, so one queued now runs after all of them — and ProseMirror
 * handles the event inside its own listener, so by then it has acted on every
 * selection the click made. That ordering is the signal waited on; it is not a
 * length of time.
 */
const selectionChangesDispatched = (): Promise<void> => {
  const { setImmediate } = globalThis as {
    setImmediate?: (callback: () => void) => unknown;
  };
  if (setImmediate === undefined) {
    throw new Error(
      "withSafeTypingIntoRichText is for jsdom under Node, which queues `selectionchange` with `setImmediate`. A browser places a click's caret itself.",
    );
  }
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
};

/**
 * A user-event `user` whose `type` is safe to point at a rich text field
 * under jsdom.
 *
 * The rule: type into a rich text field from a click of its own, and only
 * once ProseMirror has put that click's caret inside a paragraph — UNLESS the
 * test has already selected something in that field, and then type as
 * user-event does, so the selection reaches the keystrokes.
 *
 * Both halves are one defect, which is that ProseMirror only learns of a
 * selection when jsdom reports it: a `selectionchange` event, dispatched from
 * a task of its own after the selection moved.
 *
 * jsdom lays nothing out, so user-event cannot place a click's caret from
 * coordinates; it walks the element for text instead, finds none in a field
 * that is empty, and settles the caret at the END OF THE ELEMENT — after the
 * paragraph rather than inside it. ProseMirror puts a stray caret like that
 * back when it hears of it, but nothing in `type` waits for that between its
 * click and its keys, and the first character is written into the DOM as a
 * bare text node after the paragraph — where a one-paragraph document has
 * nowhere to hold it.
 * `clear` then `type` on a single-line field saved "rés proche" for
 * "Trés proche".
 *
 * A click made as a call of its own is not enough by itself. Testing
 * Library ends every user-event call by waiting a zero-delay timer, and jsdom
 * reports the selection with `setImmediate`: which of the two Node runs first
 * depends on where in the event loop the click happened, so a separate click
 * still lost the first key now and then. What is waited on here is jsdom's
 * own report of the click: an immediate queued after it runs after every
 * `selectionchange` the click queued, so ProseMirror has acted on the click
 * before the first key. The caret is then checked, so a click ProseMirror did
 * not put right fails here, by name, rather than dropping a key.
 *
 * The same report is what moves a click into a populated field to the start
 * of its text (below), so waiting for it makes that position certain too
 * rather than merely usual.
 *
 * With the separate click made unconditionally, a test that selects the answer
 * before typing over it appended instead: click, `{Control>}a{/Control}`,
 * `type` saved "OtherElse" for "Else". The extra click collapses the range to
 * the end of the text AND gives ProseMirror the selection change in which to
 * believe it, so the keystrokes insert rather than replace. `type`'s own click
 * collapses the DOM selection too, but ProseMirror never sees it before the
 * keystrokes and replaces the selection it still holds — which is what a
 * researcher typing over selected text gets.
 *
 * What the click does NOT do is leave a caret where a test put one. Measured:
 * a click into a field holding text puts a collapsed caret at offset 0 of the
 * first text node — from a caret at 0, at 4, at the end, and from no selection
 * at all — so every `type` into a populated rich text field inserts at the
 * START of the answer. `skipClick` is no way round it either: ProseMirror
 * never learns of the test's selection before the keys and puts its own back,
 * so nothing is typed anywhere. A test that wants a position has to select a
 * RANGE, which means in practice selecting the answer and typing it out whole.
 *
 * Only `type` is wrapped, because only `type` clicks. `clear` selects and
 * deletes, and `paste` and `keyboard` write at the selection they are given.
 * Measured: `clear` then `paste`, and a select-all then `paste`, both save the
 * whole text.
 *
 * Nothing about the CONTROL is at fault either way — a researcher cannot put a
 * caret between blocks, and a browser's own click never does — so this is the
 * test's to get right rather than the editor's.
 */
export function withSafeTypingIntoRichText<User extends Typist>(
  user: User,
): User {
  return {
    ...user,
    type: async (element: Element, text: string, options?: TypeOptions) => {
      if (
        options?.skipClick === true ||
        !isContentEditable(element) ||
        hasSelectedRangeInside(element)
      ) {
        return user.type(element, text, options);
      }
      await user.click(element);
      await selectionChangesDispatched();
      if (!caretIsInsideABlock(element)) {
        const selection = element.ownerDocument.getSelection();
        throw new Error(
          `withSafeTypingIntoRichText: ProseMirror left the click's caret on the editor itself (${String(selection?.focusNode?.nodeName)} at ${String(selection?.focusOffset)}), outside every paragraph, so the first key would be dropped.`,
        );
      }
      return user.type(element, text, { ...options, skipClick: true });
    },
  };
}
