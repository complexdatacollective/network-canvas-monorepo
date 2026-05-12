/* eslint-disable react/jsx-props-no-spreading */

import { memo, useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";

type TextInputProps = {
	input?: {
		name?: string;
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
		onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
		onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
		[key: string]: unknown;
	};
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	placeholder?: string | number;
	fieldLabel?: string | null;
	className?: string;
	type?: "text" | "number" | "search";
	autoFocus?: boolean;
	hidden?: boolean;
	adornmentLeft?: React.ReactNode;
	adornmentRight?: React.ReactNode;
};

const TextInput = ({
	input = {},
	meta = {},
	label = null,
	placeholder = "Enter some text...",
	fieldLabel = null,
	className = "",
	type = "text",
	autoFocus: _autoFocus = false,
	hidden = false,
	adornmentLeft = null,
	adornmentRight = null,
}: TextInputProps) => {
	const { error, invalid, touched } = meta;
	const id = useRef(uuid());

	const hasLeftAdornment = !!adornmentLeft;
	const hasRightAdornment = !!adornmentRight;
	const hasError = !!(invalid && touched && error);

	const anyLabel = fieldLabel || label;

	return (
		<div className="form-field-container" hidden={hidden}>
			{anyLabel && (
				<h4>
					<MarkdownLabel label={anyLabel} />
				</h4>
			)}
			<div className={cx("group relative", className)}>
				<input
					id={id.current}
					name={input.name}
					className={cx(
						"form-field placeholder:italic",
						"group-hover:border-b-input-active focus:border-b-input-active",
						hasLeftAdornment && "pl-[3.25em]",
						hasRightAdornment && "pr-[3.25em]",
						hasError && "border-2 border-error rounded-b-none",
					)}
					placeholder={placeholder?.toString()}
					type={type}
					{...input}
				/>
				{adornmentLeft && (
					<div className="absolute inset-y-0 left-[1em] flex w-[1.5em] items-center justify-center transition-all duration-(--animation-duration-fast) ease-(--animation-easing)">
						{adornmentLeft}
					</div>
				)}
				{adornmentRight && (
					<div className="absolute inset-y-0 right-[1em] flex w-[1.5em] items-center justify-center transition-all duration-(--animation-duration-fast) ease-(--animation-easing)">
						{adornmentRight}
					</div>
				)}
				{hasError && (
					<div className="flex items-center bg-error text-error-foreground py-(--space-sm) px-(--space-xs) rounded-b-sm [&_svg]:max-h-(--space-md)">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

export default memo(TextInput);
