'use client';

import { GripVertical } from 'lucide-react';

import { cva } from '../../../utils/cva';

/**
 * The frame the editor draws round a section (a field, a logic block): its
 * outline and how it shows that it is the selection. What is inside is the
 * consumer's. Its drag handle stands outside it, in the gutter at the start of
 * whatever holds it (the editor's text, or a logic block's branch), so the
 * frame never clips: a logic block clips its content inside it instead (see
 * `LogicBlockView`).
 */
export const sectionFrameVariants = cva({
  base: 'group/section relative my-4 rounded-lg border-2 outline-offset-2 first:mt-0 last:mb-0',
  variants: {
    kind: {
      field: 'border-current/15 px-5 py-4',
      logic: 'border-info/40',
    },
    selected: {
      true: 'outline-primary outline-2',
      false: '',
    },
    // A field whose attribute is not chosen yet.
    indeterminate: {
      true: 'border-dashed border-current/30 bg-current/3',
      false: '',
    },
  },
  defaultVariants: { selected: false, indeterminate: false },
});

/**
 * The handle a section is dragged by, in the gutter at the start of its
 * frame, shown while the pointer is over the section or the section is
 * selected. It reaches 30px before the frame, and each place a section stands
 * leaves at least that much at its start: the editor's text (`ps-13`, 52px)
 * and a logic block's branch (32px before what it shows). Mod-Shift-ArrowUp and
 * Mod-Shift-ArrowDown move a section from the keyboard, so the handle is
 * hidden from assistive technology.
 */
export function SectionDragHandle({
  editable,
}: Readonly<{ editable: boolean }>) {
  if (!editable) return null;
  return (
    <div
      contentEditable={false}
      draggable
      data-drag-handle=""
      data-section-drag-handle=""
      aria-hidden
      className="absolute -inset-s-8 top-2 flex size-6 cursor-grab items-center justify-center rounded-sm text-current/50 opacity-0 select-none group-hover/section:opacity-100 group-data-selected/section:opacity-100 hover:bg-current/10"
    >
      <GripVertical className="pointer-events-none size-4" />
    </div>
  );
}

/**
 * Shows an empty line's placeholder, set on it as `data-placeholder` by a
 * decoration: in the interface's muted italic, taking no room of its own.
 */
export const PLACEHOLDER_CLASSES =
  'data-placeholder:before:pointer-events-none data-placeholder:before:float-start data-placeholder:before:h-0 data-placeholder:before:font-normal data-placeholder:before:italic data-placeholder:before:text-current/50 data-placeholder:before:content-[attr(data-placeholder)] data-placeholder:before:[unicode-bidi:plaintext]';
