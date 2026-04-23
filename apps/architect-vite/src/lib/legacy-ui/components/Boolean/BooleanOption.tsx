import type { ReactElement } from "react";
import { memo } from "react";
import Markdown from "~/components/Form/Fields/Markdown";
import { cva, cx } from "~/utils/cva";
import RoundCheckbox from "./RoundCheckbox";

const booleanOptionVariants = cva({
	base: cx(
		"relative flex w-full flex-1 items-center gap-3",
		"rounded border-2 px-4 py-3",
		"bg-input text-input-contrast",
		"cursor-pointer text-left",
		"transition-[transform,box-shadow,border-color] duration-150",
		"elevation-low",
		"hover:-translate-y-0.5 hover:elevation-medium",
		"active:translate-y-0.5 active:shadow-none",
		"focusable",
	),
	variants: {
		selected: {
			true: "",
			false: "border-transparent",
		},
		negative: {
			true: "",
			false: "",
		},
	},
	compoundVariants: [
		{ selected: true, negative: false, class: "border-input-active" },
		{ selected: true, negative: true, class: "border-destructive" },
	],
	defaultVariants: {
		selected: false,
		negative: false,
	},
});

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
		return <Markdown label={label as string} className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />;
	};

	return (
		<button
			type="button"
			className={cx(booleanOptionVariants({ selected, negative }), classes)}
			onClick={onClick}
			aria-pressed={selected}
		>
			{customIcon || <RoundCheckbox checked={selected} negative={negative} />}
			{renderLabel()}
		</button>
	);
};

export default memo(BooleanOption);
