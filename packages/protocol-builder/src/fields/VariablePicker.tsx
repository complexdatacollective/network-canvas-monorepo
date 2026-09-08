import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Pill from '@codaco/fresco-ui/Pill';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableType } from '@codaco/protocol-validation';

export type VariablePickerOption = Readonly<{
  value: string;
  label: string;
  type?: VariableType;
  /**
   * Whether this attribute can be chosen here. Absent means it can.
   *
   * An option the caller has ruled out is not the same thing as one the caller
   * never mentioned: it is shown when the field already holds it, and named
   * for what is wrong with it, rather than reported as a reference the
   * codebook has lost.
   */
  usable?: boolean;
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

const messages = defineMessages({
  placeholder: {
    id: 'protocolBuilder.variablePicker.placeholder',
    defaultMessage: 'Select an attribute…',
    description:
      'Placeholder in the select a researcher chooses one codebook attribute from, shown while nothing has been chosen. An attribute is a variable the protocol’s codebook defines for a node type, an edge type or the interview participant.',
  },
  emptyState: {
    id: 'protocolBuilder.variablePicker.emptyState',
    defaultMessage: 'No attributes are available to choose from.',
    description:
      'Shown in place of the select when nothing can be picked — the caller offered no attributes at all. An attribute is a variable the protocol’s codebook defines. Callers that can say something more specific pass their own sentence instead.',
  },
  /**
   * Names an attribute the researcher has since deleted.
   *
   * A stored id that the codebook no longer describes is kept and shown rather
   * than quietly dropped: blanking the control would hide the very reference
   * the researcher has to resolve, and would then write the blank back over
   * it.
   */
  missingOptionLabel: {
    id: 'protocolBuilder.variablePicker.missingOptionLabel',
    defaultMessage:
      '{attributeId} — this attribute is no longer in the codebook',
    description:
      'Name of the one option standing for an attribute the protocol’s codebook no longer defines. attributeId is the raw stored identifier — there is no name left to show, because the definition it would have come from has been deleted.',
  },
  /**
   * Names an attribute that is still in the codebook and still cannot carry a
   * rule — a layout attribute, answered with a point nothing can be compared
   * against.
   *
   * Its own wording, because the researcher's next move differs: a deleted
   * attribute is one to find or recreate, and this one is sitting where they
   * left it. Told it was "no longer in the codebook", they would go looking
   * for something that never went anywhere.
   */
  unusableOptionLabel: {
    id: 'protocolBuilder.variablePicker.unusableOptionLabel',
    defaultMessage: '{attributeName} — cannot be used in a rule',
    description:
      'Name of the one option standing for an attribute that is still in the protocol’s codebook and still cannot carry a rule, such as one answered with a map position. attributeName is the researcher’s own name for it, from the codebook, and is not translated.',
  },
  missingAttribute: {
    id: 'protocolBuilder.variablePicker.missingAttribute',
    defaultMessage:
      'This attribute is no longer in the codebook. Choose another one.',
    description:
      'Shown under the select when the attribute a researcher’s stored choice names has been deleted from the protocol’s codebook, so the choice has to be made again.',
  },
  unusableAttribute: {
    id: 'protocolBuilder.variablePicker.unusableAttribute',
    defaultMessage:
      'This attribute cannot be used in a rule. Choose another one.',
    description:
      'Shown under the select when the attribute a researcher’s stored choice names is still in the codebook but cannot carry a rule. Worded apart from the deleted-attribute sentence on purpose: this attribute is still where the researcher left it.',
  },
  attributeTypeLabel: {
    id: 'protocolBuilder.variablePicker.attributeTypeLabel',
    defaultMessage: 'Attribute type: {attributeType}',
    description:
      'Accessible name of the badge stating what kind of answer the chosen attribute records. attributeType is a protocol schema token such as "number", "text" or "categorical", and is shown as it is stored rather than translated. Read as a label and its value, not as a sentence.',
  },
});

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
  emptyMessage,
  disabled = false,
  readOnly = false,
  className,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: VariablePickerProps) {
  const intl = useAppIntl();
  const selected = options.find((option) => option.value === value);
  const isMissing =
    value !== undefined && value !== '' && selected === undefined;
  const isUnusable = selected?.usable === false;

  const selectOptions = useMemo(() => {
    const listed = options.flatMap((option) =>
      option.usable === false
        ? []
        : [{ value: option.value, label: option.label }],
    );
    // The choice the field already holds is offered so the control can show it
    // as selected — a native select falls back to its placeholder otherwise,
    // showing nothing chosen over a rule that is pointed somewhere, and saving
    // the blank back. It goes last, so it never sits among the attributes a
    // rule can actually be built on.
    if (isMissing && value !== undefined) {
      return [
        ...listed,
        {
          value,
          label: intl.formatMessage(messages.missingOptionLabel, {
            attributeId: value,
          }),
        },
      ];
    }
    if (isUnusable && selected !== undefined) {
      return [
        ...listed,
        {
          value: selected.value,
          label: intl.formatMessage(messages.unusableOptionLabel, {
            attributeName: selected.label,
          }),
        },
      ];
    }
    return listed;
  }, [intl, isMissing, isUnusable, options, selected, value]);

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
          {emptyMessage ?? intl.formatMessage(messages.emptyState)}
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
        placeholder={intl.formatMessage(messages.placeholder)}
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
          aria-label={intl.formatMessage(messages.attributeTypeLabel, {
            attributeType: selected.type,
          })}
        >
          <span className="min-w-0 overflow-hidden text-ellipsis">
            {selected.type}
          </span>
        </Pill>
      )}
      {(isMissing || isUnusable) && (
        <p className="text-destructive text-sm">
          {intl.formatMessage(
            isMissing ? messages.missingAttribute : messages.unusableAttribute,
          )}
        </p>
      )}
    </div>
  );
}
