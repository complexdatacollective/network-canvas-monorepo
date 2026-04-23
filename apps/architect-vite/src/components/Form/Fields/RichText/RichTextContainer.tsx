import type { ReactNode } from "react";
import { useFocused } from "slate-react";
import {
	controlVariants,
	inputControlVariants,
	interactiveStateVariants,
	stateVariants,
} from "~/styles/shared/controlVariants";
import { compose, cva, cx } from "~/utils/cva";
import type { InputState } from "~/utils/getInputState";

const containerVariants = compose(
	controlVariants,
	inputControlVariants,
	stateVariants,
	interactiveStateVariants,
	cva({
		base: cx("flex h-auto w-full flex-col"),
	}),
);

type RichTextContainerProps = {
	children: ReactNode;
	state: InputState;
	className?: string;
};

const RichTextContainer = ({ children, state, className }: RichTextContainerProps) => {
	const focused = useFocused();
	return (
		<div
			className={cx(containerVariants({ state }), focused && "focus-styles", className)}
			data-focused={focused || undefined}
		>
			{children}
		</div>
	);
};

export default RichTextContainer;
