import { type ReactNode, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import BooleanToggle from "~/lib/legacy-ui/components/Boolean/Boolean";
import { cx } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";

type BooleanValue = boolean | string | number | null;

type BooleanOption = {
	label: string | (() => string);
	value: boolean | string | number;
	classes?: string;
	icon?: () => React.ReactNode;
	negative?: boolean;
};

type BooleanFieldProps = {
	label?: string | null;
	fieldLabel?: string | null;
	noReset?: boolean;
	className?: string;
	hint?: ReactNode;
	required?: boolean;
	input: {
		name: string;
		value: BooleanValue;
		onChange: (value: BooleanValue) => void;
	};
	disabled?: boolean;
	readOnly?: boolean;
	options?: BooleanOption[];
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
};

const BooleanField = ({
	label = null,
	fieldLabel = null,
	noReset = false,
	className = "",
	hint,
	required = false,
	input,
	disabled = false,
	readOnly = false,
	options = [
		{ label: "Yes", value: true },
		{ label: "No", value: false, negative: true },
	],
	meta = {},
}: BooleanFieldProps) => {
	const idRef = useRef(uuid());
	const id = idRef.current;

	const { error, invalid, touched } = meta;
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);
	const state = getInputState({ disabled, readOnly, meta });

	const anyLabel = fieldLabel ?? label ?? undefined;

	return (
		<BaseField
			id={id}
			name={input.name}
			label={anyLabel ?? undefined}
			hint={hint}
			required={required}
			errors={errors}
			showErrors={showErrors}
		>
			<fieldset
				aria-labelledby={anyLabel ? `${id}-label` : undefined}
				aria-invalid={showErrors || undefined}
				className={cx("w-full border-0 p-0", className)}
				data-state={state}
				disabled={disabled}
			>
				<BooleanToggle
					options={options as Parameters<typeof BooleanToggle>[0]["options"]}
					value={input.value as boolean | null}
					onChange={input.onChange as (value: boolean | null) => void}
					noReset={noReset}
				/>
			</fieldset>
		</BaseField>
	);
};

export default BooleanField;
