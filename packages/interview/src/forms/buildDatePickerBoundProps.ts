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
 * - DatePicker forwards `parameters.min`/`parameters.max` verbatim, and ONLY
 *   authored bounds: with none authored, fresco-ui's DatePickerField
 *   deliberately leaves a full-resolution input unbounded (see 35ff5dfd1)
 *   rather than falling back to its 1920-to-today default window, and
 *   month/year resolutions render closed dropdown lists that can't accept an
 *   out-of-window typed value in the first place. Synthesizing a bound here
 *   would reject values the control accepts — and disagree with
 *   `@codaco/protocol-validation`'s contradiction analyser, which models an
 *   unbounded full-resolution DatePicker as contributing no interval.
 * - RelativeDatePicker pre-computes absolute bounds from
 *   `parameters.anchor`/`before`/`after`, defaulting to today and the shared
 *   before/after span — the same constants, and the same clamp onto the dates a
 *   picker can represent, that RelativeDatePickerField applies to its own native
 *   min/max attributes. An ABSENT `parameters` record gets the same default
 *   window as an empty one: RelativeDatePickerField destructures its defaults
 *   (before=180, after=0, anchor=today) whether or not the record exists, so
 *   the control constrains the participant either way, and the analyser's
 *   `dateWindowInterval` models the same absent-record default. Returning `{}`
 *   here would leave submission validation looser than both.
 *
 * Returns `{}` for any other component, or for a DatePicker with no authored
 * bounds.
 */
export function buildDatePickerBoundProps(
  field: BoundedField,
): Partial<ValidationPropsCatalogue> {
  const { component } = field;
  const parameters = field.parameters ?? {};

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
