import cx from "classnames";
import type { ReactElement } from "react";
import { memo } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import RoundCheckbox from "./RoundCheckbox";

type BooleanOptionProps = {
	classes?: string | null;
	selected?: boolean;
	label: string | ReactElement;
	onClick?: () => void;
	customIcon?: ReactElement | null;
	negative?: boolean;
};

const BooleanOption = ({
	classes = null,
	selected = false,
	label,
	onClick = () => {},
	customIcon = null,
	negative = false,
}: BooleanOptionProps) => {
	const classNames = cx(
		"boolean-option",
		{ "boolean-option--selected": selected },
		{ "boolean-option--negative": negative },
		// { "boolean-option--collapsed": sizes && sizes.width < 235 },
		classes,
	);

	const renderLabel = () => {
		if (typeof label === "function") {
			return label;
		}

		return <Markdown label={label as string} className="form-field-inline-label" />;
	};

	return (
		<button
			type="button"
			className={classNames}
			onClick={onClick}
			aria-pressed={selected}
			style={{ position: "relative" }}
		>
			{customIcon || <RoundCheckbox checked={selected} negative={negative} />}
			{renderLabel()}
		</button>
	);
};

export default memo(BooleanOption);
