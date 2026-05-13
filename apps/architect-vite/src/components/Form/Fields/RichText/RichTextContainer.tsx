import type { ReactNode } from "react";
import { useFocused } from "slate-react";
import { cx } from "~/utils/cva";

type RichTextContainerProps = {
	children: ReactNode;
	hasError?: boolean;
};

const RichTextContainer = ({ children, hasError = false }: RichTextContainerProps) => {
	const focused = useFocused();

	return (
		<div
			data-active={focused ? "" : undefined}
			className={cx(
				"group rounded-t-sm overflow-hidden bg-input",
				hasError ? "border-2 border-error" : "border border-border",
			)}
		>
			{children}
		</div>
	);
};

export default RichTextContainer;
