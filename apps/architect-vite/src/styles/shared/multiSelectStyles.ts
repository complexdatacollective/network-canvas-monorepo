import { cva, cx } from "~/utils/cva";

// Shared styles for the sortable rule-row pattern used by MultiSelect
// (FieldArray-based) and the Validations UI. Both render a drag handle +
// middle cell(s) + delete affordance in a colored card; keeping the class
// strings in one module lets the two consumers stay in sync.
export const multiSelectContainerStyles = cx("flex w-full flex-col gap-4");

export const multiSelectRulesStyles = cx("flex flex-col gap-4");

export const multiSelectRuleVariants = cva({
	base: cx(
		"bg-sortable-background text-sortable-contrast",
		"flex items-center rounded-sm py-4",
		"transition-colors duration-200",
	),
	variants: {
		invalid: {
			true: "bg-destructive text-destructive-contrast",
			false: "",
		},
	},
	defaultVariants: {
		invalid: false,
	},
});

export const multiSelectRuleControlStyles = cx("flex grow-0 items-center px-4");

export const multiSelectRuleOptionsStyles = cx("flex flex-1 items-center px-4");

export const multiSelectRuleOptionStyles = cx("flex flex-1 basis-full items-start ml-4 first:ml-0");
