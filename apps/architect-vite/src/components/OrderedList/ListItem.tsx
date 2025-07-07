import cx from "classnames";
import { GripVertical, Trash2 } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";

type ListItemProps = React.HTMLAttributes<HTMLDivElement> & {
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
		"bg-accent text-accent-foreground flex rounded p-4 justify-between items-center gap-4 select-none cursor-pointer",
		className,
	);

	return (
		<Reorder.Item
			className={componentClasses}
			value={value}
			dragListener={false}
			dragControls={controls}
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -30 }}
			whileDrag={{ scale: 1.05 }}
			onClick={handleClick}
			{...rest}
		>
			{sortable && (
				<GripVertical className="flex grow-0 shrink-0 cursor-grab" onPointerDown={(e) => controls.start(e)} />
			)}
			<div className="grow-1 shrink-1">{children}</div>
			<Trash2 onClick={handleDelete} />
		</Reorder.Item>
	);
};

export default ListItem;
