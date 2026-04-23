import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "~/utils/cva";
import { FieldErrors } from "./FieldErrors";
import { FieldLabel } from "./FieldLabel";
import { Hint } from "./Hint";

type BaseFieldProps = {
	id: string;
	name?: string;
	label?: string;
	hint?: ReactNode;
	validationSummary?: ReactNode;
	required?: boolean;
	errors?: string[];
	showErrors?: boolean;
	inline?: boolean;
	children: ReactNode;
	containerProps?: Omit<HTMLAttributes<HTMLDivElement>, "className" | "id">;
};

export function BaseField({
	id,
	name,
	label,
	hint,
	validationSummary,
	required = false,
	errors = [],
	showErrors = false,
	inline = false,
	children,
	containerProps,
}: BaseFieldProps) {
	return (
		<div
			{...containerProps}
			className={cx(
				"group w-full grow not-last:mb-6",
				"tablet-landscape:not-last:mb-8 desktop:not-last:mb-10",
				"flex flex-col",
			)}
		>
			<div
				className={cx(
					"flex flex-col",
					inline &&
						"tablet-portrait:flex-row tablet-portrait:items-center tablet-portrait:justify-between tablet-portrait:gap-4 tablet-portrait:align-middle",
				)}
			>
				<div className={cx(inline ? "min-w-0" : "mb-4")}>
					{label && (
						<FieldLabel id={`${id}-label`} htmlFor={id} required={required}>
							{label}
						</FieldLabel>
					)}
					{(hint ?? validationSummary) && (
						<Hint id={`${id}-hint`}>
							{hint}
							{validationSummary}
						</Hint>
					)}
				</div>
				<div className={cx(inline && "shrink-0")}>{children}</div>
			</div>
			<FieldErrors id={`${id}-error`} name={name} errors={errors} show={showErrors} />
		</div>
	);
}
