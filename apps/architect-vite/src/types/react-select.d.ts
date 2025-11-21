declare module "react-select" {
	import type { ComponentType, ReactNode } from "react";

	export type SelectOption = {
		value: unknown;
		label?: string;
		[key: string]: unknown;
	};

	export type SelectProps = {
		className?: string;
		classNamePrefix?: string;
		options?: SelectOption[];
		value?: SelectOption | SelectOption[] | null;
		defaultValue?: SelectOption | SelectOption[] | null;
		onChange?: (value: SelectOption | SelectOption[] | null) => void;
		onBlur?: (value: unknown) => void;
		onFocus?: () => void;
		isMulti?: boolean;
		isDisabled?: boolean;
		isLoading?: boolean;
		isClearable?: boolean;
		isSearchable?: boolean;
		placeholder?: string;
		name?: string;
		inputValue?: string;
		onInputChange?: (value: string) => void;
		menuIsOpen?: boolean;
		menuPortalTarget?: HTMLElement | null;
		blurInputOnSelect?: boolean;
		closeMenuOnSelect?: boolean;
		components?: {
			Option?: ComponentType<{ data: SelectOption; [key: string]: unknown }>;
			[key: string]: ComponentType<unknown> | undefined;
		};
		styles?: {
			[key: string]: (base: Record<string, unknown>) => Record<string, unknown>;
		};
		children?: ReactNode;
		[key: string]: unknown;
	};

	const ReactSelect: ComponentType<SelectProps>;
	export default ReactSelect;
}
