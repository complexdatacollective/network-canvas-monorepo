import { createContext, useContext } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  DEFAULT_OPTION_WEIGHT,
  OrdinalSyntheticSchema,
} from '@codaco/protocol-validation';
import {
  ARRAY_ELEMENT,
  describeFieldWindow,
} from '~/components/Synthetic/schemaIntrospection';
import {
  type NumericWindow,
  useNumericDraft,
} from '~/components/Synthetic/useNumericDraft';

/**
 * The option-weight column the options editor grows while a variable's
 * "Synthetic data" section is the disclosure that asked for it.
 *
 * The section is the master switch (spec, "Option weights reveal"): while it
 * is expanded, or the variable already carries authored synthetic content, the
 * existing options editor shows one weight per option. Collapsed and
 * unauthored, there is no controller in context and every option row renders
 * exactly what it rendered before this existed.
 *
 * Weights are a property of the VARIABLE's synthetic block, never of the
 * option objects — the controller writes them into `synthetic.optionWeights`,
 * keyed by option value, exactly as the schema defines. The options editor
 * only draws the column.
 */

/** The window one weight may take, read out of the schema that bounds it. */
const WEIGHT_WINDOW: NumericWindow = describeFieldWindow(
  OrdinalSyntheticSchema,
  ['optionWeights', ARRAY_ELEMENT, 'weight'],
) ?? { exclusiveMin: false, exclusiveMax: false, integer: false };

export type OptionWeightsController = {
  /** Whether the column is on screen at all. */
  revealed: boolean;
  /** The authored weight for one option value; `undefined` while unauthored. */
  weightFor: (value: string | number | boolean) => number | undefined;
  /** Author, or clear with `undefined`, one option's weight. */
  onWeightChange: (
    value: string | number | boolean,
    weight: number | undefined,
  ) => void;
};

export const OptionWeightsContext =
  createContext<OptionWeightsController | null>(null);

/**
 * The controller for the options editor in scope, or `null` where no synthetic
 * section is disclosing one. A `null` controller is the "render exactly as
 * before" case, and is what every existing call site of the options editor
 * gets.
 */
export const useOptionWeights = (): OptionWeightsController | null =>
  useContext(OptionWeightsContext);

/**
 * What the column is called wherever it is named — the locked list's header
 * cell, and the editable list's per-row label. One home, so two surfaces
 * cannot come to call the same column two things.
 */
export const WEIGHT_COLUMN_LABEL = 'Weight';

export type OptionWeightCellProps = {
  /** The option's own value, which is what a weight is keyed by. */
  optionValue: string | number | boolean | undefined;
  /** The option's position in the list, for the control's accessible name. */
  position: number;
  /**
   * A name for the control where the position is not the clearest one — the
   * inline list names each weight by the option value it belongs to, because
   * it has no surrounding row to place it in.
   */
  accessibleName?: string;
  /**
   * Draw the column's name beside the box.
   *
   * For a list whose rows carry no header of their own. A revealed column of
   * bare numeric boxes is a control with no visible label or instruction
   * (WCAG 3.3.2) however well it is named for assistive technology — and the
   * researcher meeting it has just come from a disclosure somewhere else on
   * the page.
   */
  labelled?: boolean;
  className?: string;
};

/**
 * One option's weight, as a cell inside its row.
 *
 * Renders nothing at all unless a controller is disclosing the column, which
 * is what keeps a collapsed, unauthored options editor pixel-identical to what
 * it was.
 */
export function OptionWeightCell({
  optionValue,
  position,
  accessibleName,
  labelled = false,
  className,
}: OptionWeightCellProps) {
  const controller = useOptionWeights();
  const weight =
    controller && optionValue !== undefined
      ? controller.weightFor(optionValue)
      : undefined;

  const { text, onChange, onBlur, inputAttributes } = useNumericDraft({
    value: weight,
    window: WEIGHT_WINDOW,
    clearable: true,
    onCommit: (next) => {
      if (optionValue === undefined) return;
      controller?.onWeightChange(optionValue, next);
    },
  });

  if (!controller?.revealed) return null;

  const field = (
    <InputField
      {...inputAttributes}
      className={className}
      // Named by position rather than by label: an option label is
      // researcher-authored markdown that may be empty or run to a paragraph,
      // and every row in this column needs a name that tells it from its
      // neighbours. It opens with the visible word beside it, so the two
      // agree (WCAG "Label in Name").
      aria-label={
        accessibleName ?? `${WEIGHT_COLUMN_LABEL} for option ${position}`
      }
      // The weight an option carries when the table says nothing about it, so
      // an empty box reads as "drawn like the others" rather than as zero.
      placeholder={String(DEFAULT_OPTION_WEIGHT)}
      value={text}
      onChange={onChange}
      onBlur={onBlur}
      disabled={optionValue === undefined}
    />
  );

  if (!labelled) return field;

  return (
    <span className="flex shrink-0 items-center gap-2">
      {/*
        The control's own accessible name already opens with this word, so
        announcing it twice would be noise; sighted users are who it is for.
      */}
      <span aria-hidden className="text-text/70 text-sm">
        {WEIGHT_COLUMN_LABEL}
      </span>
      {field}
    </span>
  );
}
