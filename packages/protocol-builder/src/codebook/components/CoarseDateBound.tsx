import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { datePickerMonthOptions } from '@codaco/fresco-ui/form/fields/DatePicker';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import { DATE_RESOLUTION } from '@codaco/protocol-validation';

const messages = defineMessages({
  yearPart: {
    id: 'protocolBuilder.coarseDateBound.yearPart',
    defaultMessage: 'Year',
    description:
      'Names the year half of a bounding date that is written as a year and a month, for a screen reader that would otherwise hear the two halves as one field said twice.',
  },
  monthPart: {
    id: 'protocolBuilder.coarseDateBound.monthPart',
    defaultMessage: 'Month',
    description:
      'Names the month half of a bounding date that is written as a year and a month. Also the empty state of that dropdown.',
  },
});

/**
 * The two resolutions this control is for. A full date keeps the native date
 * input, which already writes `YYYY-MM-DD` and needs nothing from here.
 */
export type CoarseResolution = 'month' | 'year';

export type CoarseDateBoundProps = Readonly<{
  'resolution': CoarseResolution;
  /** The bound as the draft holds it, which is `''` when there is none. */
  'value': string;
  /** Replaces the bound. `undefined` clears it. */
  'onChange': (value: string | undefined) => void;
  'id'?: string;
  'name'?: string;
  'readOnly'?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}>;

/**
 * A bounding date at year or month resolution, as the researcher writes it.
 *
 * The year is TYPED, not chosen. A participant picks a year from a closed list
 * because a list is what an answer is chosen from, and the protocol says which
 * years are on it; a researcher is writing that list's edge, and the schema
 * takes any four-digit year — `datePickerParametersSchema` accepts 1000 to
 * 9999 at both coarse resolutions. Offered as a dropdown, the edge could only
 * ever be a fraction of that range, and a year outside the offered fraction —
 * imported from a protocol written elsewhere, and perfectly valid — showed as
 * an empty field, because a native select falls back to its placeholder when
 * nothing matches. So the bound was invisible, unreselectable, and still
 * stored. A text field shows whatever is held and lets any of it be written.
 *
 * The months stay a dropdown: there are twelve, they are named rather than
 * numbered, and the names have to come from the reader's own locale. They come
 * from the participant control's own table so the two cannot name the same
 * stored month differently.
 *
 * Nothing is dropped on the way through. A half-written month bound — a year
 * with no month, or a month with no year — is carried into the draft as it
 * stands and refused at the save, in the sentence that names the format. The
 * participant control instead reports an incomplete pair as no value at all,
 * which for a bound would read as a researcher deciding to have none.
 */
export default function CoarseDateBound({
  resolution,
  value,
  onChange,
  id,
  name,
  readOnly,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-required': required,
}: CoarseDateBoundProps) {
  const intl = useAppIntl();
  const { year, month } = boundParts(value);
  const yearPartId = id ? `${id}-year-part` : undefined;
  const monthPartId = id ? `${id}-month-part` : undefined;

  const yearField = (
    <InputField
      id={id}
      name={resolution === 'year' || !name ? name : `${name}-year`}
      value={year}
      // A year is digits, but not a quantity: no steppers to walk a thousand
      // years with, and no thousands separator to put a comma in one.
      inputMode="numeric"
      // The literal form the protocol stores, which is the same in every
      // language — the same value the refusal under this field names when what
      // is written is not in that form.
      placeholder={DATE_RESOLUTION.year.label}
      onChange={(next: string | undefined) =>
        onChange(boundFrom(resolution, next ?? '', month))
      }
      readOnly={readOnly}
      aria-labelledby={
        resolution === 'year'
          ? labelledBy
          : [labelledBy, yearPartId].filter(Boolean).join(' ') || undefined
      }
      aria-describedby={describedBy}
      aria-required={required}
      className="w-fit"
    />
  );

  if (resolution === 'year') return yearField;

  return (
    <div className="flex gap-2">
      {/* The field's own label names both halves at once ("Earliest date"),
          which a screen reader would read out twice with nothing to tell the
          two apart. These say which half is which, and are pointed at rather
          than nested so the visible label still comes first. */}
      {yearPartId && (
        <span id={yearPartId} className="sr-only">
          {intl.formatMessage(messages.yearPart)}
        </span>
      )}
      {monthPartId && (
        <span id={monthPartId} className="sr-only">
          {intl.formatMessage(messages.monthPart)}
        </span>
      )}
      {yearField}
      <NativeSelectField
        id={id ? `${id}-month` : undefined}
        name={name ? `${name}-month` : undefined}
        options={datePickerMonthOptions((date, options) =>
          intl.formatDate(date, options),
        )}
        placeholder={intl.formatMessage(messages.monthPart)}
        value={month}
        onChange={(next: string | number | undefined) =>
          onChange(
            boundFrom(resolution, year, next === undefined ? '' : String(next)),
          )
        }
        readOnly={readOnly}
        aria-labelledby={
          [labelledBy, monthPartId].filter(Boolean).join(' ') || undefined
        }
        aria-describedby={describedBy}
        aria-required={required}
        className="w-fit"
      />
    </div>
  );
}

/**
 * A held bound split at its separator, so both halves reach the control that
 * shows them.
 *
 * Split rather than matched against the form the schema wants: a bound that is
 * NOT in that form is the one case where being shown matters most, so the year
 * half of `4500-13` still appears in the year field rather than the whole
 * value disappearing behind a placeholder.
 */
const boundParts = (value: string): { year: string; month: string } => {
  const separator = value.indexOf('-');
  return separator === -1
    ? { year: value, month: '' }
    : { year: value.slice(0, separator), month: value.slice(separator + 1) };
};

/**
 * The bound these two halves make, or `undefined` where they make none.
 *
 * Only an empty PAIR is no bound at all. One half on its own is a bound
 * halfway written, and it is stored that way so that the refusal under the
 * field can say what is missing — rather than reading as a researcher who
 * decided the field needed no bound.
 */
const boundFrom = (
  resolution: CoarseResolution,
  year: string,
  month: string,
): string | undefined => {
  if (resolution === 'year') return year === '' ? undefined : year;
  if (year === '' && month === '') return undefined;
  return `${year}-${month}`;
};
