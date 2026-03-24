import cx from "classnames";
import type { NodeShape } from "~/components/Node/Node";
import Node from "~/components/Node/Node";
import Icon from "~/lib/legacy-ui/components/Icon";

const SHAPES: Array<{ value: NodeShape; label: string }> = [
	{ value: "circle", label: "Circle" },
	{ value: "square", label: "Square" },
	{ value: "diamond", label: "Diamond" },
];

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
	nodeColor?: string;
};

const ShapePicker = ({
	input,
	meta: { error, invalid, touched },
	small,
	nodeColor = "node-color-seq-1",
}: ShapePickerProps) => {
	const nodeSize = small ? "xxs" : "xs";
	const showError = invalid && touched && error;

	return (
		<div className="form-field-container">
			<div className={cx("form-fields-shape-picker", { "form-fields-shape-picker--has-error": showError })}>
				<div className="form-fields-shape-picker__shapes">
					{SHAPES.map(({ value, label }) => (
						<div
							key={value}
							className={cx("form-fields-shape-picker__shape", {
								"form-fields-shape-picker__shape--selected": input.value === value,
							})}
							onClick={() => input.onChange(value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") input.onChange(value);
							}}
							role="radio"
							aria-checked={input.value === value}
							aria-label={`Select shape ${label}`}
							tabIndex={0}
						>
							<Node label="" shape={value} color={nodeColor} size={nodeSize} disabled />
							{!small && <span className="form-fields-shape-picker__label">{label}</span>}
						</div>
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
