import { createContext, useContext } from 'react';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  DEFAULT_OPTION_WEIGHT,
  OrdinalSyntheticSchema,
} from '@codaco/protocol-validation';
import {
  ARRAY_ELEMENT,
  describeFieldWindow,
} from '~/components/Codebook/VariableSynthetic/schemaIntrospection';
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
  /** Whole sentence saying why the column cannot be edited, where it cannot. */
  disabledReason?: string;
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

  const disabled =
    optionValue === undefined || controller.disabledReason !== undefined;

  return (
    <InputField
      {...inputAttributes}
      className={className}
      // Named by position rather than by label: an option label is
      // researcher-authored markdown that may be empty or run to a paragraph,
      // and every row in this column needs a name that tells it from its
      // neighbours.
      aria-label={accessibleName ?? `Weight for option ${position}`}
      {...(controller.disabledReason === undefined
        ? {}
        : { title: controller.disabledReason })}
      // The weight an option carries when the table says nothing about it, so
      // an empty box reads as "drawn like the others" rather than as zero.
      placeholder={String(DEFAULT_OPTION_WEIGHT)}
      value={text}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
    />
  );
}
