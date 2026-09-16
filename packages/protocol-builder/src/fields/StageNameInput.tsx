import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';

/**
 * Type and box metrics the control and its sizing replica below MUST share:
 * the replica only stands in for the textarea's layout while both break lines
 * in the same places, so anything affecting line breaking belongs here rather
 * than on one of them. `text-wrap` overrides `headingVariants`' `text-pretty`,
 * which is a per-engine heuristic a form control need not apply as a block
 * does.
 */
const sharedTextLayout = cx(
  headingVariants({ level: 'h1', margin: 'none' }),
  'col-start-1 row-start-1 w-full border-none p-0 text-wrap whitespace-pre-wrap',
);

/**
 * The button a browser would use for this form's implicit submission: the
 * first submit button the form owns, in tree order. `form.elements` because it
 * includes controls associated by the `form` attribute — "Finished Editing"
 * lives in the nav, outside the `<form>`.
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
  /**
   * The form this control belongs to, when it is not drawn inside it. Without
   * it a title drawn outside the `<form>` has no form owner, and the implicit
   * submission below finds nothing to click.
   */
  'form'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  /** Blur hook for auto-naming; the form's own blur handling is on the container. */
  'onFieldBlur'?: () => void;
  'placeholder'?: string;
  /**
   * Hard cap on typed characters. Not `maxLength`: that name belongs to
   * fresco-ui's validation catalogue, where it becomes a post-hoc error rather
   * than the input's own limit.
   */
  'characterLimit'?: number;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/**
 * The stage's name, rendered at the size of the page's own heading. The label
 * and the refusal beneath it are drawn by `fields/StageNameField` around this,
 * so this is only the control.
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
  form,
  value = '',
  onChange,
  onFieldBlur,
  placeholder,
  characterLimit,
  disabled = false,
  readOnly = false,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: HeadingInputProps) => {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    // A space per break, and NOT the surrounding whitespace as well:
    // `maxLength` is the browser's, applied before this runs, so shortening
    // the string here spends cap characters the finished name had room for —
    // an indented 51-character paste normalising to 45 came back cut at 44.
    onChange?.(event.target.value.replace(/[\r\n]/g, ' '));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME sends Enter to commit the candidate the researcher is choosing.
    // Intercepting it would submit a name that is still being composed.
    if (event.nativeEvent.isComposing || event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    // CLICKED rather than `requestSubmit()`ed: "Finished Editing" carries an
    // `onClick` that reopens the Issues panel on a repeat failed attempt, when
    // neither `submitFailed` nor the error set changes and the auto-open
    // effect does not re-fire.
    const owner = event.currentTarget.form;
    if (owner) {
      findDefaultSubmitButton(owner)?.click();
    }
  };

  const handleBlur = (_event: FocusEvent<HTMLTextAreaElement>) => {
    onFieldBlur?.();
  };

  return (
    /*
     * A textarea cannot size itself to its content, so the same text is laid
     * out behind it in a block that can, both in one grid cell. Layout does the
     * work, so the height survives width changes, zoom and a late web font.
     *
     * `minmax(0,1fr)` stops the column widening to the replica's min-content
     * width, which one long unbroken word would push past the container.
     */
    <div className="grid w-full grid-cols-[minmax(0,1fr)]">
      <div aria-hidden="true" className={cx(sharedTextLayout, 'invisible')}>
        {/*
         * The trailing space holds the height of a line ending in whitespace,
         * which a block collapses away and the textarea shows a caret on.
         */}
        {value || placeholder}{' '}
      </div>
      <textarea
        id={id}
        name={name}
        form={form}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={1}
        // The value is one line and Enter never adds another; without this a
        // screen reader describes an Enter that does not exist.
        aria-multiline={false}
        placeholder={placeholder}
        maxLength={characterLimit}
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
