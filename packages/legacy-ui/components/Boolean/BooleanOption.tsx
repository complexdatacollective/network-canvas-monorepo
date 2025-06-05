import cx from "classnames";
import type { ReactNode } from "react";
import { memo } from "react";
import Markdown from "../Fields/Markdown";
import RoundCheckbox from "./RoundCheckbox";

interface BooleanOptionProps {
	classes?: string | null;
	selected?: boolean;
	label: string | (() => ReactNode);
	onClick?: () => void;
	customIcon?: (() => ReactNode) | null;
	negative?: boolean;
}

const BooleanOption = ({
	classes = null,
	selected = false,
	label,
	onClick = () => {},
	customIcon = null,
	negative = false,
}: BooleanOptionProps) => {
	// const [resizeListener, sizes] = useResizeAware();
	const sizes = { width: null, height: null }; // Placeholder for resize-aware functionality

	const classNames = cx(
		"boolean-option",
		{ "boolean-option--selected": selected },
		{ "boolean-option--negative": negative },
		{ "boolean-option--collapsed": sizes && sizes.width < 235 },
		classes,
	);

	const renderLabel = () => {
		if (typeof label === "function") {
			return label();
		}

		return <Markdown label={label} className="form-field-inline-label" />;
	};

	return (
		<div className={classNames} onClick={onClick} style={{ position: "relative" }}>
			{/* {resizeListener} */}
			{customIcon || <RoundCheckbox checked={selected} negative={negative} />}
			{renderLabel()}
		</div>
	);
};

export default memo(BooleanOption);
