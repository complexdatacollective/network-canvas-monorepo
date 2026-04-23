import { useRef } from "react";
import { v4 as uuid } from "uuid";
import { controlLabelVariants, groupOptionVariants, smallSizeVariants } from "~/styles/shared/controlVariants";
import { compose, cva, cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";

const radioVariants = compose(
	smallSizeVariants,
	cva({
		base: cx(
			"focusable aspect-square shrink-0 appearance-none",
			"rounded-full border-2 border-input-contrast/30 bg-input",
			"transition-colors duration-200",
			// Filled inner dot is rendered via a radial gradient that only activates when checked.
			"checked:bg-primary checked:border-primary",
			"checked:bg-[radial-gradient(circle,var(--color-input)_35%,transparent_40%)]",
			"disabled:opacity-50 disabled:cursor-not-allowed",
		),
	}),
);

type RadioProps = {
	label?: React.ReactNode;
	fieldLabel?: string;
	className?: string;
	disabled?: boolean;
	input: {
		name?: string;
		value?: unknown;
		onChange?: (value: unknown) => void;
		[key: string]: unknown;
	};
} & Record<string, unknown>;

const Radio = ({ label, className = "", input, disabled = false, fieldLabel, ...rest }: RadioProps) => {
	const id = useRef(uuid());

	const { name, value, onChange, ...inputRest } = input;

	return (
		<label className={cx(groupOptionVariants({ disabled }), className)} htmlFor={id.current}>
			<input
				type="radio"
				id={id.current}
				name={name}
				// input.checked is only provided by redux form if type="checkbox" or type="radio" is
				// provided to <Field />, so for the case that it isn't we can rely on the more reliable
				// input.value
				checked={!!value}
				onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked)}
				disabled={disabled}
				{...(inputRest as Record<string, unknown>)}
				{...(rest as Record<string, unknown>)}
				className={radioVariants()}
			/>
			{label &&
				(typeof label === "string" ? (
					<span className={cx(controlLabelVariants(), "cursor-[inherit]", disabled && "opacity-50")}>
						<MarkdownLabel inline label={label} />
					</span>
				) : (
					<div className="w-12 h-12">{label}</div>
				))}
		</label>
	);
};

export default Radio;
