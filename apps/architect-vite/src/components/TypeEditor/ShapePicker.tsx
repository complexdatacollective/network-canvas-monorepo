import cx from "classnames";
import Icon from "~/lib/legacy-ui/components/Icon";

const SHAPES = [
	{ value: "circle", label: "Circle" },
	{ value: "square", label: "Square" },
	{ value: "diamond", label: "Diamond" },
] as const;

type ShapePickerProps = {
	input: {
		value: string;
		onChange: (value: string) => void;
	};
	meta: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	small?: boolean;
};

const ShapeIcon = ({ shape, size }: { shape: string; size: number }) => {
	switch (shape) {
		case "circle":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Circle shape">
					<circle cx="12" cy="12" r="10" fill="currentColor" />
				</svg>
			);
		case "square":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Square shape">
					<rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" />
				</svg>
			);
		case "diamond":
			return (
				<svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Diamond shape">
					<rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" transform="rotate(45 12 12)" />
				</svg>
			);
		default:
			return null;
	}
};

const ShapePicker = ({ input, meta: { error, invalid, touched }, small }: ShapePickerProps) => {
	const iconSize = small ? 16 : 24;
	const showError = invalid && touched && error;

	return (
		<div className="form-field-container">
			<div
				className={cx("form-fields-shape-picker", {
					"form-fields-shape-picker--has-error": showError,
				})}
			>
				<div className="form-fields-shape-picker__shapes">
					{SHAPES.map(({ value, label }) => (
						<button
							key={value}
							type="button"
							onClick={() => input.onChange(value)}
							className={cx("form-fields-shape-picker__shape", `form-fields-shape-picker__shape--${value}`, {
								"form-fields-shape-picker__shape--selected": input.value === value,
							})}
							title={label}
							aria-label={`Select shape ${label}`}
							aria-pressed={input.value === value}
						>
							<ShapeIcon shape={value} size={iconSize} />
							{!small && <span className="form-fields-shape-picker__label">{label}</span>}
						</button>
					))}
				</div>
				{showError && (
					<div className="form-fields-shape-picker__error">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default ShapePicker;
