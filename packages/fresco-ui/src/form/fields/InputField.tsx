import { Minus, Plus } from 'lucide-react';
import { forwardRef, type ReactNode, useCallback, useRef } from 'react';

import { IconButton } from '../../Button';
import {
  controlVariants,
  heightVariants,
  inlineSpacingVariants,
  inputControlVariants,
  interactiveStateVariants,
  placeholderVariants,
  proportionalLucideIconVariants,
  stateVariants,
  textSizeVariants,
  wrapperPaddingVariants,
} from '../../styles/controlVariants';
import { compose, cva, cx, type VariantProps } from '../../utils/cva';
import { useFieldController } from '../Field/FieldController';
import type { CreateFormFieldProps, FieldSlotController } from '../Field/types';
import { getInputState } from '../utils/getInputState';

/**
 * A prefix/suffix slot is either static content or a render function that
 * receives the enclosing Field's controller (so a "Generate" button can set
 * the value without importing the form store). Function slots no-op when
 * InputField is used standalone, outside a Field.
 */
type InputFieldSlot = ReactNode | ((field: FieldSlotController) => ReactNode);

/**
 * The complete InputField container treatment, exposed for controls that must
 * retain different semantics while presenting as a field (for example, a
 * search-dialog trigger).
 */
export const inputFieldControlVariants = compose(
  heightVariants,
  textSizeVariants,
  controlVariants,
  inputControlVariants,
  inlineSpacingVariants,
  wrapperPaddingVariants,
  proportionalLucideIconVariants,
  stateVariants,
  interactiveStateVariants,
  cva({
    base: cx(
      'max-w-full min-w-0',
      // `controlVariants` sets `min-w-fit` (sensible for buttons whose
      // label should never be clipped), but combined with
      // `field-sizing-content` on the inner `<input>` that produces a
      // wrapper whose min-width is the input's entire content width —
      // so pasting e.g. an UploadThing API token (~200 chars, no
      // whitespace) causes the whole settings field to overflow its
      // container. `min-w-0` lets flex shrink the wrapper below its
      // intrinsic content size; combined with `min-w-0` on the inner
      // `<input>` (see `inputVariants` below), text is clipped inside
      // a container-sized field instead of blowing out the layout.
      'w-auto shrink-0',
      // Focus indication is one ring per focused element: the wrapper's
      // `focus-styles` ring (from the composed `interactiveStateVariants`) is
      // the inner <input>'s proxy — the input sets `focus:ring-0` and has none
      // of its own. Slot controls render their own design-system focus ring
      // (`Button`/`IconButton` use `focusable`), so the wrapper deliberately
      // does NOT add a second ring on slot focus, which would double-ring.
      //
      // The wrapper clips to its rounded corners (`overflow-hidden` from
      // `controlVariants`, needed for child backgrounds such as the number
      // steppers). A focused slot button's outward offset ring (outline-offset-3
      // + outline-2 = 5px) exceeds the ~4px vertical clearance and would be
      // clipped, so un-clip while a slot control is focus-visible — the ring
      // then paints in full. Number steppers instead paint an INSET ring (see
      // `stepperButtonVariants`) so they stay fully visible without depending on
      // this un-clip, and number fields keep their clipped corners.
      'has-[button:focus-visible]:overflow-visible',
      // Child buttons should have reduced height, but their icons should stay the same size
      '[&_button]:h-10',
    ),
  }),
);

// Input element when used with wrapper (prefix/suffix)
const inputVariants = compose(
  placeholderVariants,
  cva({
    base: cx(
      'cursor-[inherit]',
      '[font-size:inherit]', // Ensure input inherits text size from wrapper
      'p-0',
      // `field-sizing-content` sets the intrinsic width to the content,
      // so very long single-token values (e.g. an UploadThing API token)
      // would blow out the flex parent unless we let flex shrink the
      // input. `min-w-0` + default `shrink: 1` lets it collapse to fit
      // the container; `grow basis-0` makes it expand to fill any
      // remaining space when the content is short.
      'field-sizing-content min-w-0 grow basis-0',
      'border-none bg-transparent outline-none focus:ring-0',
      'transition-none',
      // Hide browser's native clear button on search inputs (we provide our own)
      '[&::-webkit-search-cancel-button]:hidden',
      '[&::-webkit-search-decoration]:hidden',
      // Hide browser's native spinner on number inputs (we provide our own)
      '[&::-webkit-outer-spin-button]:appearance-none',
      '[&::-webkit-inner-spin-button]:appearance-none',
      '[appearance:textfield]',
    ),
  }),
);

