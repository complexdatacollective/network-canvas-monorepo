declare module "react-select" {
	import type { ComponentType, ReactNode } from "react";

	export type OptionProps<Option = unknown> = {
		data: Option;
		innerRef?: (element: HTMLElement | null) => void;
		innerProps: Record<string, unknown>;
		children?: ReactNode;
		label?: string;
		isFocused: boolean;
		isSelected: boolean;
		isDisabled: boolean;
	};

	export type StylesConfig<Option = unknown> = {
		menuPortal?: (base: Record<string, unknown>) => Record<string, unknown>;
		[key: string]: ((base: Record<string, unknown>) => Record<string, unknown>) | undefined;
	};

	export type SelectProps<Option = unknown, IsMulti extends boolean = false> = {
		options?: Option[];
		value?: Option | Option[] | null;
		onChange?: (option: Option | null) => void;
		onBlur?: () => void;
		className?: string;
		classNamePrefix?: string;
		components?: {
			Option?: ComponentType<OptionProps<Option>>;
			[key: string]: ComponentType<unknown> | undefined;
		};
		styles?: StylesConfig<Option>;
		menuPortalTarget?: HTMLElement | null;
		blurInputOnSelect?: boolean;
		placeholder?: string;
		isDisabled?: boolean;
		isMulti?: IsMulti;
		isClearable?: boolean;
		isSearchable?: boolean;
		[key: string]: unknown;
	};

	const Select: ComponentType<SelectProps<unknown, boolean>>;
	export default Select;
}
