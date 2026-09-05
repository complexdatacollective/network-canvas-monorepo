'use client';

import { RadioGroup } from '@base-ui/react/radio-group';
import { useId, useState } from 'react';

import {
  groupSpacingVariants,
  inputControlVariants,
  stateVariants,
} from '../../styles/controlVariants';
import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import { omitAriaReadOnly } from '../utils/omitAriaReadOnly';
import { RadioItem } from './RadioGroup';

export type RadioMatrixRow = { id: string; label: string };
export type RadioMatrixOption = { value: string; label: string };
/** One entry per row, recording the option selected for that row. */
export type RadioMatrixValue = { id: string; value: string }[];

type RadioMatrixFieldProps = CreateFormFieldProps<
  RadioMatrixValue,
  'fieldset',
  {
    /** One row per subject; each row is an independent radio group. */
    rows: RadioMatrixRow[];
    /** Shared columns (the radio choices) offered for every row. */
    options: RadioMatrixOption[];
    /** Option pre-selected for rows the user has not explicitly answered. */
    defaultOption?: string;
    /** Optional header shown above the row-label column (wide layout only). */
    rowHeader?: string;
  }
>;

function rowValue(
  value: RadioMatrixValue | undefined,
  rowId: string,
  defaultOption: string | undefined,
): string {
  return (
    value?.find((entry) => entry.id === rowId)?.value ?? defaultOption ?? ''
  );
}

export default function RadioMatrixField(props: RadioMatrixFieldProps) {
  const {
    id,
    className,
    name,
    rows,
    options,
    defaultOption,
    rowHeader,
    value,
    onChange,
    disabled,
    readOnly,
    ...rest
  } = props;

  const isControlled = onChange !== undefined;
  const [internal, setInternal] = useState<RadioMatrixValue>(() =>
    defaultOption !== undefined
      ? rows.map((row) => ({ id: row.id, value: defaultOption }))
      : [],
  );
  // Rendering only: for one render the store can still hold the previous
  // field's value (see the render-tolerance contract on `useField`), and
  // anything but a row list renders as unanswered.
  const current = isControlled ? (Array.isArray(value) ? value : []) : internal;

  const handleRowChange = (rowId: string, next: string) => {
    if (readOnly) return;
    // Emit one entry per row that has a value: the changed row, any
    // already-answered row, and — when configured — unanswered rows falling back
    // to the default. Rows with neither an answer nor a default are omitted
    // rather than serialized with an empty-string value.
    const nextValue: RadioMatrixValue = rows.flatMap((row) => {
      if (row.id === rowId) return [{ id: row.id, value: next }];
      const existing = current.find((entry) => entry.id === row.id)?.value;
      if (existing !== undefined) return [{ id: row.id, value: existing }];
      if (defaultOption !== undefined) {
        return [{ id: row.id, value: defaultOption }];
      }
      return [];
    });
    if (isControlled) onChange(nextValue);
    else setInternal(nextValue);
  };

  const headingId = useId();
  // Preserve useful space for row labels while letting the response columns
  // share the rest of a wide container. Each response column has enough room
  // for a short phrase before wrapping; below that combined minimum the field
  // uses its stacked layout instead.
  const gridTemplateColumns = `minmax(12rem, 1fr) repeat(${String(
    options.length,
  )}, minmax(10rem, 0.5fr))`;

  return (
    <div
      className={cx(
        '@container w-full',
        'rounded border-2',
        inputControlVariants(),
        groupSpacingVariants({ size: 'md' }),
        stateVariants({ state: getInputState(props) }),
      )}
    >
      <fieldset
        // A `<fieldset>` is `role="group"`, which does not allow
        // `aria-readonly`. Each row's radio group carries the state instead.
        {...omitAriaReadOnly(rest)}
        id={id}
        aria-invalid={rest['aria-invalid'] ?? undefined}
        className={cx(
          'm-0 min-w-0 border-0 p-0',
          'flex w-full flex-col gap-5',
          '@3xl:grid @3xl:items-center @3xl:gap-x-4 @3xl:gap-y-3',
          className,
        )}
        style={{ gridTemplateColumns }}
      >
        {/* Column headers — visible only in the wide grid layout. Each radio
            also names itself, so the headers are decorative for assistive tech. */}
        <div aria-hidden className="hidden @3xl:block">
          {rowHeader}
        </div>
        {options.map((option) => (
          <div
            key={option.value}
            aria-hidden
            className="hidden text-center text-sm font-semibold @3xl:block"
          >
            {option.label}
          </div>
        ))}

        {rows.map((row) => (
          <div key={row.id} className="@3xl:contents">
            <div
              id={`${headingId}-${row.id}`}
              className="font-semibold @max-3xl:mb-2 @3xl:mb-0 @3xl:font-normal"
            >
              {row.label}
            </div>
            <RadioGroup
              value={rowValue(current, row.id, defaultOption)}
              onValueChange={(next) => handleRowChange(row.id, next)}
              disabled={disabled}
              readOnly={readOnly}
              name={name ? `${name}.${row.id}` : undefined}
              aria-labelledby={`${headingId}-${row.id}`}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 @3xl:contents"
            >
              {options.map((option) => (
                <RadioItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  disabled={disabled}
                  readOnly={readOnly}
                  className="@3xl:justify-center @3xl:gap-0"
                  labelClassName="@3xl:sr-only"
                />
              ))}
            </RadioGroup>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
