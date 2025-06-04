import cx from "classnames";
import { motion } from "motion/react";
import DeleteButton from "./DeleteButton";
import Handle from "./Handle";

type ListItemProps = {
	children?: React.ReactNode;
	onDelete: () => void;
	onClick?: () => void;
	className?: string;
	sortable?: boolean;
};

const ListItem = ({ children = null, onDelete, onClick = null, className = null, sortable = true }: ListItemProps) => {
	const componentClasses = cx("list-item", { "list-item--clickable": onClick }, className);

	return (
		<motion.div className={componentClasses}>
			{sortable && (
				<div className="list-item__control list-item__control--left" key="handle">
					<Handle />
				</div>
			)}
			<div className="list-item__content" onClick={onClick} key="content">
				{children}
			</div>
			<div className="list-item__control list-item__control--right" key="controls">
				<DeleteButton onDelete={onDelete} />
			</div>
		</motion.div>
	);
};


export default ListItem;
