import { memo, type ReactNode, useMemo, useRef } from "react";
import { v4 as uuid } from "uuid";
import { BaseField } from "~/components/Form/BaseField";
import {
	controlVariants,
	inputControlVariants,
	interactiveStateVariants,
	multilineContentVariants,
	placeholderVariants,
	stateVariants,
	textSizeVariants,
} from "~/styles/shared/controlVariants";
import { compose, cva, cx } from "~/utils/cva";
import { getInputState } from "~/utils/getInputState";

const textareaWrapperVariants = compose(
	controlVariants,
	inputControlVariants,
	stateVariants,
	interactiveStateVariants,
	cva({ base: cx("h-auto w-full") }),
);

const textareaVariants = compose(
	textSizeVariants,
	multilineContentVariants,
	placeholderVariants,
	cva({
		base: cx(
			"resize-y max-w-full size-full",
			"cursor-[inherit]",
			"[font-size:inherit]",
			"border-none bg-transparent outline-none focus:ring-0",
			"transition-none",
		),
	}),
);

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
	placeholder?: string;
	hidden?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	hint?: ReactNode;
};

const TextArea = ({
	input = {},
	meta = {},
	label = null,
	fieldLabel = null,
	className,
	placeholder = "",
	hidden = false,
	disabled = false,
	readOnly = false,
	required = false,
	hint,
}: TextAreaProps) => {
	const { error, invalid, touched } = meta;
	const idRef = useRef(uuid());
	const id = idRef.current;

	const state = getInputState({ disabled, readOnly, meta });
	const showErrors = Boolean(touched && invalid && error);
	const errors = useMemo(() => (error ? [error] : []), [error]);

	const describedBy =
		[hint ? `${id}-hint` : null, showErrors ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

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
			containerProps={hidden ? { hidden: true } : undefined}
		>
			<div className={cx(textareaWrapperVariants({ state }), className)}>
				<textarea
					{...input}
					id={id}
					placeholder={placeholder}
					disabled={disabled}
					readOnly={readOnly}
					aria-required={required || undefined}
					aria-invalid={showErrors || undefined}
					aria-describedby={describedBy}
					className={textareaVariants()}
				/>
			</div>
		</BaseField>
	);
};

export default memo(TextArea);
