/* eslint-disable react/jsx-props-no-spreading */

import BooleanToggle from "~/lib/legacy-ui/components/Boolean/Boolean";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";

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
	input: {
		name: string;
		value: BooleanValue;
		onChange: (value: BooleanValue) => void;
	};
	disabled?: boolean;
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
	input,
	disabled: _disabled = false,
	options = [
		{ label: "Yes", value: true },
		{ label: "No", value: false, negative: true },
	],
	meta = {},
}: BooleanFieldProps) => {
	const { error, invalid, touched } = meta;
	const hasError = !!(invalid && touched && error);

	const anyLabel = fieldLabel || label;

	return (
		<div
			className={cx(
				"mb-(--space-xl) [&>h4]:m-0",
				hasError && "[&_.form-field]:mb-0 [&_.form-field]:border-2 [&_.form-field]:border-error",
				className,
			)}
		>
			{anyLabel && <MarkdownLabel label={anyLabel} />}
			<div>
				<BooleanToggle
					options={options as Parameters<typeof BooleanToggle>[0]["options"]}
					value={input.value as boolean | null}
					onChange={input.onChange as (value: boolean | null) => void}
					noReset={noReset}
				/>
				{hasError && (
					<div className="flex items-center bg-error text-foreground py-(--space-sm) px-(--space-xs) [&_svg]:max-h-(--space-md)">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default BooleanField;
