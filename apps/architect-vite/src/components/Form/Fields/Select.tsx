import { type ReactNode, useMemo, useRef } from "react";
import ReactSelect, {
	type ActionMeta,
	type OptionProps,
	components as reactSelectComponents,
	type ValueType,
} from "react-select";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import {
	controlVariants,
	dropdownItemVariants,
	heightVariants,
	inlineSpacingVariants,
	inputControlVariants,
	interactiveStateVariants,
	stateVariants,
	textSizeVariants,
	wrapperPaddingVariants,
} from "~/styles/shared/controlVariants";
import { compose, cva, cx } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";

const selectWrapperVariants = compose(
	heightVariants,
	textSizeVariants,
	controlVariants,
	inputControlVariants,
	inlineSpacingVariants,
	wrapperPaddingVariants,
	stateVariants,
	interactiveStateVariants,
	cva({
		base: cx(
			"max-w-full min-w-0 w-full px-0!",
			// react-select renders its own Control/ValueContainer/Input chain; flatten
			// those surfaces so the outer wrapper's padding/height drives layout.
			"[&_.form-fields-select__control]:size-full [&_.form-fields-select__control]:min-h-0 [&_.form-fields-select__control]:cursor-pointer",
			"[&_.form-fields-select__value-container]:tablet-landscape:px-6 [&_.form-fields-select__value-container]:px-4 [&_.form-fields-select__value-container]:py-0",
			"[&_.form-fields-select__single-value]:text-input-contrast [&_.form-fields-select__single-value]:m-0",
			"[&_.form-fields-select__placeholder]:text-input-contrast/50 [&_.form-fields-select__placeholder]:italic",
			"[&_.form-fields-select__input-container]:text-input-contrast [&_.form-fields-select__input-container]:m-0 [&_.form-fields-select__input-container]:p-0",
			"[&_.form-fields-select__input]:text-input-contrast",
			"[&_.form-fields-select__indicator-separator]:hidden",
			"[&_.form-fields-select__indicator]:text-input-contrast",
		),
	}),
);

// react-select portals the menu, so wrapper selectors don't apply. These class
// strings are handed to custom Menu/MenuList components via typed className props.
const menuClasses = cx(
	"elevation-high rounded-sm border-2 border-transparent",
	"bg-surface-popover text-surface-popover-contrast",
	"overflow-hidden",
);

const menuListClasses = cx("p-1 max-h-96 overflow-auto");

type SelectOption = {
	value: unknown;
	label?: string;
	__createNewOption__?: boolean;
};

// react-select v3 has no `classNames` prop (introduced in v5). Custom Option
// delivers Tailwind classes via the shared dropdownItemVariants, mapped from
// react-select's boolean state props to data attributes the variant expects.
const CustomOption = (props: OptionProps<SelectOption, false>) => {
	const { isSelected, isFocused, isDisabled, innerProps, innerRef, children } = props;
	return (
		<div
			ref={innerRef}
			{...innerProps}
			data-selected={isSelected || undefined}
			data-highlighted={isFocused || undefined}
			data-disabled={isDisabled || undefined}
			className={cx(dropdownItemVariants(), "text-base")}
		>
			{children}
		</div>
	);
};

// Menu is portaled outside the wrapper, so selectors on the wrapper don't reach
// it. Wrapping the default Menu in an outer div gives us an owned surface for
// Tailwind popover styling while keeping react-select's positioning logic.
const CustomMenu = (props: React.ComponentProps<typeof reactSelectComponents.Menu>) => (
	<reactSelectComponents.Menu {...props}>
		<div className={menuClasses}>{props.children}</div>
	</reactSelectComponents.Menu>
);

const CustomMenuList = (props: React.ComponentProps<typeof reactSelectComponents.MenuList>) => (
	<reactSelectComponents.MenuList {...props}>
		<div className={menuListClasses}>{props.children}</div>
	</reactSelectComponents.MenuList>
);

