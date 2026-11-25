'use client';

import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { type ReactNode, useId } from 'react';

import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from '../../PresentationalText';
import {
  groupSpacingVariants,
  inputControlVariants,
  stateVariants,
} from '../../styles/controlVariants';
import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { useFormFeedback } from '../FormFeedbackListener';
import { getInputState } from '../utils/getInputState';
import { omitWidgetOnlyAria } from '../utils/omitWidgetOnlyAria';

export type OptionMappingRow = {
  id: string;
  label: PresentationalText;
  /** A short remark shown with the row's label, such as what an unmapped row falls back to. */
  note?: PresentationalText;
};
export type OptionMappingOption = {
  value: string;
  /** The tile's caption when `showOptionLabels` is set, and its accessible name. */
  label: string;
  /** An accessible name to use in place of `label`. */
  ariaLabel?: string;
};
/** One entry per mapped row; a row with no entry is unmapped. */
export type OptionMappingValue = { id: string; value: string }[];

type OptionMappingFieldProps<T extends OptionMappingOption> = Omit<
  CreateFormFieldProps<
    OptionMappingValue,
    'fieldset',
    {
      /** The things being mapped; each row is an independent radio group. */
      rows: OptionMappingRow[];
      /** The values a row can be mapped to, the same for every row. */
      options: readonly T[];
      /** Draws what a tile shows for one of the caller's own options. */
      renderOption: (option: T) => ReactNode;
      /** Called with the row the researcher changed and the value it now has. */
      onRowChange?: (rowId: string, value: T['value']) => void;
      /** Show each option's label under its tile. */
      showOptionLabels?: boolean;
      /**
       * Leave the row labels out. For a single row whose label would repeat
       * the field's own: its radio group takes the field's name instead.
       */
      rowLabelsHidden?: boolean;
      /**
       * Draw no container of its own. For a mapping placed inside a row that
       * is already a control surface.
       */
      bare?: boolean;
    }
  >,
  'onChange'
>;

/**
 * Maps each of a fixed set of rows to one of a fixed set of options.
 *
 * Every row is a radio group of tiles, and a caller draws what a tile shows,
 * so the options can be pictures (shapes, icons, colours) with their names
 * carried as accessible names. The chosen tile is marked by its own border
 * and tint, inside the control. Rows stack their label above their tiles in
 * a narrow container and put it in a column beside them in a wide one.
 */
export default function OptionMappingField<T extends OptionMappingOption>(
  props: OptionMappingFieldProps<T>,
) {
  const {
    id,
    className,
    name,
    rows,
    options,
    renderOption,
    onRowChange,
    showOptionLabels = false,
    rowLabelsHidden = false,
    bare = false,
    value,
    disabled,
    readOnly,
    ...rest
  } = props;

  // For one render the store can still hold the previous field's value.
  const current = Array.isArray(value) ? value : [];
  const headingId = useId();

  const { onOptionToggle } = useFormFeedback();

  // Base UI calls this only for the person's own choice in a row.
  const handleRowChange = (rowId: string, next: unknown) => {
    if (readOnly) return;
    const option = options.find((candidate) => candidate.value === next);
    if (option === undefined) return;
    onRowChange?.(rowId, option.value);
    onOptionToggle(true);
  };

  return (
    <div
      className={cx(
        '@container w-full',
        !bare && [
          'rounded border-2',
          inputControlVariants(),
          groupSpacingVariants({ size: 'md' }),
          'tablet-landscape:py-2 py-2',
          stateVariants({ state: getInputState(props) }),
        ],
      )}
    >
      <fieldset
        {...omitWidgetOnlyAria(rest)}
        // With the row labels hidden the one radio group carries the field's
        // name, so the fieldset around it stays unnamed.
        aria-label={rowLabelsHidden ? undefined : rest['aria-label']}
        aria-labelledby={rowLabelsHidden ? undefined : rest['aria-labelledby']}
        id={id}
        aria-invalid={rest['aria-invalid'] ?? undefined}
        className={cx('m-0 flex min-w-0 flex-col border-0 p-0', className)}
      >
        {rows.map((row, rowIndex) => (
          <div
            key={row.id}
            className={cx(
              'flex flex-col gap-2',
              !bare && 'py-3',
              'border-input-contrast/10 not-first:border-t-2',
              !rowLabelsHidden &&
                '@2xl:grid @2xl:grid-cols-[minmax(8rem,14rem)_1fr] @2xl:items-center @2xl:gap-4',
            )}
          >
            {!rowLabelsHidden && (
              <div className="flex flex-wrap items-baseline gap-x-3 @2xl:flex-col @2xl:items-start @2xl:gap-y-1">
                <span
                  id={`${headingId}-${rowIndex}`}
                  className="font-semibold"
                  {...presentationalTextProps(row.label)}
                >
                  {presentationalTextValue(row.label)}
                </span>
                {row.note !== undefined && (
                  <span
                    id={`${headingId}-${rowIndex}-note`}
                    className="text-sm text-current/70"
                    {...presentationalTextProps(row.note)}
                  >
                    {presentationalTextValue(row.note)}
                  </span>
                )}
              </div>
            )}
            <RadioGroup
              value={current.find((entry) => entry.id === row.id)?.value ?? ''}
              onValueChange={(next) => handleRowChange(row.id, next)}
              disabled={disabled}
              readOnly={readOnly}
              name={name ? `${name}.${row.id}` : undefined}
              aria-required={rest['aria-required'] || undefined}
              aria-label={rowLabelsHidden ? rest['aria-label'] : undefined}
              aria-labelledby={
                rowLabelsHidden
                  ? rest['aria-labelledby']
                  : `${headingId}-${rowIndex}`
              }
              aria-describedby={
                rowLabelsHidden || row.note === undefined
                  ? undefined
                  : `${headingId}-${rowIndex}-note`
              }
              // The tiles' own padding stands them off the label; the negative
              // margin lines the first tile's content up with it.
              className="-mx-1.5 flex flex-wrap gap-1"
            >
              {options.map((option) => (
                <Radio.Root
                  key={option.value}
                  value={option.value}
                  nativeButton
                  render={
                    <button
                      type="button"
                      aria-label={option.ariaLabel ?? option.label}
                    />
                  }
                  className={cx(
                    'focusable flex flex-col items-center gap-1 rounded-sm border-2 border-transparent p-1.5',
                    'transition-colors duration-200',
                    'data-checked:border-selected data-checked:bg-selected/20',
                    showOptionLabels && 'w-24',
                    disabled
                      ? 'cursor-not-allowed opacity-50'
                      : readOnly
                        ? 'cursor-default'
                        : 'hover:bg-input-contrast/5 data-checked:hover:bg-selected/20 cursor-pointer',
                  )}
                >
                  {renderOption(option)}
                  {showOptionLabels && (
                    <span
                      aria-hidden
                      className="w-full text-center text-xs leading-4 wrap-break-word"
                    >
                      {option.label}
                    </span>
                  )}
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
