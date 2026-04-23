import { range } from "es-toolkit";
import { useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import { cx } from "~/utils/cva";

type ColorOption = {
	label: string;
	value: string;
};

type InputProps = {
	name?: string;
	value: string;
	onChange: (value: string) => void;
};

type MetaProps = {
	error?: string;
	invalid?: boolean;
	touched?: boolean;
};

type ColorPickerProps = {
	palette?: string;
	paletteRange?: number;
	options?: ColorOption[];
	input: InputProps;
	label?: string;
	fieldLabel?: string;
	hint?: React.ReactNode;
	required?: boolean;
	meta: MetaProps;
};

const asColorOption = (name: string): ColorOption => ({
	label: name,
	value: name,
});

const ColorPicker = ({
	palette,
	paletteRange = 0,
	options = [],
	input,
	label,
	fieldLabel,
	hint,
	required = false,
	meta,
}: ColorPickerProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;

	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	const colors = palette ? range(1, paletteRange).map((index) => asColorOption(`${palette}-${index}`)) : options;

	const anyLabel = fieldLabel ?? label ?? undefined;

	return (
		<BaseField
			id={id}
			name={input.name}
			label={anyLabel}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<div
				className={cx(
					"bg-surface-1 text-input-contrast rounded-t-lg p-[var(--space-sm)] pr-0 pb-0",
					showErrors && "border-destructive border-2",
				)}
			>
				<div className="flex flex-wrap">
					{colors.map((color) => {
						const selected = input.value === color.value;
						return (
							<button
								type="button"
								key={color.value}
								aria-label={`Select color ${color.label}`}
								aria-pressed={selected}
								onClick={() => input.onChange(color.value)}
								style={{ "--color": `hsl(var(--${color.value}))` } as React.CSSProperties}
								className={cx(
									"relative flex items-center justify-center overflow-hidden",
									"mr-[var(--space-sm)] mb-[var(--space-sm)]",
									"h-(--picker-size) w-(--picker-size) rounded-(--picker-size)",
									"cursor-pointer transition-colors duration-200",
									"after:m-(--picker-border-size) after:block after:h-[calc(var(--picker-size)-var(--picker-border-size)*2)] after:w-[calc(var(--picker-size)-var(--picker-border-size)*2)]",
									"after:rounded-(--picker-size) after:border-2 after:border-transparent after:bg-(--color)",
									"after:transition-colors after:duration-200",
									selected && "bg-selected after:border-surface-1",
								)}
							/>
						);
					})}
				</div>
			</div>
		</BaseField>
	);
};

export default ColorPicker;
