import type { JSONContent } from '@tiptap/core';
import type { ReactNode, RefObject } from 'react';

import type { RichTextLogicBranch } from './logicBlockNode';
import type { RichTextVersionPlace } from './versionsNode';

/**
 * The character that, typed in a field with insert tools, asks the tools for
 * a value at the caret: `{`, as an ICU argument is written.
 */
export const INSERT_TRIGGER = '{';

/**
 * The trigger character (`INSERT_TRIGGER`) typed at the caret: the
 * consumer opens its menu of values at `anchor`, an element placed where the
 * character was typed. A value inserted while it is open replaces the
 * character; `dismiss` leaves the character where it is.
 */
export type RichTextInsertTrigger = Readonly<{
  anchor: RefObject<HTMLElement | null>;
  dismiss: () => void;
}>;

/**
 * What a consumer can do to the text of a rich text field. The object keeps
 * its identity for as long as the field is mounted (see `commandsRef`), and
 * each command acts on the field's editor as it is when the command runs.
 * Each change is one undoable edit, at the caret (or where the trigger was
 * typed), and leaves the keyboard in the text.
 */
export type RichTextCommands = Readonly<{
  /** Puts in a value at the caret, replacing a typed trigger character. */
  insertInlineValue: (id: string) => void;
  /**
   * Puts in inline content at the caret, replacing a typed trigger
   * character, as `insertInlineValue` does: for a value that comes with text
   * of its own, such as a set of versions (`versions`), whose first version
   * is then selected.
   */
  insertContent: (content: JSONContent | readonly JSONContent[]) => void;
  /**
   * Puts in a field block at the nearest place a block can stand, with the
   * caret in its label, and gives back its frame, for anchoring a picker.
   * Null where no field block can go (the editor has none, or is read-only).
   */
  insertFieldBlock: (
    attrs: Readonly<{ fieldId: string; variable: string }>,
  ) => HTMLElement | null;
  /**
   * Puts in a logic block, selected, at the nearest place a block can stand,
   * and gives back its frame. Null where none can go.
   */
  insertLogicBlock: (
    meta: unknown,
    branches: readonly RichTextLogicBranch[],
  ) => HTMLElement | null;
  /**
   * Takes every value `id` out of the field's text, as one undoable edit,
   * with the keyboard back in the text. For a value's own settings, which
   * offer to remove it. Values inside a set of versions (`versions`) are
   * their own editors' and are left as they are.
   */
  removeInlineValues: (id: string) => void;
  /** Gives the keyboard back to the text, with the caret where it was. */
  focus: () => void;
  /**
   * For the `finalFocus` of a menu the tools open over the text: as it
   * closes, hands the keyboard to the text a value was just put into, or
   * else the text the trigger was typed in, with the caret where it was
   * (focused by the browser instead, the caret can land at the start of the
   * text). Leaves focus alone if it is already back in the text. False once
   * it has handed the keyboard back; true when it has nowhere to hand it,
   * leaving focus to the menu.
   */
  returnFocus: () => boolean;
}>;

/**
 * What the consumer's insert tools (`insertTools`) are drawn with: the
 * field's commands, and the state of the text as it is in this render.
 */
export type RichTextInsertState = Readonly<{
  commands: RichTextCommands;
  /** Whether a block (a field, a logic block) can go in at the caret now. */
  canInsertSections: boolean;
  /** Whether the text can be changed at all. */
  editable: boolean;
  /** Where the trigger character was typed, while it is waiting for a value. */
  trigger: RichTextInsertTrigger | null;
  /**
   * The versions that what is put in goes into, outermost first: those of
   * the version the trigger was typed in, or else of the one the toolbar
   * acts on; none in the field's own line.
   */
  versionPlace: readonly RichTextVersionPlace[];
}>;

/**
 * The consumer's tools for putting things in the text (values, fields, logic
 * blocks), drawn as one group of the toolbar. Typing `INSERT_TRIGGER` in the
 * text asks them for a value at the caret (`RichTextInsertState.trigger`).
 */
export type RichTextInsertTools = Readonly<{
  /**
   * The name of the group, as a screen reader says it: what the tools put
   * in, such as "Insert an attribute, field or logic block". English, as
   * every name in the toolbar is.
   */
  label: string;
  /**
   * Draws the tools. Each control should be a `ToolbarButton`, so the
   * toolbar's arrow keys reach it; a labelled one is drawn with
   * `toolbarLabelledButtonStyles`.
   */
  render: (insert: RichTextInsertState) => ReactNode;
}>;
