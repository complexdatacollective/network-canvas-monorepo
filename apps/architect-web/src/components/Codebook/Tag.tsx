import { cx } from "~/utils/cva";

type TagProps = {
	children?: React.ReactNode;
	notUsed?: boolean;
};

const Tag = ({ children = null, notUsed = false }: TagProps) => (
	<div
		className={cx(
			"inline-block rounded px-(--space-sm) py-(--space-xs) text-[0.9em] text-white wrap-break-word",
			notUsed ? "bg-warning" : "bg-mustard-dark",
		)}
	>
		{children}
	</div>
);

export default Tag;
