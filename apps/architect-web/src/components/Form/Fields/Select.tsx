import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";

type SelectOption = {
	value: string;
	label: string;
};

type SelectProps = {
	className?: string;
	options?: SelectOption[];
	input?: {
		name?: string;
		value?: string | null;
		onChange?: (value: string) => void;
		onBlur?: (value: string | null) => void;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	placeholder?: string;
	isDisabled?: boolean;
};

const Select = ({
	className,
	options = [],
	input,
	meta = {},
	label = null,
	placeholder = "Select an option",
	isDisabled = false,
}: SelectProps) => {
	if (!input) return null;

	const { value, onChange, onBlur, name } = input;
	const { invalid, error, touched } = meta;
	const hasError = !!(invalid && touched && error);

	const handleValueChange = (next: string | null) => {
		if (next === null) return;
		onChange?.(next);
		onBlur?.(next);
	};

	return (
		<div className={cx("flex flex-col", className)}>
			{label && <h4>{label}</h4>}
			<BaseSelect.Root
				value={value ?? null}
				onValueChange={handleValueChange}
				disabled={isDisabled}
				name={name}
				items={options}
			>
				<BaseSelect.Trigger
					className={cx(
						"flex w-full cursor-pointer items-center gap-2 rounded-sm border bg-surface-1 px-3 py-2 text-left text-base text-foreground",
						"data-disabled:cursor-not-allowed data-disabled:opacity-60",
						hasError ? "border-error border-2 rounded-b-none" : "border-surface-2",
					)}
				>
					<BaseSelect.Value className="min-w-0 flex-1 truncate">
						{(currentValue: string | null) => {
							if (currentValue === null || currentValue === undefined || currentValue === "") {
								return <span className="text-surface-2-foreground italic">{placeholder}</span>;
							}
							const option = options.find((o) => o.value === currentValue);
							return option?.label ?? currentValue;
						}}
					</BaseSelect.Value>
					<BaseSelect.Icon className="shrink-0">
						<ChevronDown size={16} className="text-surface-2-foreground" />
					</BaseSelect.Icon>
				</BaseSelect.Trigger>
				<BaseSelect.Portal>
					<BaseSelect.Positioner align="start" sideOffset={4} alignItemWithTrigger={false} className="z-(--z-tooltip)">
						<BaseSelect.Popup className="w-(--anchor-width) min-w-(--anchor-width) overflow-hidden rounded border border-surface-2 bg-surface-1 shadow-md">
							<BaseSelect.List className="max-h-72 overflow-y-auto p-1">
								{options.map((option) => (
									<BaseSelect.Item
										key={option.value}
										value={option.value}
										className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-base text-foreground outline-none data-highlighted:bg-surface-2"
									>
										<BaseSelect.ItemText className="min-w-0 flex-1">{option.label}</BaseSelect.ItemText>
										<BaseSelect.ItemIndicator className="shrink-0 text-foreground">
											<Check size={16} />
										</BaseSelect.ItemIndicator>
									</BaseSelect.Item>
								))}
							</BaseSelect.List>
						</BaseSelect.Popup>
					</BaseSelect.Positioner>
				</BaseSelect.Portal>
			</BaseSelect.Root>
			{hasError && (
				<div className="flex items-center bg-error text-error-foreground py-(--space-sm) px-(--space-xs) rounded-b-sm [&_svg]:max-h-(--space-md)">
					<Icon name="warning" />
					{error}
				</div>
			)}
		</div>
	);
};

export default Select;
