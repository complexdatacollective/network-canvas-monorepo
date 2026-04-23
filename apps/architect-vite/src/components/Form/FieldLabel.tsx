import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type FieldLabelProps = {
	id: string;
	htmlFor: string;
	required?: boolean;
	children: ReactNode;
	className?: string;
};

export function FieldLabel({ id, htmlFor, required = false, children, className }: FieldLabelProps) {
	return (
		<label
			id={id}
			htmlFor={htmlFor}
			className={cx("block text-base leading-normal font-medium text-text", "mb-2", className)}
		>
			{children}
			{required && (
				<>
					<span className="text-destructive ml-1" aria-hidden="true">
						*
					</span>
					<span className="sr-only"> (required)</span>
				</>
			)}
		</label>
	);
}
