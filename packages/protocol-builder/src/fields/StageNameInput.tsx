import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

/**
 * Type and box metrics the control and its sizing replica below must share.
 * The replica only stands in for the textarea's layout while both break lines
 * in the same places, so every property that affects line breaking has to be
 * set here rather than on one of them.
 *
 * `text-wrap` (normal) overrides the `text-pretty` `headingVariants` sets:
 * `pretty` is a per-engine heuristic, and there is no guarantee a form
 * control's inner text applies it the same way a block does. Plain wrapping is
 * defined identically for both, and at these lengths `pretty` was not changing
 * where the heading broke anyway.
 */
const sharedTextLayout = cx(
  headingVariants({ level: 'h1', margin: 'none' }),
  'col-start-1 row-start-1 w-full border-none p-0 text-wrap whitespace-pre-wrap',
);

/**
 * The button a browser would use for this form's implicit submission: the
 * first submit button the form owns, in tree order. `form.elements` is the
 * right list because it includes controls associated by the `form` attribute —
 * the stage editor's "Finished Editing" button lives in the nav, outside the
 * `<form>`, and is only reachable this way.
 */
const findDefaultSubmitButton = (form: HTMLFormElement) =>
  Array.from(form.elements).find(
    (element): element is HTMLButtonElement | HTMLInputElement =>
      (element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement) &&
      element.type === 'submit',
  );

type HeadingInputProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  /** Blur hook for auto-naming; the form's own blur handling is on the container. */
  'onFieldBlur'?: () => void;
  'placeholder'?: string;
  /**
   * Hard cap on typed characters. Not called `maxLength`: that name belongs to
   * fresco-ui's validation catalogue, where it would become a post-hoc error
   * instead of the input's own limit.
   */
  'characterLimit'?: number;
  'autoFocus'?: boolean;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/**
 * The stage's name, rendered at the size of the page's own heading. The label and error text come from
 * the surrounding `BaseField`, so this is only the control.
 *
 * It is a `<textarea>` rather than an `<input>` for one reason: an input lays
 * its value out on a single unwrappable line, so a stage name longer than the
 * column was cut off at the edge with nothing to say more of it existed. The
 * value itself stays one line — breaks are refused on keypress and collapsed
 * on paste — so nothing downstream has to cope with a multi-line stage name.
 */
const StageNameInput = ({
  id,
  name,
  value = '',
  onChange,
  onFieldBlur,
  placeholder,
  characterLimit,
  autoFocus,
  disabled = false,
  readOnly = false,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: HeadingInputProps) => {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    // Reachable by paste and by drop, neither of which `onKeyDown` sees. A
    // space rather than nothing, so two pasted lines do not run together into
    // one word.
    //
    // One space per break, and deliberately NOT the surrounding whitespace as
    // well: `maxLength` is the browser's, applied to the raw value before this
    // runs. Anything that shortened the string here would hand the cap
    // characters to discard that the finished name had room for — an indented
    // 51-character paste that normalises to 45 came back cut at 44. Preserving
    // the length costs a run of spaces where the paste was indented, which the
    // researcher can see and tidy; the truncation silently took real text.
    onChange?.(event.target.value.replace(/[\r\n]/g, ' '));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME sends Enter to commit the candidate the researcher is choosing.
    // Intercepting it would submit a name that is still being composed.
    if (event.nativeEvent.isComposing || event.key !== 'Enter') {
      return;
    }

    // A textarea would insert a line break here. The `<input>` this replaces
    // performed the form's implicit submission instead, so that is what Enter
    // still does.
    event.preventDefault();

    // Implicit submission CLICKS the default button rather than submitting the
    // form behind it, and that distinction is load-bearing here: "Finished
    // Editing" carries an `onClick` that reopens the Issues panel on a repeat
    // failed attempt, when neither `submitFailed` nor the error set changes and
    // the auto-open effect therefore does not re-fire. `requestSubmit()` would
    // skip it. A click also inherits the browser's own handling of the cases
    // with nothing to press: no default button (the stage editor renders one
    // only once there are unsaved changes) and a disabled one both do nothing.
    const form = event.currentTarget.form;
    if (form) {
      findDefaultSubmitButton(form)?.click();
    }
  };

  const handleBlur = (_event: FocusEvent<HTMLTextAreaElement>) => {
    onFieldBlur?.();
  };

  return (
    /*
     * A textarea cannot size itself to its own content, so the same text is
     * laid out behind it in an ordinary block, which can. Both occupy one grid
     * cell: the block gives the cell its height and the textarea stretches to
     * fill it. Layout does all of the work, so the height stays correct across
     * width changes, zoom, and a web font that arrives after first paint —
     * none of which a measured height notices without being told to look.
     *
     * `minmax(0,1fr)` is what stops the column from widening to the replica's
     * min-content width. Without it a stage name containing one long unbroken
     * word pushes the whole hero wider than its container instead of breaking.
     */
    <div className="grid w-full grid-cols-[minmax(0,1fr)]">
      <div aria-hidden="true" className={cx(sharedTextLayout, 'invisible')}>
        {/*
         * The trailing space holds the height of a line ending in whitespace,
         * which a block collapses away but the textarea still shows a caret
         * on. The placeholder stands in while the field is empty because the
         * textarea renders it at the same size, wrapped the same way.
         */}
        {value || placeholder}{' '}
      </div>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={1}
        // The control wraps, but the value it holds is one line and Enter
        // never adds another. Without this a screen reader announces a
        // multiline textbox, describing an Enter that does not exist.
        aria-multiline={false}
        placeholder={placeholder}
        maxLength={characterLimit}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={cx(
          sharedTextLayout,
          'focusable h-full resize-none overflow-hidden bg-transparent outline-none placeholder:opacity-40',
          ariaInvalid && 'text-destructive',
        )}
      />
    </div>
  );
};

export default StageNameInput;