type SelectProps = {
	className?: string;
	options?: SelectOption[];
	selectOptionComponent?: React.ComponentType<OptionProps<SelectOption, false>>;
	onDeleteOption?: (() => void) | null;
	createNewOption?: boolean;
	onCreateNew?: (() => void) | null;
	input?: {
		value: unknown;
		onChange: (value: unknown) => void;
		onBlur?: (value: unknown) => void;
		name?: string;
		[key: string]: unknown;
	};
	label?: string | null;
	fieldLabel?: string | null;
	placeholder?: string;
	children?: React.ReactNode;
	meta?: {
		invalid?: boolean;
		error?: string | null;
		touched?: boolean;
	};
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: ReactNode;
};

const getValue = (options: SelectOption[], value: unknown) => {
	const foundValue = options.find((option) => option.value === value);
	if (!foundValue) {
		return null;
	}
	return foundValue;
};

const Select = ({
	className,
	input,
	options = [],
	children,
	selectOptionComponent,
	label = null,
	fieldLabel = null,
	placeholder,
	createNewOption = false,
	onCreateNew = null,
	meta = {},
	disabled = false,
	readOnly = false,
	required = false,
	hint,
	onDeleteOption: _onDeleteOption,
	...rest
}: SelectProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;

	const { invalid = false, error = null, touched = false } = meta;

	const state = getInputState({ disabled, readOnly, meta: { touched, invalid } });
	const showErrors = Boolean(invalid && touched && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	if (!input) return null;

	const { onBlur, onChange, value, name, ...inputRest } = input;

	const describedBy =
		[hint ? `${id}-hint` : null, showErrors ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

	const anyLabel = fieldLabel ?? label ?? undefined;

	const optionsWithNew: SelectOption[] = createNewOption
		? [...options, { value: null, __createNewOption__: true }]
		: options;

	const selectedValue = getValue(options, value);

	const handleChange = (newValue: ValueType<SelectOption, false>, _actionMeta: ActionMeta<SelectOption>) => {
		if (!newValue) return;
		if (newValue.__createNewOption__) {
			onCreateNew?.();
			return;
		}
		onChange(newValue.value);
	};

	const handleBlur = () => {
		if (!onBlur) return;
		onBlur(value);
	};

	const customComponents = {
		Option: selectOptionComponent ?? CustomOption,
		Menu: CustomMenu,
		MenuList: CustomMenuList,
	};

	return (
		<BaseField
			id={id}
			name={name}
			label={anyLabel ?? undefined}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<div className={cx(selectWrapperVariants({ state }), className)}>
				<ReactSelect
					inputId={id}
					className="size-full"
					classNamePrefix="form-fields-select"
					aria-invalid={showErrors || undefined}
					aria-required={required || undefined}
					aria-describedby={describedBy}
					{...(inputRest as Record<string, unknown>)}
					name={name}
					options={optionsWithNew}
					value={selectedValue}
					placeholder={placeholder}
					isDisabled={disabled || readOnly}
					components={customComponents}
					// React-select paints its own surfaces via emotion; zero them out so
					// theme tokens applied via Tailwind classes can take over. The portaled
					// menu keeps its positioning but delegates appearance to the class
					// strings attached through form-fields-select__menu / __menu-list.
					styles={{
						control: (base) => ({ ...base, border: 0, boxShadow: "none", backgroundColor: "transparent" }),
						menu: (base) => ({ ...base, backgroundColor: "transparent", boxShadow: "none", margin: 0 }),
						menuList: (base) => ({ ...base, padding: 0 }),
						menuPortal: (base) => ({ ...base, zIndex: 9999 }),
						option: () => ({}),
					}}
					menuPortalTarget={document.body}
					onChange={handleChange}
					// ReactSelect has unusual onBlur that doesn't play nicely with redux-forms
					// https://github.com/erikras/redux-form/issues/82#issuecomment-386108205
					// Sending the old value on blur, and disabling blurInputOnSelect work in
					// a round about way, and still allow us to use the `touched` property.
					onBlur={handleBlur}
					blurInputOnSelect={false}
					{...(rest as Record<string, unknown>)}
				>
					{children}
				</ReactSelect>
			</div>
		</BaseField>
	);
};

export default Select;
