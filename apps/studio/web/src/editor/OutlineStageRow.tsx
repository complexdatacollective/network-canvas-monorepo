import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useRef, type MouseEvent } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  focusWasLost,
  useKeyboardReorder,
} from '@codaco/fresco-ui/dnd/useKeyboardReorder';

const messages = defineMessages({
  moveScreenUp: {
    id: 'studio.editor.moveScreenUp',
    defaultMessage: 'Move {name} up',
    description:
      'Accessible name of the control that moves an interview screen one place earlier; {name} is the screen name.',
  },
  moveScreenDown: {
    id: 'studio.editor.moveScreenDown',
    defaultMessage: 'Move {name} down',
    description:
      'Accessible name of the control that moves an interview screen one place later; {name} is the screen name.',
  },
});

type OutlineStageRowProps = {
  stageId: string;
  /** What the screen is called on screen, already resolved for the language. */
  name: string;
  /** The supporting line under the name: the screen's type. */
  typeLabel: string;
  index: number;
  stageCount: number;
  selected: boolean;
  /**
   * Whether the screen may move one place earlier or later right now. A move
   * that is not available leaves the control on screen and focusable, marked
   * `aria-disabled`: a `disabled` button drops out of the tab order, so a
   * researcher whose last press carried the screen to the end of the list
   * would lose their place.
   */
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  /**
   * Moves the screen to `targetIndex`. Returns `false` when the move was
   * refused, or a promise of whether the server kept it, so nothing waits to
   * give focus back for a move that never happened.
   */
  onMove: (stageId: string, targetIndex: number) => false | Promise<boolean>;
};

/**
 * One screen in the editor's outline.
 *
 * The name button selects the screen and also takes the arrow keys, so the
 * keyboard path to reordering is the control a researcher is already on. The
 * two move buttons beside it are the alternative that needs no dragging and no
 * key chords (WCAG 2.5.7), and they produce the same move.
 *
 * Moving a screen is an RPC, and the list only reorders once it has been read
 * back. Either control keeps focus throughout: nothing here is `disabled`, and
 * when the new order arrives the control that made the move is focused again,
 * because repositioning a list item in the DOM blurs whatever it held.
 */
export default function OutlineStageRow({
  stageId,
  name,
  typeLabel,
  index,
  stageCount,
  selected,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMove,
}: OutlineStageRowProps) {
  const intl = useAppIntl();
  const { ref: selectRef, ...reorder } = useKeyboardReorder({
    index,
    itemCount: stageCount,
    onMove: (targetIndex) => onMove(stageId, targetIndex),
  });

  // The hook returns focus to the name button after a KEY move. A move made
  // with one of the buttons has to return to that button, so a researcher
  // pressing "Move down" again does not find focus on the name instead.
  const buttonMove = useRef<{
    control: HTMLButtonElement;
    fromIndex: number;
  } | null>(null);
  useEffect(() => {
    const pending = buttonMove.current;
    if (pending === null || pending.fromIndex === index) return undefined;
    buttonMove.current = null;
    // Given back only if the reorder took it, as the hook does for a key move.
    const frame = requestAnimationFrame(() => {
      if (focusWasLost(pending.control)) pending.control.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [index]);

  const moveWithButton = (
    event: MouseEvent<HTMLButtonElement>,
    targetIndex: number,
    available: boolean,
  ) => {
    // `aria-disabled` does not stop a click, so the handler does.
    if (!available) return;
    const claim = { control: event.currentTarget, fromIndex: index };
    buttonMove.current = claim;
    // Withdrawn only if it is still this press's: a later press owns its own.
    const withdraw = () => {
      if (buttonMove.current === claim) buttonMove.current = null;
    };
    const answer = onMove(stageId, targetIndex);
    if (answer === false) withdraw();
    else
      void answer.then((moved) => (moved ? undefined : withdraw()), withdraw);
  };

  return (
    <li className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        ref={selectRef}
        className="focusable aria-current:bg-selected aria-current:text-selected-contrast min-w-0 flex-1 rounded px-3 py-2 text-start"
        aria-current={selected ? 'page' : undefined}
        aria-keyshortcuts={reorder['aria-keyshortcuts']}
        onKeyDown={reorder.onKeyDown}
        onClick={onSelect}
      >
        <span className="block truncate">{name}</span>
        <span className="block truncate text-xs opacity-70">{typeLabel}</span>
      </button>
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          className="focusable rounded p-1 aria-disabled:opacity-30"
          aria-label={intl.formatMessage(messages.moveScreenUp, { name })}
          aria-disabled={!canMoveUp}
          onClick={(event) => moveWithButton(event, index - 1, canMoveUp)}
        >
          <ArrowUp aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className="focusable rounded p-1 aria-disabled:opacity-30"
          aria-label={intl.formatMessage(messages.moveScreenDown, { name })}
          aria-disabled={!canMoveDown}
          onClick={(event) => moveWithButton(event, index + 1, canMoveDown)}
        >
          <ArrowDown aria-hidden="true" size={16} />
        </button>
      </div>
    </li>
  );
}
