import type { ChangeEvent, KeyboardEvent } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { getInputState } from '@codaco/fresco-ui/form/utils/getInputState';
import {
  controlVariants,
  inputControlVariants,
  interactiveStateVariants,
  placeholderVariants,
  stateVariants,
  textSizeVariants,
} from '@codaco/fresco-ui/styles/controlVariants';
import { cva, cx } from '@codaco/fresco-ui/utils/cva';

// `controlVariants` lays a control out on one line it truncates; this one
// wraps, so its box follows the text. One line is as tall as `InputField`:
// 48px, less a 2px border on each side, around a 24px line.
const wrapperOwnVariants = cva({
  base: cx(
    'grid w-full grid-cols-[minmax(0,1fr)] items-stretch',
    'min-h-12 px-6 py-2.5 whitespace-normal',
  ),
});

const wrapperVariants = cva({
  composes: [
    textSizeVariants,
    controlVariants,
    inputControlVariants,
    stateVariants,
    interactiveStateVariants,
    wrapperOwnVariants,
  ],
});

const sharedTextLayout =
  'col-start-1 row-start-1 w-full border-none p-0 [font-size:inherit] leading-6 text-wrap whitespace-pre-wrap break-words';

type WrappingTextFieldProps = CreateFormFieldProps<string, 'textarea'>;

/**
 * Plain text that is one paragraph, in a control that looks like a one-line
 * `InputField` while it fits and grows to show every line once it does not, so
 * a sentence-long message is never cut off at the field's edge.
 *
 * Like `StageNameInput`, it is a `<textarea>` sized by a hidden copy of its
 * text laid out behind it in the same grid cell, and the value stays one
 * paragraph: Enter adds nothing and pasted line breaks become spaces, because
 * the interview shows these texts as a single run of words.
 */
export default function WrappingTextField({
  value,
  onChange,
  className,
  placeholder,
  ...props
}: WrappingTextFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(event.target.value.replace(/\r\n|[\r\n]/g, ' '));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME sends Enter to commit the candidate being chosen.
    if (event.nativeEvent.isComposing || event.key !== 'Enter') return;
    event.preventDefault();
  };

  const text = value ?? '';

  return (
    <div
      className={wrapperVariants({ className, state: getInputState(props) })}
    >
      <div aria-hidden="true" className={cx(sharedTextLayout, 'invisible')}>
        {/*
         * The trailing space holds the height of a line ending in whitespace,
         * which a block collapses away and the textarea shows a caret on.
         */}
        {text || placeholder}{' '}
      </div>
      <textarea
        {...props}
        value={text}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        // Enter never adds a line; without this a screen reader describes one.
        aria-multiline={false}
        className={cx(
          sharedTextLayout,
          placeholderVariants(),
          'h-full cursor-[inherit] resize-none overflow-hidden bg-transparent outline-none focus:ring-0',
        )}
      />
    </div>
  );
}
