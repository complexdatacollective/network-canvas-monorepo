import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type HintProps = {
	id: string;
	children: ReactNode;
	className?: string;
};

export function Hint({ id, children, className }: HintProps) {
	if (children == null || children === false) return null;
	return (
		<p id={id} className={cx("text-sm text-text/70 leading-normal mt-1", className)}>
			{children}
		</p>
	);
}
