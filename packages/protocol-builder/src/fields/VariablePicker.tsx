import { useMemo } from 'react';

import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Pill from '@codaco/fresco-ui/Pill';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

export type VariablePickerOption = Readonly<{
  value: string;
  label: string;
  type?: VariableType;
}>;

export type VariablePickerProps = CreateFormFieldProps<
  string,
  'div',
  {
    options?: readonly VariablePickerOption[];
    /** Shown in place of the list when nothing can be picked yet. */
    emptyMessage?: string;
  }
>;

const PLACEHOLDER = 'Select an attribute…';
const DEFAULT_EMPTY_MESSAGE = 'No attributes are available to choose from.';

/**
 * Names an attribute the researcher has since deleted.
 *
 * A stored id that the codebook no longer describes is kept and shown rather
 * than quietly dropped: blanking the control would hide the very reference the
 * researcher has to resolve, and would then write the blank back over it.
 */
const missingOptionLabel = (id: string) =>
  `${id} — this attribute is no longer in the codebook`;

/**
 * Chooses one codebook attribute from a supplied list.
 *
 * It takes its options rather than reading a codebook, because what a rule may
 * address depends on the rule: an ego rule offers the ego's attributes, an
 * alter rule offers those of the entity type it has been pointed at, and both
 * are narrowed to the types a rule can compare. The caller that knows which
 * rule this is does that narrowing once.
 *
 * There is deliberately no "create a new attribute" affordance. Every current
 * caller sits inside a rule editor, where inventing a codebook variable while
 * building a filter is a different, compound edit — see the package's codebook
 * editors for that flow.
 *
 * Labelling belongs to the surrounding field; pass `label`/`hint` to the
 * `Field` that renders this.
 */
export function VariablePickerControl({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  options = [],
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: VariablePickerProps) {
  const selected = options.find((option) => option.value === value);
  const isMissing =
    value !== undefined && value !== '' && selected === undefined;

  const selectOptions = useMemo(() => {
    const listed = options.map((option) => ({
      value: option.value,
      label: option.label,
    }));
    // The dangling reference is offered as the current choice so the control
    // can show it as selected. It is last, so it never sits among the real
    // attributes at the top of the list.
    return isMissing && value !== undefined
      ? [...listed, { value, label: missingOptionLabel(value) }]
      : listed;
  }, [isMissing, options, value]);

  if (selectOptions.length === 0) {
    return (
      <div
        data-name={name}
        className={cx('flex w-full flex-col gap-3', className)}
      >
        <p
          id={id}
          aria-describedby={ariaDescribedBy}
          className="w-full py-6 text-center text-sm text-current/70 italic"
        >
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      data-name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      className={cx('flex w-full flex-col items-start gap-3', className)}
    >
      <NativeSelectField
        id={id}
        name={name}
        value={value ?? ''}
        onChange={(next) => {
          if (disabled || readOnly) return;
          onChange?.(typeof next === 'string' ? next : String(next ?? ''));
        }}
        options={selectOptions}
        placeholder={PLACEHOLDER}
        disabled={disabled}
        readOnly={readOnly}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-required={ariaRequired}
      />
      {/*
        The type is stated beside the choice rather than only implied by the
        control's colour: it decides which operators the next control offers,
        so the researcher needs to be able to read it.
      */}
      {selected?.type !== undefined && (
        <Pill
          variant="outline"
          className="variable-pill max-w-full"
          data-attribute-type={selected.type}
          // A label and its value, not a sentence: the words around the type
          // name never have to agree with it grammatically.
          aria-label={`Attribute type: ${selected.type}`}
        >
          <span className="min-w-0 overflow-hidden text-ellipsis">
            {selected.type}
          </span>
        </Pill>
      )}
      {isMissing && (
        <p className="text-destructive text-sm">
          This attribute is no longer in the codebook. Choose another one.
        </p>
      )}
    </div>
  );
}
