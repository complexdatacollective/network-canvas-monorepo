import { cva, cx } from "~/utils/cva";
import Icon from "../Icon";

const roundCheckboxVariants = cva({
	base: cx(
		"inline-flex shrink-0 items-center justify-center",
		"aspect-square h-8 rounded-full",
		"border-2 border-input-contrast/40",
		"transition-[background-color,border-color] duration-200",
		"[&_svg]:size-4 [&_svg]:opacity-0 [&_svg]:transition-opacity [&_svg]:duration-200",
	),
	variants: {
		checked: {
			true: "border-transparent [&_svg]:opacity-100",
			false: "bg-transparent",
		},
		negative: {
			true: "",
			false: "",
		},
	},
	compoundVariants: [
		{ checked: true, negative: false, class: "bg-input-active" },
		{ checked: true, negative: true, class: "bg-destructive" },
	],
	defaultVariants: {
		checked: false,
		negative: false,
	},
});

type RoundCheckboxProps = {
	checked?: boolean;
	negative?: boolean;
};

const RoundCheckbox = ({ checked = false, negative = false }: RoundCheckboxProps) => (
	<div className={cx(roundCheckboxVariants({ checked, negative }))}>
		<Icon name={negative ? "cross" : "tick"} color="white" />
	</div>
);

export default RoundCheckbox;
