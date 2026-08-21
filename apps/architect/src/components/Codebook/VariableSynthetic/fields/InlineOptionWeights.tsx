import { OptionWeightCell } from '~/components/Options/optionWeights';

/**
 * The option-weight column, drawn inside the synthetic section itself.
 *
 * The reveal's home is the options editor beside the variable (spec, "Option
 * weights reveal"), and this is what a surface with NO options editor shows
 * instead — the codebook's type editor lists a type's attributes without their
 * option lists. Both draw the same control over the same controller, so the
 * two surfaces cannot disagree about what a weight is or what bounds it.
 */

export type InlineOptionWeightsProps = {
  options: readonly { value: string | number | boolean; label?: string }[];
};

export function InlineOptionWeights({ options }: InlineOptionWeightsProps) {
  if (options.length === 0) {
    return (
      <p className="text-text/70 mb-7 text-sm">
        This attribute has no options yet, so there is nothing to weight.
      </p>
    );
  }

  return (
    <div className="mb-7">
      <p className="mb-1 font-semibold">Option weights</p>
      <p className="text-text/70 mb-3 text-sm">
        Weights are relative: an option left empty is drawn as often as the
        others.
      </p>
      <ul className="flex list-none flex-col gap-2 p-0">
        {options.map((option, index) => (
          <li
            key={String(option.value)}
            className="flex items-center justify-between gap-3"
          >
            <span className="min-w-0 flex-1 truncate">
              {option.label ?? String(option.value)}
            </span>
            <OptionWeightCell
              optionValue={option.value}
              position={index + 1}
              accessibleName={`Weight for ${String(option.value)}`}
              className="w-24 shrink-0"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
