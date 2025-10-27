import cx from "classnames";
import { GripVertical, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import type { ComponentProps } from "react";

type ListItemProps = ComponentProps<typeof Reorder.Item> & {
	handleDelete: () => void;
	handleClick: () => void;
	sortable?: boolean;
	value: string | number | Record<string, unknown>;
	className?: string | null;
};

const ListItem = ({
	children,
	handleDelete,
	handleClick,
	className,
	sortable = true,
	value,
	...rest
}: ListItemProps) => {
	const controls = useDragControls();

	const componentClasses = cx(
		"bg-accent text-accent-foreground flex rounded px-4 justify-between items-center gap-4 select-none cursor-pointer shadow",
		className,
	);

	return (
		<Reorder.Item
			className={componentClasses}
			value={value}
			dragListener={false}
			dragControls={controls}
			onClick={handleClick}
			{...rest}
		>
			{sortable && (
				<GripVertical className="flex grow-0 shrink-0 cursor-grab" onPointerDown={(e) => controls.start(e)} />
			)}
			<div className="grow-1 shrink-1">{children}</div>
			<Trash2
				onClick={(e) => {
					e.stopPropagation();
					handleDelete();
				}}
			/>
		</Reorder.Item>
	);
};

export default ListItem;
