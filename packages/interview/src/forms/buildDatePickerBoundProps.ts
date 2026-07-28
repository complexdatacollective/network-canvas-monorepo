import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import { todayYmd } from '@codaco/fresco-ui/form/utils/ymd';
import type { ComponentType } from '@codaco/protocol-validation';
import {
  dateWithinPickerRange,
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

type BoundedField = {
  component?: ComponentType;
  parameters?: Record<string, unknown>;
};

/**
 * Derive a datetime field's hard `min`/`max` validation bounds from its
 * DatePicker/RelativeDatePicker PARAMETERS, not from the variable's
 * `validation` object. Extracted from useProtocolForm so the synthetic-data
 * conformance test can assert against exactly the bounds the interview
 * validates submissions with.
 *
 * - DatePicker forwards `parameters.min`/`parameters.max` verbatim.
 * - RelativeDatePicker pre-computes absolute bounds from
 *   `parameters.anchor`/`before`/`after`, defaulting to today and the shared
 *   before/after span — the same constants, and the same clamp onto the dates a
 *   picker can represent, that RelativeDatePickerField applies to its own native
 *   min/max attributes.
 *
 * Returns `{}` for any other component, or when the field has no
 * `parameters` object at all (matching DatePickerField/RelativeDatePickerField,
 * which only receive computed `min`/`max` props when this function is called
 * with one).
 */
export function buildDatePickerBoundProps(
  field: BoundedField,
): Partial<ValidationPropsCatalogue> {
  const { component, parameters } = field;
  if (!parameters) return {};

  if (component === 'DatePicker') {
    const { min, max } = parameters;
    return {
      ...(typeof min === 'string' ? { min } : {}),
      ...(typeof max === 'string' ? { max } : {}),
    };
  }

  if (component === 'RelativeDatePicker') {
    const { anchor, before, after } = parameters;
    const anchorYmd = typeof anchor === 'string' ? anchor : todayYmd();
    const beforeDays =
      typeof before === 'number' ? before : RELATIVE_DATE_PICKER_DEFAULT_BEFORE;
    const afterDays =
      typeof after === 'number' ? after : RELATIVE_DATE_PICKER_DEFAULT_AFTER;
    return {
      min: dateWithinPickerRange(anchorYmd, -beforeDays),
      max: dateWithinPickerRange(anchorYmd, afterDays),
    };
  }

  return {};
}
