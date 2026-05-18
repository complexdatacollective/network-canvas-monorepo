/* eslint-disable react/jsx-props-no-spreading */

import { useRef } from "react";
import { v4 as uuid } from "uuid";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import MarkdownLabel from "./MarkdownLabel";

type TextAreaProps = {
	input?: {
		name?: string;
		value?: string;
		onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
		[key: string]: unknown;
	};
	meta?: {
		active?: boolean;
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	label?: string | null;
	fieldLabel?: string | null;
	className?: string;
	variant?: "default" | "embedded";
	placeholder?: string;
	hidden?: boolean;
};

const TextArea = ({
	input = {},
	meta = {},
	label = null,
	fieldLabel = null,
	className = "",
	variant = "default",
	placeholder = "",
	hidden = false,
}: TextAreaProps) => {
	const id = useRef(uuid());

	const { error, invalid, touched } = meta;
	const hasError = !!(invalid && touched && error);

	return (
		<label htmlFor={id.current} className="block m-0 w-full [&>h4]:m-0" hidden={hidden}>
			{(fieldLabel || label) && <MarkdownLabel label={fieldLabel || label || ""} />}
			<div className={cx("group relative", className)}>
				<textarea
					id={id.current}
					className={cx(
						"form-field placeholder:italic resize-y block",
						"group-hover:border-b-input-active focus:border-b-input-active",
						hasError && "border-2 border-error rounded-b-none",
						variant === "embedded" && "m-0 rounded-(--radius) border-0 pb-(--space-sm)",
					)}
					placeholder={placeholder}
					{...input}
				/>
				{hasError && (
					<div className="flex items-center bg-error text-error-foreground py-(--space-sm) px-(--space-xs) rounded-b-sm [&_svg]:max-h-(--space-md)">
						<Icon name="warning" />
						{error}
					</div>
				)}
			</div>
		</label>
	);
};

export default TextArea;
