import { memo, type ReactElement } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import { cx } from "~/utils/cva";
import RoundCheckbox from "./RoundCheckbox";

type BooleanOptionProps = {
	classes?: string | null;
	selected?: boolean;
	label: string | ReactElement | (() => ReactElement);
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
	const renderLabel = () => {
		if (typeof label === "function") {
			return label();
		}
		return <Markdown label={label as string} className="form-field-inline-label" />;
	};

	return (
		<button
			type="button"
			className={cx(
				"clickable relative cursor-pointer",
				"inline-flex items-center w-full grow basis-full",
				"border-2 border-solid border-transparent",
				"p-(--space-md) rounded",
				"mr-(--space-xs) ml-0 last:mr-0",
				"bg-input text-input-foreground",
				selected && (negative ? "border-error" : "border-input-active"),
				classes,
			)}
			onClick={onClick}
			aria-pressed={selected}
		>
			{customIcon || <RoundCheckbox checked={selected} negative={negative} />}
			{renderLabel()}
		</button>
	);
};

export default memo(BooleanOption);