const stepperButtonVariants = cx(
  // Steppers keep their square footprint; they must never compress when the
  // field is constrained narrow (the middle input shrinks instead).
  'aspect-square h-full! shrink-0 rounded-none',
  'elevation-none! translate-y-0!',
  'bg-input-contrast/5 text-input-contrast',
  'hover:bg-input-contrast/10',
  'disabled:pointer-events-none disabled:opacity-30',
  // The steppers sit flush against the wrapper edges, which clips its rounded
  // corners with `overflow-hidden` (from `controlVariants`). The default
  // outward focus ring (`outline-offset-3`) would be clipped on the top,
  // bottom and inner edges. Paint the ring INSET instead so it's fully visible
  // on all four sides without relying on the wrapper un-clipping.
  'focus-visible:-outline-offset-3',
);

type InputFieldProps = CreateFormFieldProps<
  string,
  'input',
  {
    size?: VariantProps<typeof textSizeVariants>['size'];
    prefixComponent?: InputFieldSlot;
    suffixComponent?: InputFieldSlot;
    // Forwards the native React ChangeEvent to the caller. Needed when
    // InputField is used as a base-ui `render` prop (e.g. Combobox.Input),
    // because base-ui's internal onChange handler expects the full event
    // (it reads event.nativeEvent.inputType), while InputField's own
    // onChange only passes the string value.
    nativeOnChange?: React.ChangeEventHandler<HTMLInputElement>;
  }
>;

const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  function InputField(props, ref) {
    const {
      prefixComponent,
      suffixComponent,
      size = 'md',
      className,
      value,
      onChange,
      nativeOnChange,
      type = 'text',
      disabled,
      readOnly,
      ...inputProps
    } = props;

    // Function slots resolve against the enclosing Field's controller; outside
    // a Field there is no controller, so they render nothing.
    const fieldController = useFieldController();
    const resolveSlot = (slot: InputFieldSlot): ReactNode =>
      typeof slot === 'function'
        ? fieldController
          ? slot(fieldController)
          : null
        : slot;
    const prefix = resolveSlot(prefixComponent);
    const suffix = resolveSlot(suffixComponent);

    const internalRef = useRef<HTMLInputElement>(null);
    const isNumber = type === 'number';
    const isInteractive = !disabled && !readOnly;

    const handleStep = useCallback(
      (direction: 'up' | 'down') => {
        const input = internalRef.current;
        if (!input) return;

        if (direction === 'up') {
          input.stepUp();
        } else {
          input.stepDown();
        }

        // stepUp/stepDown don't fire change events, so notify React directly
        onChange?.(input.value);
      },
      [onChange],
    );

    const wrapperClassName = cx(
      inputFieldControlVariants({ size, state: getInputState(props) }),
      isNumber && 'gap-0! px-0!',
      className,
    );

    const inputContent = (
      <>
        {prefix}
        <input
          ref={(node) => {
            internalRef.current = node;

            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          autoComplete="off"
          // The caller's `className` styles the wrapper (the control container),
          // not the inner input — otherwise a background/backdrop passed to the
          // field (e.g. the glass treatment) would double-apply onto the input.
          className={inputVariants()}
          type={type}
          {...inputProps}
          onChange={(e) => {
            onChange?.(e.target.value);
            nativeOnChange?.(e);
          }}
          onWheel={(e) => {
            if (isNumber) {
              e.currentTarget.blur();
            }
          }}
          value={value ?? ''}
          disabled={disabled}
          readOnly={readOnly}
        />
        {suffix}
      </>
    );

    const inputElement = isNumber ? (
      <>
        <IconButton
          size={size}
          color="default"
          disabled={!isInteractive}
          onClick={() => handleStep('down')}
          aria-label="Decrease value"
          tabIndex={-1}
          icon={<Minus />}
          className={stepperButtonVariants}
        />
        <div
          className={cx(
            'flex min-w-0 grow items-center justify-center',
            inlineSpacingVariants(),
            // The steppers already frame the value, so the middle needs only
            // modest padding. The full `wrapperPaddingVariants` (px-6) would
            // consume the entire middle slot on a narrow field (e.g. w-28),
            // collapsing the input to zero width and hiding the value.
            size === 'sm' ? 'px-2.5' : 'px-4',
          )}
        >
          {inputContent}
        </div>
        <IconButton
          size={size}
          color="default"
          disabled={!isInteractive}
          onClick={() => handleStep('up')}
          aria-label="Increase value"
          tabIndex={-1}
          icon={<Plus />}
          className={stepperButtonVariants}
        />
      </>
    ) : (
      inputContent
    );

    return <div className={wrapperClassName}>{inputElement}</div>;
  },
);

export default InputField;
