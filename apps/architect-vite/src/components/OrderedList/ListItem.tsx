import cx from "classnames";
import { GripVertical, Trash2 } from "lucide-react";
import { motion, Reorder, useDragControls } from "motion/react";
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
		"group",
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
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			key={value}
			{...rest}
		>
			{sortable && (
				<motion.div layout>
					<GripVertical className="flex grow-0 shrink-0 cursor-grab" onPointerDown={(e) => controls.start(e)} />
				</motion.div>
			)}
			<motion.div layout className="grow-1 shrink-1">
				{children}
			</motion.div>
			<motion.div
				layout
				className="opacity-0 transition-all duration-200 cursor-pointer group-hover:opacity-100 hover:bg-tomato rounded-full p-2 grow-0 shrink-0 h-10 aspect-square"
			>
				<Trash2
					onClick={(e) => {
						e.stopPropagation();
						handleDelete();
					}}
				/>
			</motion.div>
		</Reorder.Item>
	);
};

export default ListItem;
