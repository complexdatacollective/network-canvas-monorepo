import type { ReactNode } from "react";
import { cx } from "~/utils/cva";

type SectionFrameProps = {
	title: string;
	children: ReactNode;
	wrapperClassName?: string;
	contentClassName?: string;
};

const SectionFrame = ({ title, children, wrapperClassName, contentClassName }: SectionFrameProps) => (
	<div className={cx("mb-(--space-xl) last:mb-0", wrapperClassName)}>
		<div
			className={cx(
				"relative rounded border-2 border-platinum px-(--space-md) pt-(--space-xl) pb-(--space-sm)",
				contentClassName,
			)}
		>
			<h2 className="absolute top-0 left-0 m-0 w-full bg-platinum px-(--space-md) py-(--space-sm) font-semibold text-xs uppercase tracking-widest">
				{title}
			</h2>
			{children}
		</div>
	</div>
);

export default SectionFrame;
